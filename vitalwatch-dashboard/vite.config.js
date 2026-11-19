import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server forwards /api to the backend, so the dashboard never
// needs a hard-coded backend URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_BACKEND || 'http://localhost:5000', changeOrigin: true },
    },
  },
})
