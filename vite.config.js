import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Duas páginas: o app (index.html) e o painel administrativo (console.html, servido em /console).
      input: { main: 'index.html', console: 'console.html' },
    },
  },
  server: {
    // Em desenvolvimento, a API vem do servidor Node (npm run dev:server).
    proxy: { '/api': 'http://localhost:3000' },
  },
})
