import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['tesseract.js'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/account-api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/account-api/, '/api'),
      },
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    }
  }
})
