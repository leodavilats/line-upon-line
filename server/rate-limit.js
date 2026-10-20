// Limite simples em memória (uma instância do servidor basta para este app).
export function rateLimit({ windowMs, max }) {
  const hits = new Map()
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) if (entry.reset < now) hits.delete(key)
  }, windowMs).unref()

  return (key) => {
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs })
      return true
    }
    entry.count++
    return entry.count <= max
  }
}
