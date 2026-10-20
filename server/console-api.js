import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { pool } from './db.js'
import { rateLimit } from './rate-limit.js'

const COOKIE = 'lsl_console'
const MAX_AGE_S = 7 * 24 * 3600
const TZ = 'America/Sao_Paulo'
const RANGES = new Set([7, 30, 90, 365])
const allowLogin = rateLimit({ windowMs: 15 * 60_000, max: 8 })

const configured = () => Boolean(process.env.CONSOLE_USER && process.env.CONSOLE_PASSWORD && process.env.SESSION_SECRET)

// Compara em tempo constante (o hash iguala os tamanhos).
function same(a, b) {
  const h = (s) => createHash('sha256').update(String(s)).digest()
  return timingSafeEqual(h(a), h(b))
}

const sign = (payload) => createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url')

function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + MAX_AGE_S * 1000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function readToken(req) {
  const raw = (req.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === COOKIE)?.[1]
  if (!raw || !configured()) return null
  const [payload, mac] = raw.split('.')
  if (!payload || !mac || !same(mac, sign(payload))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return data.exp > Date.now() ? data : null
  } catch {
    return null
  }
}

function setCookie(req, res, value, maxAge) {
  const secure = req.secure ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`)
}

function requireAuth(req, res, next) {
  if (readToken(req)) return next()
  res.status(401).json({ error: 'não autenticado' })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function stats(days) {
  const inRange = `started_at >= now() - make_interval(days => $1)`
  const summarySql = (where) => `
    SELECT count(*)::int AS visits,
           count(DISTINCT visitor_id)::int AS visitors,
           (count(*) FILTER (WHERE is_new))::int AS new_visits,
           coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM last_seen_at - started_at)), 0)::float AS median_s
    FROM visits WHERE ${where}`
  const top = (expr, limit = 8) => `
    SELECT coalesce(${expr}, '—') AS label, count(*)::int AS n
    FROM visits WHERE ${inRange} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${limit}`

  const q = (sql, params = [days]) => pool.query(sql, params).then((r) => r.rows)
  const [[current], [previous], [active], daily, countries, cities, devices, browsers, systems, referrers, recent] =
    await Promise.all([
      q(summarySql(inRange)),
      q(summarySql(`started_at >= now() - make_interval(days => $1 * 2) AND started_at < now() - make_interval(days => $1)`)),
      q(`SELECT count(*)::int AS n FROM visits WHERE last_seen_at > now() - interval '5 minutes'`, []),
      q(`
        SELECT to_char(d, 'YYYY-MM-DD') AS day, coalesce(v.visits, 0)::int AS visits, coalesce(v.visitors, 0)::int AS visitors
        FROM generate_series((now() AT TIME ZONE '${TZ}')::date - ($1 - 1), (now() AT TIME ZONE '${TZ}')::date, interval '1 day') AS d
        LEFT JOIN (
          SELECT (started_at AT TIME ZONE '${TZ}')::date AS day, count(*) AS visits, count(DISTINCT visitor_id) AS visitors
          FROM visits WHERE ${inRange} GROUP BY 1
        ) v ON v.day = d::date
        ORDER BY d`),
      q(top('country')),
      q(top(`nullif(concat_ws(', ', city, region, country), '')`)),
      q(top('device_type')),
      q(top('browser')),
      q(top('os')),
      q(top(`coalesce(referrer, 'Acesso direto')`)),
      q(`
        SELECT started_at, extract(epoch FROM last_seen_at - started_at)::int AS duration_s, is_new,
               device_type, browser, os, screen, language, country, region, city, referrer
        FROM visits WHERE ${inRange} ORDER BY started_at DESC LIMIT 100`),
    ])
  return { days, current, previous, active: active.n, daily, countries, cities, devices, browsers, systems, referrers, recent }
}

export function consoleRoutes(app) {
  app.get('/api/console/me', (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Console não configurado (CONSOLE_USER, CONSOLE_PASSWORD, SESSION_SECRET).' })
    const token = readToken(req)
    if (!token) return res.status(401).json({ error: 'não autenticado' })
    res.json({ user: token.u })
  })

  app.post('/api/console/login', async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'Console não configurado.' })
    if (!allowLogin(req.ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })
    const { user, password } = req.body ?? {}
    // `&` (e não `&&`) compara os dois campos sempre, sem revelar qual deles falhou pelo tempo de resposta.
    const ok = same(user ?? '', process.env.CONSOLE_USER) & same(password ?? '', process.env.CONSOLE_PASSWORD)
    if (!ok) {
      await sleep(600) // desestimula tentativa e erro
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' })
    }
    setCookie(req, res, makeToken(process.env.CONSOLE_USER), MAX_AGE_S)
    res.json({ user: process.env.CONSOLE_USER })
  })

  app.post('/api/console/logout', (req, res) => {
    setCookie(req, res, '', 0)
    res.status(204).end()
  })

  app.get('/api/console/stats', requireAuth, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Banco de dados não configurado (DATABASE_URL).' })
    const days = Number(req.query.days)
    try {
      res.json(await stats(RANGES.has(days) ? days : 30))
    } catch (err) {
      console.error('stats:', err.message)
      res.status(500).json({ error: 'Falha ao consultar os dados.' })
    }
  })
}
