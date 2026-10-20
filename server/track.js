import { createHash } from 'node:crypto'
import geoip from 'geoip-lite'
import UAParser from 'ua-parser-js'
import { pool } from './db.js'
import { rateLimit } from './rate-limit.js'

const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|axios|node-fetch/i
const ID = /^[A-Za-z0-9-]{8,64}$/
const clip = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null)

// O IP nunca é salvo: serve só para estimar a localização e para um hash com sal diário,
// que conta visitantes únicos no dia sem permitir rastrear alguém entre dias.
function ipHash(ip) {
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${process.env.IP_SALT ?? 'line-upon-line'}|${day}|${ip}`)
    .digest('hex')
    .slice(0, 32)
}

function referrerHost(ref, host) {
  try {
    const url = new URL(ref)
    return url.host === host ? null : url.host.replace(/^www\./, '')
  } catch {
    return null
  }
}

const allowVisit = rateLimit({ windowMs: 60_000, max: 20 })
const allowPing = rateLimit({ windowMs: 60_000, max: 12 })

export function trackRoutes(app) {
  app.post('/api/visit', async (req, res) => {
    res.status(204).end()
    if (!pool) return
    const ua = req.get('user-agent') ?? ''
    const { sid, vid, screen, lang, ref, path } = req.body ?? {}
    if (BOTS.test(ua) || !ID.test(sid ?? '') || !ID.test(vid ?? '') || !allowVisit(req.ip)) return

    const parsed = new UAParser(ua).getResult()
    const geo = geoip.lookup(req.ip) ?? {}
    try {
      const seen = await pool.query('SELECT 1 FROM visits WHERE visitor_id = $1 LIMIT 1', [vid])
      await pool.query(
        `INSERT INTO visits (session_id, visitor_id, is_new, device_type, browser, os, screen, language,
                             country, region, city, referrer, path, ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (session_id) DO UPDATE SET last_seen_at = now()`,
        [
          sid,
          vid,
          seen.rowCount === 0,
          parsed.device.type ?? 'desktop',
          clip(parsed.browser.name, 40),
          clip(parsed.os.name, 40),
          clip(screen, 20),
          clip(lang, 20),
          clip(geo.country, 2),
          clip(geo.region, 10),
          clip(geo.city, 80),
          referrerHost(ref, req.get('host')),
          clip(path, 200),
          ipHash(req.ip),
        ],
      )
    } catch (err) {
      console.error('visit:', err.message)
    }
  })

  // Batimento enquanto a aba está aberta e visível: mede a duração da visita.
  app.post('/api/visit/ping', async (req, res) => {
    res.status(204).end()
    const sid = req.body?.sid
    if (!pool || !ID.test(sid ?? '') || !allowPing(req.ip)) return
    try {
      await pool.query(
        `UPDATE visits SET last_seen_at = now()
         WHERE session_id = $1 AND last_seen_at > now() - interval '30 minutes'`,
        [sid],
      )
    } catch (err) {
      console.error('ping:', err.message)
    }
  })
}
