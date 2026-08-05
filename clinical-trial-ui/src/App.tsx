// Main application component for the clinical trial UI.
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, AlertTriangle,
  XCircle, FileText, Download, Clock, FlaskConical, User,
  Activity, TrendingUp, ClipboardList, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs))
}

// ─── API base ─────────────────────────────────────────────────────────────────
// In local dev: Vite proxies /api/* → http://localhost:8000 (see vite.config.ts)
// In production (Vercel): VITE_API_URL is set to the Render backend URL,
//   e.g. https://clinical-trial-api.onrender.com
// The trailing slash is stripped so every fetch path can start with /

const API = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

// ─── Types matching the real backend response shapes ─────────────────────────

interface LabResult {
  test: string
  value: number
  unit: string
  date: string | null
  source_id: string
}

interface PatientSummary {
  patient_id: string
  name: string
  age: number
  gender: string
  conditions: string[]
  medications: string[]
  lab_results: LabResult[]
  as_of_date: string
}

interface Evidence {
  text: string
  source: string
  relevance_score: number
  retrieved_from: 'patient' | 'trial'
  evidence_id: string
  date: string
}

interface CriterionEvaluation {
  criterion_id: string
  status: string          // SUPPORTED | NOT_SUPPORTED | UNKNOWN | CONFLICTING_EVIDENCE | REQUIRES_CLINICAL_REVIEW
  reasoning: string
  evidence_used: Evidence[]
  confidence: number      // 0.0–1.0
  evaluator_type: string
  unanswered_questions: string[]
}

interface TrialRanking {
  trial_id: string
  title: string
  clinical_fit: string    // same CriterionStatus values
  is_recruiting: boolean
  score: number
  supported_count: number
  not_supported_count: number
  unknown_count: number
  conflicting_count: number
  review_count: number
  total_criteria: number
  requires_human_review: boolean
  reason_surfaced: string
}

interface ScreenResult {
  patient: {
    id: string
    age: number
    gender: string
    conditions: string[]
    medications: string[]
    lab_results: LabResult[]
    medical_history: string
  }
  ranked_trials: TrialRanking[]
  evaluations: Record<string, CriterionEvaluation[]>
  filter_reasons: Record<string, string>
  report_markdown: string | null
  report_data: Record<string, unknown> | null
  trace_id: string
  run_timestamp: string
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type UIStatus = 'supported' | 'not_supported' | 'unknown' | 'conflicting' | 'review'

function toUIStatus(raw: string): UIStatus {
  switch (raw.toUpperCase()) {
    case 'SUPPORTED':                return 'supported'
    case 'NOT_SUPPORTED':            return 'not_supported'
    case 'UNKNOWN':                  return 'unknown'
    case 'CONFLICTING_EVIDENCE':     return 'conflicting'
    case 'REQUIRES_CLINICAL_REVIEW': return 'review'
    default:                         return 'unknown'
  }
}

function statusLabel(raw: string): string {
  switch (raw.toUpperCase()) {
    case 'SUPPORTED':                return 'Supported'
    case 'NOT_SUPPORTED':            return 'Not Supported'
    case 'UNKNOWN':                  return 'Unknown'
    case 'CONFLICTING_EVIDENCE':     return 'Conflicting'
    case 'REQUIRES_CLINICAL_REVIEW': return 'Needs Review'
    default:                         return raw
  }
}

function fitLabel(raw: string): string {
  switch (raw.toUpperCase()) {
    case 'SUPPORTED':                return '✅ Likely eligible'
    case 'NOT_SUPPORTED':            return '❌ Likely ineligible'
    case 'UNKNOWN':                  return '❓ Insufficient data'
    case 'CONFLICTING_EVIDENCE':     return '⚡ Conflicting evidence'
    case 'REQUIRES_CLINICAL_REVIEW': return '🔍 Requires clinical review'
    default:                         return raw
  }
}

function fitBadgeVariant(raw: string): 'green' | 'red' | 'yellow' | 'gray' {
  switch (raw.toUpperCase()) {
    case 'SUPPORTED':     return 'green'
    case 'NOT_SUPPORTED': return 'red'
    default:              return 'yellow'
  }
}

// Find the most informative lab result for a given type keyword
function findLab(labs: LabResult[], keyword: string): string {
  const hit = labs.find(l => l.test.toLowerCase().includes(keyword.toLowerCase()))
  return hit ? `${hit.value} ${hit.unit}` : '—'
}

// ─── Small Reusable Components ────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-100 shadow-sm', className)}>
      {children}
    </div>
  )
}

