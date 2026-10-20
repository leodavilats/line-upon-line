// Servidor de produção: entrega o site (dist/), registra acessos e serve o /console.
import compression from 'compression'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { consoleRoutes } from './console-api.js'
import { migrate } from './db.js'
import { trackRoutes } from './track.js'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const PORT = Number(process.env.PORT) || 3000

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', true) // atrás do proxy do Railway: req.ip e req.secure vêm dos cabeçalhos dele
app.use(compression())
app.use('/api', express.json({ limit: '4kb' }))

app.get('/healthz', (_req, res) => res.send('ok'))
trackRoutes(app)
consoleRoutes(app)
app.use('/api', (_req, res) => res.status(404).json({ error: 'não encontrado' }))

app.get(['/console', '/console/'], (_req, res) => {
  res.set('Cache-Control', 'no-store').sendFile('console.html', { root: DIST })
})

app.use(
  express.static(DIST, {
    index: 'index.html',
    setHeaders(res, path) {
      // Arquivos com hash no nome nunca mudam; dados mudam só a cada deploy.
      if (/[\\/]assets[\\/]/.test(path)) res.set('Cache-Control', 'public, max-age=31536000, immutable')
      else if (/[\\/]data[\\/]/.test(path)) res.set('Cache-Control', 'public, max-age=86400')
      else res.set('Cache-Control', 'no-cache')
    },
  }),
)

await migrate().catch((err) => console.error('Falha na migração do banco:', err.message))
app.listen(PORT, () => console.log(`Linha sobre Linha em http://localhost:${PORT}`))
