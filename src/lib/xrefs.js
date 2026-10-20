import { BOOKS, BOOK_BY_ID } from '../data/books.js'

export const SCOPES = [
  { id: 'AT', label: 'Dentro do Antigo Testamento', short: 'AT ↔ AT' },
  { id: 'cross', label: 'Entre os testamentos', short: 'AT ↔ NT' },
  { id: 'NT', label: 'Dentro do Novo Testamento', short: 'NT ↔ NT' },
]

export const GROUPS = [
  { id: 'pentateuco', label: 'Pentateuco', from: 'GEN', to: 'DEU' },
  { id: 'historicos', label: 'Históricos', from: 'JOS', to: 'EST' },
  { id: 'poeticos', label: 'Poéticos', from: 'JOB', to: 'SNG' },
  { id: 'maiores', label: 'Profetas Maiores', from: 'ISA', to: 'DAN' },
  { id: 'menores', label: 'Profetas Menores', from: 'HOS', to: 'MAL' },
  { id: 'evangelhos', label: 'Evangelhos', from: 'MAT', to: 'JHN' },
  { id: 'atos', label: 'Atos', from: 'ACT', to: 'ACT' },
  { id: 'paulinas', label: 'Cartas de Paulo', from: 'ROM', to: 'PHM' },
  { id: 'gerais', label: 'Hebreus e Gerais', from: 'HEB', to: 'JUD' },
  { id: 'apocalipse', label: 'Apocalipse', from: 'REV', to: 'REV' },
]
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]))

const NT_GROUPS = ['evangelhos', 'atos', 'paulinas', 'gerais', 'apocalipse']
export const PRESETS = [
  { id: 'prof-evang', label: 'Profetas ↔ Evangelhos', a: ['maiores', 'menores'], b: ['evangelhos'] },
  { id: 'lei-paulo', label: 'Lei ↔ Cartas de Paulo', a: ['pentateuco'], b: ['paulinas'] },
  { id: 'poet-nt', label: 'Salmos e Sabedoria ↔ NT', a: ['poeticos'], b: NT_GROUPS },
  { id: 'prof-apoc', label: 'Profetas ↔ Apocalipse', a: ['maiores', 'menores'], b: ['apocalipse'] },
]

const GROUP_OF = BOOKS.map((_, i) =>
  GROUPS.find((g) => i >= BOOK_BY_ID[g.from].index && i <= BOOK_BY_ID[g.to].index).id,
)
export const groupOf = (bookIdx) => GROUP_OF[bookIdx]

// Índice em TOP_PERCENTS de scripts/build-xrefs.mjs ([0.025, 0.5, 1, 2, 5, 10, 25, 50, 100]): todas.
export const DEFAULT_TIER = 8

/** Rótulo de uma faixa: "top 0,025%", "top 5%" ou "todas". */
export const tierName = (pct) => (pct >= 100 ? 'todas' : `top ${pct.toLocaleString('pt-BR')}%`)
export const DEFAULT_FILTERS = {
  tier: DEFAULT_TIER,
  scopes: new Set(SCOPES.map((s) => s.id)),
  sameBook: false,
  groupsA: new Set(),
  groupsB: new Set(),
  focus: null, // id do livro aberto
}

export function scopeOf(a, b) {
  const ta = BOOKS[a].t
  const tb = BOOKS[b].t
  if (ta !== tb) return 'cross'
  return ta
}

/** Filtros estruturais (testamentos, grupos, livro aberto) para um par de livros (índices). */
export function pairPasses(a, b, f) {
  if (!f.scopes.has(scopeOf(a, b))) return false
  if (f.focus) {
    const fi = BOOK_BY_ID[f.focus].index
    if (a !== fi && b !== fi) return false
  }
  if (f.groupsA.size || f.groupsB.size) {
    const ok = (x, set) => !set.size || set.has(GROUP_OF[x])
    if (!((ok(a, f.groupsA) && ok(b, f.groupsB)) || (ok(b, f.groupsA) && ok(a, f.groupsB)))) return false
  }
  return true
}

