import { BOOKS } from '../data/books.js'

export const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const compact = (s) => normalize(s).replace(/\s/g, '')

function findBooks(token) {
  const raw = token.toLowerCase().replace(/\s/g, '')
  const n = compact(token)
  // Abreviação exata, com acento primeiro ("jó" → Jó, "jo" → João); depois prefixo do nome.
  const exact =
    BOOKS.find((b) => b.abbr.toLowerCase() === raw) || BOOKS.find((b) => normalize(b.abbr) === n)
  const byName = BOOKS.filter((b) => compact(b.pt).startsWith(n) && b !== exact)
  return exact ? [exact, ...byName] : byName
}

const REF = /^([123]?\s*[^\d\s:.]+(?:\s[^\d\s:.]+)?)\.?\s*(\d+)?(?:[:.](\d+)(?:-\d+)?)?$/

/** "Is 53", "isaias", "1 Rs 13:2" → sugestões { book, chapter, verse, label }. */
export function suggest(query, limit = 6) {
  const q = query.trim()
  if (!q) return []
  const m = q.match(REF)
  if (!m) return []
  const chapter = m[2] ? Number(m[2]) : null
  const verse = chapter && m[3] ? Number(m[3]) : null
  return findBooks(m[1])
    .filter((b) => chapter === null || chapter <= b.chapters)
    .slice(0, limit)
    .map((book) => ({
      book,
      chapter,
      verse,
      label: `${book.pt}${chapter ? ` ${chapter}` : ''}${verse ? `:${verse}` : ''}`,
    }))
}
