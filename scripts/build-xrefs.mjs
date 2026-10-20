// Gera public/data/xref-books.json a partir das referências cruzadas do OpenBible.info (CC-BY).
// Agrega as ~345 mil referências em pares de livros (não direcionados), com a contagem
// já separada por faixa de força (percentil de votos), para os filtros responderem sem recalcular.
// O zip original fica em cache em data-raw/; use --refresh para baixar de novo.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { BOOKS } from '../src/data/books.js'

const SOURCE_URL = 'https://a.openbible.info/data/cross-references.zip'
const RAW = new URL('../data-raw/cross-references.zip', import.meta.url)
const OUT = new URL('../public/data/xref-books.json', import.meta.url)
// Opções do filtro "Mostrar as X% mais fortes".
const TOP_PERCENTS = [0.025, 0.5, 1, 2, 5, 10, 25, 50, 100]

// Códigos OSIS do OpenBible, na mesma ordem de BOOKS.
const OSIS =
  'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split(' ')
if (OSIS.length !== BOOKS.length) throw new Error('mapa OSIS não tem 66 livros')
const BOOK_INDEX = Object.fromEntries(OSIS.map((code, i) => [code, i]))

async function loadZip() {
  if (!process.argv.includes('--refresh')) {
    try {
      return await readFile(RAW)
    } catch {}
  }
  console.log(`Baixando ${SOURCE_URL}…`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(new URL('.', RAW), { recursive: true })
  await writeFile(RAW, buf)
  return buf
}

// Leitor mínimo de zip (diretório central + deflate), suficiente para este arquivo.
function extract(buf, predicate) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('zip inválido')
  const entries = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central inválido')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    if (predicate(name)) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const data = buf.subarray(start, start + size)
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error('arquivo de referências não encontrado no zip')
}

const text = extract(await loadZip(), (n) => n.endsWith('.txt'))
const [header, ...lines] = text.trim().split(/\r?\n/)
const date = header.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? 'data desconhecida'

let negative = 0
// Por livro: cada referência entra no arquivo dos dois livros que toca, orientada a partir dele:
// [cap, vers, outroLivro, outroCap, outroVers, outroVersFinal (0 = único), votos]
const perBook = BOOKS.map(() => [])
const refs = []

// "Gen.1.1" ou "Gen.1.1-Gen.1.3". Intervalos ancoram no primeiro versículo;
// o final só é guardado quando fica no mesmo capítulo.
function parseRef(s) {
  const [start, end] = s.split('-')
  const [code, ch, v] = start.split('.')
  const book = BOOK_INDEX[code]
  if (book === undefined) throw new Error(`livro desconhecido: ${s}`)
  let last = 0
  if (end) {
    const [ecode, ech, ev] = end.split('.')
    if (ecode === code && ech === ch) last = Number(ev)
  }
  return { book, ch: Number(ch), v: Number(v), last }
}

for (const line of lines) {
  const [from, to, votesStr] = line.split('	')
  const votes = Number(votesStr)
  if (votes < 0) {
    negative++
    continue
  }
  const f = parseRef(from)
  const t = parseRef(to)
  perBook[f.book].push([f.ch, f.v, t.book, t.ch, t.v, t.last, votes])
  perBook[t.book].push([t.ch, t.v, f.book, f.ch, f.v, f.last, votes])
  refs.push([Math.min(f.book, t.book), Math.max(f.book, t.book), votes])
}

// Força em percentil: "top X%" = fração das referências com pelo menos esses votos.
const N = refs.length
const atLeast = new Map() // votos → nº de referências com votos >= v
{
  const freq = new Map()
  for (const [, , v] of refs) freq.set(v, (freq.get(v) ?? 0) + 1)
  let acc = 0
  for (const v of [...freq.keys()].sort((a, b) => b - a)) {
    acc += freq.get(v)
    atLeast.set(v, acc)
  }
}
const strength = [...atLeast.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => [v, +(n / N).toFixed(6)])

// Faixas do filtro: para cada "top X%", o menor nº de votos cuja fatia não passa de X%.
// Empates fazem a fatia real ficar um pouco abaixo de X; ela vai junto para a interface.
const tiers = TOP_PERCENTS.map((pct) => {
  if (pct >= 100) return { pct, minVotes: 0, share: 1 }
  const candidates = strength.filter(([, share]) => share <= pct / 100)
  const [minVotes, share] = candidates[0]
  return { pct, minVotes, share }
})

const pairs = new Map()
const totals = tiers.map(() => 0)
for (const [a, b, votes] of refs) {
  const key = a * 100 + b
  let counts = pairs.get(key)
  if (!counts) pairs.set(key, (counts = tiers.map(() => 0)))
  tiers.forEach((t, i) => {
    if (votes >= t.minVotes) {
      counts[i]++
      totals[i]++
    }
  })
}

const rows = [...pairs.entries()]
  .sort(([x], [y]) => x - y)
  .map(([key, counts]) => [Math.floor(key / 100), key % 100, ...counts])

await mkdir(new URL('.', OUT), { recursive: true })
await writeFile(
  OUT,
  JSON.stringify({
    source: `OpenBible.info Cross References (CC-BY), ${date}`,
    total: N,
    negativeExcluded: negative,
    tiers,
    totals,
    strength,
    pairs: rows,
  }),
)

const BOOK_DIR = new URL('../public/data/xref/', import.meta.url)
await mkdir(BOOK_DIR, { recursive: true })
for (const [i, rows] of perBook.entries()) {
  rows.sort((x, y) => x[0] - y[0] || x[1] - y[1] || y[6] - x[6])
  await writeFile(new URL(`${BOOKS[i].id}.json`, BOOK_DIR), JSON.stringify(rows))
}

console.log(`${lines.length} referências lidas, ${negative} com votos negativos descartadas`)
console.log(`66 arquivos por livro → public/data/xref/`)
console.log(`${rows.length} pares de livros → public/data/xref-books.json`)
for (const t of tiers) console.log(`  top ${t.pct}% → votos >= ${t.minVotes} (fatia real ${(t.share * 100).toFixed(3)}%)`)
