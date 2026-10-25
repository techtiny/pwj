import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev only: Vite's SPA fallback would answer /portfolio/ with the app's index.html, so point it at
// the static portfolio page in public/portfolio/ instead.
const portfolioRoute = {
  name: 'portfolio-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/portfolio\/?(\?.*)?$/.test(req.url)) req.url = '/portfolio/index.html'
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), portfolioRoute],
  optimizeDeps: {
    exclude: ['tesseract.js'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    }
  }
})
