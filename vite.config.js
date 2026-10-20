import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // O app (index.html), o painel administrativo (console.html, servido em /console)
      // e a política de privacidade (privacidade.html, servida em /privacidade).
      input: { main: 'index.html', console: 'console.html', privacidade: 'privacidade.html' },
    },
  },
  server: {
    // Em desenvolvimento, a API vem do servidor Node (npm run dev:server).
    proxy: { '/api': 'http://localhost:3000' },
  },
})