function Badge({ children, variant = 'default' }: {
  children: React.ReactNode
  variant?: 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'gray'
}) {
  const styles: Record<string, string> = {
    default: 'bg-slate-100 text-slate-700',
    green:   'bg-emerald-50 text-emerald-700',
    yellow:  'bg-amber-50 text-amber-700',
    red:     'bg-red-50 text-red-600',
    blue:    'bg-blue-50 text-blue-700',
    gray:    'bg-slate-50 text-slate-500',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', styles[variant])}>
      {children}
    </span>
  )
}

function StatusIcon({ status }: { status: UIStatus }) {
  if (status === 'supported')    return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
  if (status === 'not_supported') return <XCircle      className="w-4 h-4 text-red-500 flex-shrink-0" />
  return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
}

function ConfidenceBar({ value }: { value: number }) {
  // value is 0–1 from backend
  const pct   = Math.round(value * 100)
  const color = pct >= 90 ? 'bg-emerald-400' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ─── Trial Card ───────────────────────────────────────────────────────────────

function TrialCard({ ranking, evaluations, index }: {
  ranking: TrialRanking
  evaluations: CriterionEvaluation[]
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  const uiStatus = toUIStatus(ranking.clinical_fit)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
    >
      <Card className="overflow-hidden">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-mono text-slate-400">{ranking.trial_id}</span>
                <Badge variant={ranking.is_recruiting ? 'green' : 'red'}>
                  {ranking.is_recruiting ? 'Recruiting' : 'Not Recruiting'}
                </Badge>
              </div>
              <h3 className="font-semibold text-slate-800 leading-tight">{ranking.title}</h3>
            </div>
            <Badge variant={fitBadgeVariant(ranking.clinical_fit)}>
              {fitLabel(ranking.clinical_fit)}
            </Badge>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {ranking.supported_count}/{ranking.total_criteria} Supported
            </span>
            {ranking.not_supported_count > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <XCircle className="w-3.5 h-3.5" />
                {ranking.not_supported_count} Not Supported
              </span>
            )}
            {(ranking.unknown_count + ranking.review_count + ranking.conflicting_count) > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5" />
                {ranking.unknown_count + ranking.review_count + ranking.conflicting_count} Review/Unknown
              </span>
            )}
            {ranking.requires_human_review && (
              <Badge variant="yellow">Human Review Required</Badge>
            )}
            <span className="text-xs text-slate-400 font-mono">score: {ranking.score.toFixed(3)}</span>
          </div>

          {/* Reason surfaced */}
          {ranking.reason_surfaced && (
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">{ranking.reason_surfaced}</p>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            {expanded
              ? <><ChevronUp className="w-4 h-4" /> Hide Details</>
              : <><ChevronDown className="w-4 h-4" /> View Details</>}
          </button>
        </div>

        {/* Expanded: Criteria + Evidence */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-slate-100 bg-slate-50/60">
                {evaluations.length > 0 ? (
                  <>
                    {/* Criteria list */}
                    <div className="p-5">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Eligibility Criteria
                      </h4>
                      <div className="space-y-2">
                        {evaluations.map(ev => (
                          <div key={ev.criterion_id} className="flex items-center gap-2 bg-white rounded-xl border border-slate-100 px-3 py-2">
                            <StatusIcon status={toUIStatus(ev.status)} />
                            <span className="text-xs font-mono text-slate-500 w-20 flex-shrink-0">{ev.criterion_id}</span>
                            <span className="text-sm text-slate-600 flex-1 truncate">{ev.reasoning}</span>
                            <Badge variant={
                              toUIStatus(ev.status) === 'supported'     ? 'green'  :
                              toUIStatus(ev.status) === 'not_supported' ? 'red'    : 'yellow'
                            }>
                              {statusLabel(ev.status)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Evidence panel */}
                    <div className="px-5 pb-5">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Evidence Panel
                      </h4>
                      <div className="space-y-3">
                        {evaluations.map(ev => (
                          <div key={'ev-' + ev.criterion_id} className="bg-white rounded-xl border border-slate-100 p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <StatusIcon status={toUIStatus(ev.status)} />
                                <span className="text-sm font-semibold text-slate-700">{ev.criterion_id}</span>
                                <span className="text-xs text-slate-400">via {ev.evaluator_type}</span>
                              </div>
                              <span className="text-xs font-mono text-slate-400">{statusLabel(ev.status)}</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed mb-2">{ev.reasoning}</p>
                            <ConfidenceBar value={ev.confidence} />
                            {ev.evidence_used.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-100">
                                <p className="text-xs text-slate-400 mb-1">Evidence IDs</p>
                                <div className="flex flex-wrap gap-1">
                                  {ev.evidence_used.map((e, i) => (
                                    <span key={i} className="text-xs font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">
                                      {e.evidence_id || e.source}{e.date ? ` (${e.date})` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {ev.unanswered_questions.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-100">
                                <p className="text-xs text-amber-600 font-medium mb-1">Unanswered Questions</p>
                                <ul className="space-y-0.5">
                                  {ev.unanswered_questions.map((q, i) => (
                                    <li key={i} className="text-xs text-slate-500">• {q}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="p-5 text-sm text-slate-400 italic">No criterion evaluations available.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

// ─── Workflow Steps Animation ─────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { label: 'Patient loaded',              step: 'filter_node' },
  { label: 'Filtering trials',            step: 'filter_node' },
  { label: 'Retrieving evidence',         step: 'retrieval_node' },
  { label: 'Evaluating eligibility',      step: 'evaluation_node' },
  { label: 'Ranking top 3 trials',        step: 'ranking_node' },
  { label: 'Generating report',           step: 'report_node' },
]

function WorkflowAnimation({ currentStep }: { currentStep: number }) {
  return (
    <Card className="p-8 max-w-md mx-auto">
      <div className="flex items-center justify-center gap-2 mb-6">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <h2 className="text-base font-semibold text-slate-700">Running AI Screening…</h2>
      </div>
      <div className="space-y-3">
        {WORKFLOW_STEPS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, x: -16 }}
            animate={i <= currentStep ? { opacity: 1, x: 0 } : { opacity: 0.25, x: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-3"
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {i < currentStep ? (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </motion.div>
              ) : i === currentStep ? (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              ) : (
                <Circle className="w-5 h-5 text-slate-300" />
              )}
            </div>
            <span className={cn('text-sm', i <= currentStep ? 'text-slate-700 font-medium' : 'text-slate-400')}>
              {s.label}
            </span>
          </motion.div>
        ))}
      </div>
    </Card>
  )
}

// ─── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ result }: { result: ScreenResult }) {
  const patientId = result.patient.id

  const handleDownloadMd = async () => {
    const res = await fetch(`${API}/report/${patientId}/markdown`)
    if (!res.ok) { alert('No Markdown report found — run screening first.'); return }
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/markdown' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${patientId}_report.md`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPdf = async () => {
    try {
      const res = await fetch(`${API}/report/${patientId}/pdf`)
      if (!res.ok) {
        alert('Could not download PDF report. Run screening first.')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `${patientId}_report.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`PDF download failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const reviewCount = result.ranked_trials.filter(t => t.requires_human_review).length
  const topTrial    = result.ranked_trials[0]
  const recommendation = topTrial?.clinical_fit?.toUpperCase() === 'SUPPORTED'
    ? `${topTrial.title} (${topTrial.trial_id}) is the top candidate.`
    : 'Review flagged criteria with the treating physician before enrollment.'

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <FileText className="w-4 h-4 text-blue-600" />
        </div>
        <h2 className="font-semibold text-slate-800">Generated Report</h2>
      </div>

      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Patient ID</p>
            <p className="text-sm font-semibold text-slate-800">{patientId}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Run timestamp</p>
            <p className="text-sm font-mono text-slate-700">{new Date(result.run_timestamp).toLocaleString()}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-1">Top Ranked Trials</p>
          <div className="space-y-1">
            {result.ranked_trials.map((t, i) => (
              <div key={t.trial_id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-400 text-xs w-4">{i + 1}.</span>
                <span className="font-medium text-slate-700 flex-1 truncate">{t.title}</span>
                <Badge variant={fitBadgeVariant(t.clinical_fit)}>{fitLabel(t.clinical_fit)}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-0.5">Recommendation</p>
          <p className="text-sm text-slate-700 leading-relaxed">{recommendation}</p>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-0.5">Human Review Notes</p>
          <p className="text-sm text-slate-700">
            {reviewCount > 0
              ? `${reviewCount} trial(s) flagged for physician review.`
              : 'No human review required.'}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-400 mb-0.5">Trace ID</p>
          <p className="text-xs font-mono text-slate-500">{result.trace_id}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleDownloadMd}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" /> Download Markdown
        </button>
        <button
          onClick={handleDownloadPdf}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>
      </div>
    </Card>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { label: 'Patient Selected', icon: User },
  { label: 'Trials Retrieved', icon: FlaskConical },
  { label: 'Criteria Evaluated', icon: ClipboardList },
  { label: 'Report Generated', icon: FileText },
]

function Timeline({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="relative flex items-start justify-between">
      <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200 mx-6" />
      <div
        className="absolute top-4 left-0 h-0.5 bg-blue-500 mx-6 transition-all duration-700"
        style={{ width: `${Math.min(activeIndex / (TIMELINE_STEPS.length - 1), 1) * (100 - (12 / TIMELINE_STEPS.length))}%` }}
      />
      {TIMELINE_STEPS.map((step, i) => {
        const Icon     = step.icon
        const isActive = i <= activeIndex
        return (
          <div key={step.label} className="relative flex flex-col items-center z-10 flex-1">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500',
              isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border-2 border-slate-200 text-slate-400'
            )}>
              <Icon className="w-4 h-4" />
            </div>
            <span className={cn(
              'mt-2 text-xs font-medium text-center leading-tight transition-colors duration-300',
              isActive ? 'text-blue-700' : 'text-slate-400'
            )}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

type AppStage = 'select' | 'loading' | 'results'

export default function App() {
  const [patients, setPatients]       = useState<PatientSummary[]>([])
  const [selectedId, setSelectedId]   = useState<string>('')
  const [stage, setStage]             = useState<AppStage>('select')
  const [workflowStep, setWorkflowStep] = useState(0)
  const [result, setResult]           = useState<ScreenResult | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [loadingPatients, setLoadingPatients] = useState(true)

  // Fetch patients on mount
  useEffect(() => {
    fetch(`${API}/patients`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data: PatientSummary[]) => {
        setPatients(data)
        if (data.length > 0) setSelectedId(data[0].patient_id)
      })
      .catch(e => setError(`Could not load patients: ${e}. Please check if the backend API service is running and accessible.`))
      .finally(() => setLoadingPatients(false))
  }, [])

  const currentPatient = patients.find(p => p.patient_id === selectedId) ?? null

  const handleRun = useCallback(async () => {
    if (!selectedId) return
    setError(null)
    setStage('loading')
    setWorkflowStep(0)

    // Animate the steps while the real pipeline runs in the background.
    // We tick through steps 0–4 at 1 s intervals and hold the last one until
    // the fetch resolves. This gives real-time visual feedback without faking results.
    let step = 0
    const ticker = setInterval(() => {
      step = Math.min(step + 1, WORKFLOW_STEPS.length - 2)  // stop one before last
      setWorkflowStep(step)
    }, 1200)

    try {
      const res = await fetch(`${API}/screen`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ patient_id: selectedId }),
      })
      clearInterval(ticker)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body}`)
      }
      const data: ScreenResult = await res.json()
      setWorkflowStep(WORKFLOW_STEPS.length - 1)
      // Brief pause so the final step visually completes before switching view
      await new Promise(resolve => setTimeout(resolve, 600))
      setResult(data)
      setStage('results')
    } catch (e: unknown) {
      clearInterval(ticker)
      setError(`Screening failed: ${e instanceof Error ? e.message : String(e)}`)
      setStage('select')
    }
  }, [selectedId])

  const handleReset = () => {
    setStage('select')
    setResult(null)
    setError(null)
    setWorkflowStep(0)
  }

  // ── Derived stats from real pipeline output ───────────────────────────────
  const allEvals = result
    ? Object.values(result.evaluations).flat()
    : []
  const supportedCount = allEvals.filter(e => e.status.toUpperCase() === 'SUPPORTED').length
  const reviewCount    = allEvals.filter(e =>
    ['REQUIRES_CLINICAL_REVIEW', 'UNKNOWN', 'CONFLICTING_EVIDENCE'].includes(e.status.toUpperCase())
  ).length
  const topFit         = result?.ranked_trials[0]?.clinical_fit ?? ''
  const recommendation =
    topFit.toUpperCase() === 'SUPPORTED'     ? 'Enroll in Top Trial' :
    topFit.toUpperCase() === 'NOT_SUPPORTED' ? 'Further Assessment Needed' :
                                               'Physician Review Advised'
  const timelineIndex = stage === 'select' ? -1 : stage === 'loading' ? 1 : 3

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-800 text-sm">Clinical Trial Pre-Screening Agent</span>
          </div>
          <div className="flex items-center gap-2">
            {stage === 'results' && (
              <button
                onClick={handleReset}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ← New Screening
              </button>
            )}
            <Badge variant="blue">AI-Powered</Badge>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Patient Selection / Loading ── */}
        <AnimatePresence mode="wait">
          {stage === 'select' && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <Card className="p-6 max-w-lg mx-auto">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <h2 className="font-semibold text-slate-800">Select Patient</h2>
                </div>

                {loadingPatients ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading patients…</span>
                  </div>
                ) : (
                  <>
                    {/* Dropdown */}
                    <div className="relative mb-5">
                      <select
                        value={selectedId}
                        onChange={e => setSelectedId(e.target.value)}
                        className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                      >
                        {patients.map(p => (
                          <option key={p.patient_id} value={p.patient_id}>
                            {p.patient_id}{p.name ? ` — ${p.name}` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Patient Summary — real data from /patients */}
                    {currentPatient && (
                      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 mb-5">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Patient Summary</h3>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                          {[
                            { label: 'Age',    value: `${currentPatient.age} years` },
                            { label: 'Gender', value: currentPatient.gender },
                            { label: 'HbA1c',  value: findLab(currentPatient.lab_results, 'hba1c') },
                            { label: 'eGFR',   value: findLab(currentPatient.lab_results, 'egfr') },
                            { label: 'As of',  value: currentPatient.as_of_date || '—' },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-xs text-slate-400">{label}</p>
                              <p className="text-sm font-semibold text-slate-800">{value}</p>
                            </div>
                          ))}
                        </div>
                        {currentPatient.conditions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs text-slate-400 mb-1.5">Conditions</p>
                            <div className="flex flex-wrap gap-1.5">
                              {currentPatient.conditions.map(c => (
                                <Badge key={c} variant="blue">{c}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {currentPatient.medications.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-xs text-slate-400 mb-1.5">Medications</p>
                            <div className="flex flex-wrap gap-1.5">
                              {currentPatient.medications.map(m => (
                                <Badge key={m} variant="gray">{m}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleRun}
                      disabled={!selectedId}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm shadow-md shadow-blue-200"
                    >
                      <Activity className="w-4 h-4" />
                      Run AI Screening
                    </button>
                  </>
                )}
              </Card>
            </motion.div>
          )}

          {stage === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <WorkflowAnimation currentStep={workflowStep} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        {stage === 'results' && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            {/* Executive Summary */}
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Executive Summary — {result.patient.id}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: TrendingUp,    label: 'Top Trials',          value: String(result.ranked_trials.length), color: 'blue',  small: false },
                  { icon: CheckCircle2, label: 'Supported Criteria',  value: String(supportedCount),              color: 'green', small: false },
                  { icon: AlertTriangle, label: 'Needs Review',        value: String(reviewCount),                 color: 'amber', small: false },
                  { icon: Activity,     label: 'Recommendation',      value: recommendation,                      color: 'blue',  small: true  },
                ].map(({ icon: Icon, label, value, color, small }) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, delay: 0.1 }}
                  >
                    <Card className="p-4">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center mb-2',
                        color === 'green' ? 'bg-emerald-50' : color === 'amber' ? 'bg-amber-50' : 'bg-blue-50'
                      )}>
                        <Icon className={cn(
                          'w-4 h-4',
                          color === 'green' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : 'text-blue-600'
                        )} />
                      </div>
                      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                      <p className={cn('font-bold text-slate-800', small ? 'text-sm leading-tight' : 'text-2xl')}>{value}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Trial Cards */}
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Top {result.ranked_trials.length} Matched Trial{result.ranked_trials.length !== 1 ? 's' : ''}
              </h2>
              {result.ranked_trials.length === 0 ? (
                <Card className="p-6">
                  <p className="text-sm text-slate-500 text-center">No trials matched for this patient after filtering.</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {result.ranked_trials.map((trial, i) => (
                    <TrialCard
                      key={trial.trial_id}
                      ranking={trial}
                      evaluations={result.evaluations[trial.trial_id] ?? []}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Report */}
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Report</h2>
              <ReportCard result={result} />
            </div>
          </motion.div>
        )}

        {/* Timeline */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Screening Timeline</h3>
          </div>
          <Timeline activeIndex={timelineIndex} />
        </Card>

      </main>
    </div>
  )
}
