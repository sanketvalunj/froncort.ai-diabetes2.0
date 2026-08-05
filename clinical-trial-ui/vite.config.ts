// Vite configuration for the clinical trial UI application.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL is set at build time on Vercel:
//   https://your-api.onrender.com
// In local dev it is left unset so the proxy below handles /api/* calls.
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-only proxy: /api/* → http://localhost:8000/*
    // In production the built bundle uses VITE_API_URL directly (no proxy needed).
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
