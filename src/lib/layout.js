import { BOOKS, BOOK_BY_ID } from '../data/books.js'
import VERSE_COUNTS from '../data/verseCounts.json'

// Área visível do desenho: só o livro (capa em x 20–1580, y 40–826) e a fita que pende abaixo dele.
export const VIEW = { x: 14, y: 34, w: 1572, h: 850 }
export const BASELINE = 690
const PAGES = { AT: [90, 770], NT: [830, 1510] }
const FOCUS_SHARE = 0.55

// Largura de cada livro proporcional à raiz do nº de capítulos, o que mantém Salmos
// grande sem esmagar os profetas menores. Com um livro em foco, ele ocupa FOCUS_SHARE
// da sua página (lente) e os demais da mesma página dividem o resto.
export function computeLayout(focusId = null) {
  const layout = []
  for (const t of ['AT', 'NT']) {
    const books = BOOKS.filter((b) => b.t === t)
    const [x0, x1] = PAGES[t]
    const span = x1 - x0
    const hasFocus = books.some((b) => b.id === focusId)
    const rest = hasFocus ? span * (1 - FOCUS_SHARE) : span
    const weights = books.map((b) => (b.id === focusId ? 0 : Math.sqrt(b.chapters)))
    const total = weights.reduce((a, b) => a + b, 0)
    let x = x0
    for (const [i, b] of books.entries()) {
      const w = b.id === focusId ? span * FOCUS_SHARE : (rest * weights[i]) / total
      layout.push({ ...b, x, w, cx: x + w / 2 })
      x += w
    }
  }
  return layout
}

export const BOOK_LAYOUT = computeLayout()

export const verseCount = (bookId, ch) => VERSE_COUNTS[bookId]?.[ch - 1] ?? 1

/** Posição relativa (0–1) de um capítulo/versículo dentro do livro. */
export function posIn(bookId, ch, v = null) {
  const chapters = BOOK_BY_ID[bookId].chapters
  if (v == null) return (ch - 0.5) / chapters
  const n = verseCount(bookId, ch)
  return (ch - 1 + (Math.min(v, n) - 0.5) / n) / chapters
}

/** Ponto na base: { b: índice do livro, p: posição 0–1 }. */
export const xAt = (layout, end) => layout[end.b].x + layout[end.b].w * end.p

export const arcHeight = (x1, x2) => Math.min(Math.max(Math.abs(x2 - x1) * 0.62, 30), 770)

export function arcPath(x1, x2, y = BASELINE) {
  const h = arcHeight(x1, x2)
  return `M ${x1} ${y} C ${x1} ${y - h}, ${x2} ${y - h}, ${x2} ${y}`
}

// Pontos amostrados ao longo do arco, para detectar o arco sob o cursor no Canvas.
export function sampleArc(x1, x2, n = 24) {
  const h = arcHeight(x1, x2)
  const y = BASELINE
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    const px = u * u * u * x1 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x2
    const py = u * u * u * y + 3 * u * u * t * (y - h) + 3 * u * t * t * (y - h) + t * t * t * y
    pts.push(px, py)
  }
  return pts
}

export function lerpLayout(from, to, e) {
  return to.map((b, i) => {
    const x = from[i].x + (b.x - from[i].x) * e
    const w = from[i].w + (b.w - from[i].w) * e
    return { ...b, x, w, cx: x + w / 2 }
  })
}

// Rótulos dos livros: prioriza os marcados e evita sobreposição.
export function pickLabels(layout, priority, minGap = 12.5) {
  const placed = []
  const shown = new Set()
  const order = [...layout].sort((a, b) => priority.has(b.id) - priority.has(a.id) || b.w - a.w)
  for (const b of order) {
    if (placed.every((x) => Math.abs(x - b.cx) >= minGap)) {
      placed.push(b.cx)
      shown.add(b.id)
    }
  }
  return shown
}

/** Intervalo "bonito" entre rótulos de capítulo para caberem na largura dada. */
export function chapterStep(width, chapters, minGap = 16) {
  const per = width / chapters
  return [1, 2, 5, 10, 20, 25, 50].find((s) => s * per >= minGap) ?? 50
}