export async function loadXrefs() {
  const res = await fetch(`${import.meta.env.BASE_URL}data/xref-books.json`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** "top X%" de uma referência a partir dos votos (tabela gerada no build). */
export function makeStrength(data) {
  const table = data.strength // [[votos, fatia], …] em ordem crescente de votos
  return (votes) => {
    let lo = 0
    let hi = table.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (table[mid][0] <= votes) lo = mid
      else hi = mid - 1
    }
    return table[lo][1]
  }
}

export function formatShare(share) {
  const pct = share * 100
  if (pct < 0.001) return '0,001%' // as mais fortes de todas não arredondam para "0%"
  const digits = pct < 0.1 ? 3 : pct < 1 ? 2 : pct < 10 ? 1 : 0
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`
}

/*
 * O "tecido" é uma lista de arcos genéricos, independente do nível de zoom:
 *   { key, kind, a: {b, p}, z: {b, p}, scope, count, … }
 * a/z são pontas na base (índice do livro + posição 0–1 dentro dele), e por isso
 * acompanham a animação do layout sem recálculo. `count` define espessura e opacidade.
 */
function finish(items, refs) {
  items.sort((p, q) => p.count - q.count)
  const max = items.reduce((m, i) => Math.max(m, i.count), 1)
  return { items, refs, max }
}

/** Nível Bíblia: pares livro↔livro. */
export function overviewTissue(data, f) {
  const col = 2 + f.tier
  const items = []
  let refs = 0
  for (const row of data.pairs) {
    const [a, b] = row
    const count = row[col]
    if (!count) continue
    if (a === b && !f.sameBook) continue
    if (!pairPasses(a, b, f)) continue
    const same = a === b
    items.push({
      key: `${a}-${b}`,
      kind: 'pair',
      a: { b: a, p: same ? 0.2 : 0.5 },
      z: { b: b, p: same ? 0.8 : 0.5 },
      scope: scopeOf(a, b),
      count,
    })
    refs += count
  }
  return finish(items, refs)
}

export function rowPasses(row, focusIdx, f, minVotes) {
  if (row[6] < minVotes) return false
  if (row[2] === focusIdx && !f.sameBook) return false
  return pairPasses(focusIdx, row[2], f)
}

/** Nível livro: capítulo do livro aberto ↔ outro livro (ou capítulo↔capítulo no mesmo livro). */
export function bookTissue(rows, f, minVotes, posIn) {
  const fi = BOOK_BY_ID[f.focus].index
  const agg = new Map()
  let refs = 0
  for (const row of rows) {
    if (!rowPasses(row, fi, f, minVotes)) continue
    const [ch, v, ob, och, ov] = row
    let key
    if (ob === fi) {
      // Cada referência interna aparece duas vezes (uma por ponta); conta e desenha uma só.
      if (och < ch || (och === ch && ov < v)) continue
      key = `s${ch}-${och}`
    } else {
      key = `${ch}-${ob}`
    }
    refs++
    let item = agg.get(key)
    if (!item) {
      item = {
        key,
        kind: 'chapter',
        ch,
        ob,
        och,
        a: { b: fi, p: posIn(f.focus, ch) },
        z: ob === fi ? { b: fi, p: posIn(f.focus, och) } : { b: ob, p: 0.5 },
        scope: scopeOf(fi, ob),
        count: 0,
      }
      agg.set(key, item)
    }
    item.count++
  }
  return finish([...agg.values()], refs)
}

export const refKey = (row) => `${row[1]}-${row[2]}-${row[3]}-${row[4]}`

// Linhas do capítulo que passam nos filtros. A mesma ligação pode vir nos dois sentidos
// (A→B e B→A); fica a mais votada.
function chapterRows(rows, f, minVotes, chapter) {
  const fi = BOOK_BY_ID[f.focus].index
  const unique = new Map()
  for (const row of rows) {
    if (row[0] !== chapter || !rowPasses(row, fi, f, minVotes)) continue
    const key = refKey(row)
    const prev = unique.get(key)
    if (!prev || row[6] > prev[6]) unique.set(key, row)
  }
  return unique
}

/** Nível capítulo: cada referência do capítulo, versículo a versículo. */
export function chapterTissue(rows, f, minVotes, chapter, posIn) {
  const fi = BOOK_BY_ID[f.focus].index
  const items = []
  for (const [key, row] of chapterRows(rows, f, minVotes, chapter)) {
    const [ch, v, ob, och, ov, , votes] = row
    items.push({
      key,
      kind: 'ref',
      row,
      a: { b: fi, p: posIn(f.focus, ch, v) },
      z: { b: ob, p: posIn(BOOKS[ob].id, och, ov) },
      scope: scopeOf(fi, ob),
      count: Math.max(votes, 1),
    })
  }
  return finish(items, items.length)
}

/** Referências do capítulo agrupadas por versículo, mais fortes primeiro. */
export function chapterRefs(rows, f, minVotes, chapter) {
  const byVerse = new Map()
  for (const row of chapterRows(rows, f, minVotes, chapter).values()) {
    const list = byVerse.get(row[1]) ?? []
    list.push(row)
    byVerse.set(row[1], list)
  }
  for (const list of byVerse.values()) list.sort((x, y) => y[6] - x[6])
  return byVerse
}

/** Quantos filtros diferem do padrão (para o botão "Filtros"). */
export function activeFilterCount(f) {
  let n = 0
  if (f.tier !== DEFAULT_TIER) n++
  if (f.scopes.size !== SCOPES.length) n++
  if (f.sameBook) n++
  if (f.groupsA.size || f.groupsB.size) n++
  return n
}
