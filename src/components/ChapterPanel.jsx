import { useEffect, useMemo, useRef, useState } from 'react'
import { BOOKS, BOOK_BY_ID } from '../data/books.js'
import { useChapterText } from '../lib/data.js'
import { chapterRefs, formatShare, refKey, scopeOf } from '../lib/xrefs.js'
import AdSlot from './AdSlot.jsx'
import { SCOPE_COLORS, fmtRef } from './BookView.jsx'

const PREVIEW = 4

function RefItem({ row, focusIdx, picked, strength, onPick }) {
  const [, , ob, och, ov, last, votes] = row
  const text = useChapterText(BOOKS[ob].id, och)
  const ref = useRef(null)
  useEffect(() => {
    if (picked) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked])
  const verses = text.data?.slice(ov - 1, last || ov)
  return (
    <li ref={ref} className={`ref-item ${picked ? 'picked' : ''}`}>
      <button onClick={() => onPick(picked ? null : refKey(row))} aria-pressed={picked}>
        <span className="ref-head">
          <span className="dot" style={{ background: SCOPE_COLORS[scopeOf(focusIdx, ob)] }} />
          <strong>{fmtRef(ob, och, ov, last)}</strong>
          <span className="ref-strength" title={`${votes} voto${votes === 1 ? '' : 's'} no OpenBible.info`}>
            top {formatShare(strength(votes))}
          </span>
        </span>
        <span className="ref-text">
          {text.status === 'ready'
            ? verses?.length
              ? verses.join(' ')
              : 'Versículo não encontrado nesta edição.'
            : text.status === 'error'
              ? 'Não foi possível carregar o texto.'
              : '…'}
        </span>
      </button>
    </li>
  )
}

function Verse({ n, target, text, refs, focusIdx, pickedRef, strength, onPickRef }) {
  const pickedIndex = refs ? refs.findIndex((r) => refKey(r) === pickedRef) : -1
  const [open, setOpen] = useState(false)
  const expanded = open || pickedIndex >= PREVIEW
  const shown = refs ? (expanded ? refs : refs.slice(0, PREVIEW)) : []
  return (
    <article className={`verse ${refs ? 'has-refs' : ''} ${target ? 'target' : ''}`} id={`verso-${n}`}>
      <p>
        <span className="vnum">{n}</span>
        {text ?? '…'}
        {refs && <span className="vcount">{refs.length}</span>}
      </p>
      {refs && (
        <ul className="ref-list">
          {shown.map((row) => (
            <RefItem
              key={refKey(row)}
              row={row}
              focusIdx={focusIdx}
              picked={refKey(row) === pickedRef}
              strength={strength}
              onPick={onPickRef}
            />
          ))}
          {refs.length > PREVIEW && (
            <li>
              <button className="link-btn more" onClick={() => setOpen(!expanded)}>
                {expanded ? 'Mostrar menos' : `+ ${refs.length - PREVIEW} referência${refs.length - PREVIEW > 1 ? 's' : ''}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </article>
  )
}

export default function ChapterPanel({
  focus,
  chapter,
  verse,
  rows,
  rowsStatus,
  filters,
  minVotes,
  tierLabel,
  strength,
  pickedRef,
  onPickRef,
  onClose,
  onChapter,
}) {
  const bodyRef = useRef(null)
  const [onlyWithRefs, setOnlyWithRefs] = useState(false)
  // No celular o painel é uma folha: meia tela (o livro aparece acima) ou tela cheia para ler.
  const [full, setFull] = useState(false)
  const dragY = useRef(null)
  const book = BOOK_BY_ID[focus]
  const text = useChapterText(focus, chapter)

  const byVerse = useMemo(
    () => (rows ? chapterRefs(rows, filters, minVotes, chapter) : new Map()),
    [rows, filters, minVotes, chapter],
  )
  const total = [...byVerse.values()].reduce((s, l) => s + l.length, 0)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [focus, chapter])

  // Navegação por versículo ("Is 53:5"): rola até ele quando o texto chega.
  useEffect(() => {
    if (!verse || text.status !== 'ready') return
    document.getElementById(`verso-${verse}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [verse, text.status, chapter])

  const verses = text.data ?? []

  return (
    <aside className={`panel ${full ? 'sheet-full' : ''}`} aria-label={`${book.pt} ${chapter}`}>
      {/* Alça da folha (só no celular): tocar alterna; arrastar para cima expande, para baixo recolhe ou fecha. */}
      <button
        className="sheet-handle"
        aria-label={full ? 'Recolher o texto' : 'Expandir o texto'}
        onPointerDown={(e) => (dragY.current = e.clientY)}
        onPointerUp={(e) => {
          const dy = dragY.current == null ? 0 : e.clientY - dragY.current
          dragY.current = null
          if (Math.abs(dy) < 8) setFull(!full)
          else if (dy < 0) setFull(true)
          else if (full) setFull(false)
          else onClose()
        }}
      >
        <span aria-hidden="true" />
      </button>
      <header className="panel-head">
        <div>
          <span className="eyebrow">Capítulo</span>
          <h2>
            {book.pt} {chapter}
          </h2>
          <p className="panel-sub">
            {rowsStatus === 'ready'
              ? total
                ? `${total.toLocaleString('pt-BR')} referência${total === 1 ? '' : 's'} em ${byVerse.size} versículo${byVerse.size === 1 ? '' : 's'} · ${tierLabel}`
                : `Nenhuma referência neste capítulo com os filtros atuais (${tierLabel}).`
              : 'Carregando referências…'}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar capítulo" title="Fechar (Esc)">
          ✕
        </button>
      </header>

      <div className="panel-tools">
        <label className="switch-row">
          <input type="checkbox" checked={onlyWithRefs} onChange={(e) => setOnlyWithRefs(e.target.checked)} />
          <span>Só versículos com referências</span>
        </label>
      </div>

      <div className="panel-body" ref={bodyRef}>
        {text.status === 'error' && <p className="muted">Não foi possível carregar o texto do capítulo.</p>}
        {text.status === 'loading' && !verses.length && <p className="muted">Carregando texto…</p>}
        {verses.map((t, i) => {
          const n = i + 1
          const refs = byVerse.get(n)
          if (onlyWithRefs && !refs) return null
          return (
            <Verse
              key={`${chapter}-${n}`}
              n={n}
              target={n === verse}
              text={t}
              refs={refs}
              focusIdx={book.index}
              pickedRef={pickedRef}
              strength={strength}
              onPickRef={onPickRef}
            />
          )
        })}
        {verses.length > 0 && (
          <AdSlot key={`${focus}-${chapter}`} slot={import.meta.env.VITE_ADSENSE_SLOT_CHAPTER} className="ad-chapter" />
        )}
      </div>

      <footer className="panel-nav">
        <button className="btn btn-ghost" onClick={() => onChapter(chapter - 1)} disabled={chapter <= 1}>
          ← {chapter > 1 ? `Cap. ${chapter - 1}` : 'Início'}
        </button>
        <span>
          {chapter} / {book.chapters}
        </span>
        <button className="btn btn-ghost" onClick={() => onChapter(chapter + 1)} disabled={chapter >= book.chapters}>
          {chapter < book.chapters ? `Cap. ${chapter + 1}` : 'Fim'} →
        </button>
      </footer>
    </aside>
  )
}
