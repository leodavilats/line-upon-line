// Registro anônimo de acesso: um id aleatório por navegador (visitante) e por aba (sessão),
// mais um batimento a cada 30 s enquanto a aba está visível, para medir a duração.
const uuid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

function stored(storage, key) {
  try {
    let value = storage.getItem(key)
    if (!value) {
      value = uuid()
      storage.setItem(key, value)
    }
    return value
  } catch {
    return uuid()
  }
}

function send(url, body) {
  const data = JSON.stringify(body)
  if (navigator.sendBeacon?.(url, new Blob([data], { type: 'application/json' }))) return
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true }).catch(() => {})
}

export function startTracking() {
  if (import.meta.env.DEV) return
  const sid = stored(sessionStorage, 'lsl-sid')
  const vid = stored(localStorage, 'lsl-vid')
  send('/api/visit', {
    sid,
    vid,
    screen: `${screen.width}x${screen.height}`,
    lang: navigator.language,
    ref: document.referrer,
    path: location.pathname,
  })
  const ping = () => send('/api/visit/ping', { sid })
  setInterval(() => document.visibilityState === 'visible' && ping(), 30_000)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && ping())
}
