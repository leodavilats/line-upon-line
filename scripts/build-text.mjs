// Gera o texto completo da Almeida (domínio público) dividido por capítulo:
//   public/data/text/LIVRO/CAP.json  → ["texto do v1", "texto do v2", …]
//   src/data/verseCounts.json        → { LIVRO: [nº de versículos por capítulo] }
// Fonte: seven1m/open-bibles (a mesma usada pela bible-api.com). Cache em data-raw/.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { BOOKS } from '../src/data/books.js'

const SOURCE_URL = 'https://raw.githubusercontent.com/seven1m/open-bibles/master/por-almeida.usfx.xml'
const RAW = new URL('../data-raw/por-almeida.usfx.xml', import.meta.url)
const OUT_DIR = new URL('../public/data/text/', import.meta.url)
const COUNTS = new URL('../src/data/verseCounts.json', import.meta.url)

async function loadXml() {
  if (!process.argv.includes('--refresh')) {
    try {
      return await readFile(RAW, 'utf8')
    } catch {}
  }
  console.log(`Baixando ${SOURCE_URL}…`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()
  await mkdir(new URL('.', RAW), { recursive: true })
  await writeFile(RAW, xml)
  return xml
}

const xml = await loadXml()
const bible = {}
let book = null
let chapter = 0
const token = /<book id="(\w+)">|<c id="(\d+)"\/>|<v id="(\d+)"\/>([\s\S]*?)<ve\/>/g
for (const m of xml.matchAll(token)) {
  if (m[1]) {
    book = m[1]
    bible[book] = []
  } else if (m[2]) {
    chapter = Number(m[2])
    bible[book][chapter - 1] = []
  } else {
    bible[book][chapter - 1][Number(m[3]) - 1] = m[4].replace(/\s+/g, ' ').trim()
  }
}

await rm(OUT_DIR, { recursive: true, force: true })
const counts = {}
let verses = 0
for (const b of BOOKS) {
  const chapters = bible[b.id]
  if (!chapters || chapters.length !== b.chapters) {
    throw new Error(`${b.id}: esperava ${b.chapters} capítulos, encontrei ${chapters?.length ?? 0}`)
  }
  await mkdir(new URL(`${b.id}/`, OUT_DIR), { recursive: true })
  counts[b.id] = chapters.map((c) => c.length)
  for (const [i, c] of chapters.entries()) {
    verses += c.length
    // Lacunas viram null (não há nenhuma nesta edição, mas o formato as admite).
    await writeFile(new URL(`${b.id}/${i + 1}.json`, OUT_DIR), JSON.stringify(Array.from(c, (v) => v ?? null)))
  }
}
await writeFile(COUNTS, JSON.stringify(counts) + '\n')
console.log(`${BOOKS.length} livros, ${verses} versículos → public/data/text/ e src/data/verseCounts.json`)
