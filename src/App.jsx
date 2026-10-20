import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BookView, { SCOPE_COLORS } from './components/BookView.jsx'
import ChapterPanel from './components/ChapterPanel.jsx'
import { Tour, WelcomeModal, introWanted, markIntroShown } from './components/Intro.jsx'
import SearchBox from './components/SearchBox.jsx'
import Sidebar from './components/Sidebar.jsx'
import { BOOK_BY_ID } from './data/books.js'
import { loadBookXrefs, useAsync } from './lib/data.js'
import { posIn } from './lib/layout.js'
import {
  DEFAULT_FILTERS,
  DEFAULT_TIER,
  GROUP_BY_ID,
  PRESETS,
  SCOPES,
  activeFilterCount,
  bookTissue,
  chapterTissue,
  loadXrefs,
  makeStrength,
  overviewTissue,
  scopeOf,
  tierName,
} from './lib/xrefs.js'

const fmt = (n) => n.toLocaleString('pt-BR')
const WIDE = 1100 // a barra lateral começa aberta a partir desta largura
const ROOMY = 1700 // abaixo disso, abrir um capítulo recolhe a barra lateral

const TOUR_STEPS = [
  {
    target: () => '.book-layers',
    title: 'A Bíblia aberta',
    body: 'Cada arco liga passagens relacionadas. A espessura indica quantas referências há entre os dois pontos, e a cor mostra se a ligação fica dentro do AT, entre os testamentos ou dentro do NT. Passe o cursor sobre um livro ou uma linha para isolá-lo.',
  },
  {
    target: () => '.crumbs',
    title: 'Do panorama ao versículo',
    body: 'Clique num livro para abri-lo em capítulos; clique num capítulo para ler o texto com as referências de cada versículo. Esta trilha mostra onde você está, e Esc volta um nível.',
  },
  {
    target: () => (document.querySelector('.sidebar.open') ? '[data-tour="strength"]' : '.filters-toggle'),
    title: 'Força da conexão',
    body: 'Por padrão aparecem todas as referências. Arraste para mostrar só as ligações mais fortes (até o top 0,025%). Testamentos e atalhos de ligações ficam logo abaixo; o resto está em "Mais opções".',
  },
  {
    target: () => '.searchbox',
    title: 'Vá direto a uma passagem',
    body: 'Digite "Is 53", "Jo 3:16" ou o nome de um livro e escolha na lista.',
  },
  {
    target: () => '.help-btn',
    title: 'Quando quiser rever',
    body: 'Este botão abre de novo a apresentação e o tour.',
  },
]

// Em telas pequenas, uma dica de como usar o toque. Some sozinha ou ao fechar e não volta nesta aba.
function TouchTip() {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('lsl-desktop-tip') === 'off'
    } catch {
      return false
    }
  })
  const hide = () => {
    setHidden(true)
    try {
      sessionStorage.setItem('lsl-desktop-tip', 'off')
    } catch {}
  }
  useEffect(() => {
    if (hidden) return
    const t = setTimeout(hide, 9000)
    return () => clearTimeout(t)
  }, [hidden])
  if (hidden) return null
  return (
    <div className="desktop-tip" role="note">
      <p>
        <strong>Dica:</strong> toque num livro ou numa linha para ver os detalhes. Arraste pela base para percorrer os
        livros.
      </p>
      <button
        className="icon-btn"
        aria-label="Fechar dica"
        onClick={hide}
      >
        ✕
      </button>
    </div>
  )
}

function ActiveChips({ filters, setFilters, tiers, onReset }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const chips = []
  if (filters.tier !== DEFAULT_TIER && tiers) {
    const t = tiers[filters.tier]
    chips.push({ key: 'tier', label: `Força: ${tierName(t.pct)}`, clear: () => set({ tier: DEFAULT_TIER }) })
  }
  if (filters.scopes.size !== SCOPES.length) {
    chips.push({
      key: 'scopes',
      label: `Só ${SCOPES.filter((s) => filters.scopes.has(s.id)).map((s) => s.short).join(', ')}`,
      clear: () => set({ scopes: DEFAULT_FILTERS.scopes }),
    })
  }
  if (filters.sameBook) chips.push({ key: 'same', label: 'Inclui mesmo livro', clear: () => set({ sameBook: false }) })
  if (filters.groupsA.size || filters.groupsB.size) {
    const names = (s) => (s.size ? [...s].map((id) => GROUP_BY_ID[id].label).join(', ') : 'qualquer grupo')
    const preset = PRESETS.find(
      (p) =>
        p.a.length === filters.groupsA.size && p.a.every((g) => filters.groupsA.has(g)) &&
        p.b.length === filters.groupsB.size && p.b.every((g) => filters.groupsB.has(g)),
    )
    chips.push({
      key: 'groups',
      label: preset ? preset.label : `${names(filters.groupsA)} ↔ ${names(filters.groupsB)}`,
      clear: () => set({ groupsA: new Set(), groupsB: new Set() }),
    })
  }
  if (!chips.length) return null
  return (
    <div className="active-chips" aria-label="Filtros ativos">
      {chips.map((c) => (
        <button key={c.key} className="active-chip" onClick={c.clear} title="Remover filtro">
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button className="link-btn" onClick={onReset}>
          Limpar tudo
        </button>
      )}
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= WIDE)
  const autoClosed = useRef(false)
  // O capítulo guarda o livro a que pertence: trocar de livro volta naturalmente ao nível do livro.
  const [nav, setNav] = useState({ book: null, chapter: null, verse: null })
  const [pickedRef, setPickedRef] = useState(null)
  // Introdução: 'welcome' (modal), 'tour' (passos sobre a tela) ou null.
  const [intro, setIntro] = useState(() => (introWanted() ? 'welcome' : null))

  useEffect(() => {
    if (intro === 'welcome') markIntroShown()
  }, [intro])

  // O tema inicial vem do index.html (escolha salva ou preferência do sistema).
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', next === 'dark' ? '#2f2219' : '#e9dec6')
    try {
      localStorage.setItem('lsl-theme', next)
    } catch {}
    setTheme(next)
  }

  const focus = filters.focus
  const chapter = focus && nav.book === focus ? nav.chapter : null

  const overview = useAsync(() => loadXrefs(), [])
  const data = overview.data
  const bookRows = useAsync(() => (focus ? loadBookXrefs(focus) : null), [focus])
  const rows = bookRows.status === 'ready' ? bookRows.data : null

  const strength = useMemo(() => (data ? makeStrength(data) : () => 1), [data])
  const tier = data?.tiers[filters.tier]
  const minVotes = tier?.minVotes ?? 0
  const tierLabel = !tier ? '' : tier.pct >= 100 ? 'todas as referências' : tierName(tier.pct)

  const setFocus = useCallback((id) => {
    setFilters((f) => ({ ...f, focus: id }))
    setPickedRef(null)
  }, [])

  const openChapter = useCallback(
    (ch, verse = null, book = focus) => {
      setNav({ book, chapter: ch, verse })
      setPickedRef(null)
    },
    [focus],
  )

  // Abrir um capítulo em tela média recolhe a barra lateral; fechar devolve.
  useEffect(() => {
    if (chapter && sidebarOpen && window.innerWidth < ROOMY) {
      autoClosed.current = true
      setSidebarOpen(false)
    } else if (!chapter && autoClosed.current) {
      autoClosed.current = false
      setSidebarOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter])

  const { tissue, ghost, status } = useMemo(() => {
    if (overview.status !== 'ready') return { tissue: null, ghost: null, status: overview.status }
    if (!focus) return { tissue: overviewTissue(data, filters), ghost: null, status: 'ready' }
    if (!rows) return { tissue: null, ghost: null, status: bookRows.status }
    const book = bookTissue(rows, filters, minVotes, posIn)
    if (!chapter) return { tissue: book, ghost: null, status: 'ready' }
    return { tissue: chapterTissue(rows, filters, minVotes, chapter, posIn), ghost: book, status: 'ready' }
  }, [filters, overview.status, data, rows, bookRows.status, focus, chapter, minVotes])

  // Quantas referências cada recorte tem na força atual (para a barra lateral).
  const scopeCounts = useMemo(() => {
    if (!data) return null
    const counts = { AT: 0, cross: 0, NT: 0 }
    for (const row of data.pairs) {
      if (row[0] === row[1] && !filters.sameBook) continue
      counts[scopeOf(row[0], row[1])] += row[2 + filters.tier]
    }
    return counts
  }, [data, filters.tier, filters.sameBook])

  const book = focus ? BOOK_BY_ID[focus] : null

  const goChapter = useCallback(
    (ch) => {
      if (book && ch >= 1 && ch <= book.chapters) openChapter(ch)
    },
    [book, openChapter],
  )

  useEffect(() => {
    function onKey(e) {
      if (intro || e.target.closest('input, select, textarea')) return
      if (e.key === 'Escape') {
        // Sobe um nível por vez.
        if (pickedRef) setPickedRef(null)
        else if (chapter) openChapter(null)
        else if (focus) setFocus(null)
      }
      if (chapter && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        goChapter(chapter + (e.key === 'ArrowRight' ? 1 : -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intro, goChapter, pickedRef, chapter, focus, openChapter, setFocus])

  function startTour() {
    // O passo dos filtros aponta para a barra lateral; no desktop ela fica aberta durante o tour.
    if (window.innerWidth >= 900) setSidebarOpen(true)
    setIntro('tour')
  }

  function resetFilters() {
    setFilters((f) => ({ ...DEFAULT_FILTERS, focus: f.focus }))
  }

  function navigate({ book: b, chapter: ch, verse }) {
    setFocus(b.id)
    setNav({ book: b.id, chapter: ch, verse })
  }

  const filterCount = activeFilterCount(filters)
  const level = chapter ? 'chapter' : focus ? 'book' : 'bible'

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''} ${chapter ? 'panel-open' : ''}`}>
      <header className="topbar">
        <button
          className={`filters-toggle ${sidebarOpen ? 'on' : ''}`}
          onClick={() => setSidebarOpen((o) => !o)}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? 'Recolher filtros' : 'Mostrar filtros'}
        >
          <span aria-hidden="true">☰</span> Filtros
          {filterCount > 0 && <span className="count-badge">{filterCount}</span>}
        </button>
        <div className="brand">
          <h1>Linha sobre Linha</h1>
          <p>As referências cruzadas das Escrituras</p>
        </div>
        <SearchBox onNavigate={navigate} />
        <button
          className="icon-btn theme-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
        <button className="icon-btn help-btn" onClick={() => setIntro('welcome')} aria-label="Sobre o projeto e tutorial" title="Sobre e tutorial">
          ?
        </button>
      </header>

      <div className="workspace">
        <Sidebar
          open={sidebarOpen}
          filters={filters}
          setFilters={setFilters}
          data={data}
          scopeCounts={scopeCounts}
          focus={focus}
          chapter={chapter}
          onFocus={setFocus}
          onChapter={(ch) => openChapter(ch)}
          onClose={() => setSidebarOpen(false)}
          onReset={resetFilters}
        />
        {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

        <main className="main">
          <TouchTip />
          <div className="main-head">
            <nav className="crumbs" aria-label="Nível de zoom">
              <button onClick={() => setFocus(null)} disabled={!focus}>
                Bíblia
              </button>
              {book && (
                <>
                  <span aria-hidden="true">›</span>
                  <button onClick={() => openChapter(null)} disabled={!chapter}>
                    {book.pt}
                  </button>
                </>
              )}
              {chapter && (
                <>
                  <span aria-hidden="true">›</span>
                  <button disabled>Capítulo {chapter}</button>
                </>
              )}
            </nav>
            {tissue && (
              <p className="stats">
                <strong>{fmt(tissue.refs)}</strong> referência{tissue.refs === 1 ? '' : 's'}
                {level === 'book' ? ` com ${book.pt}` : level === 'chapter' ? ` em ${book.abbr} ${chapter}` : ''}
                <span className="sep">·</span>
                {fmt(tissue.items.length)} arcos
                <span className="sep">·</span>
                {tierLabel}
              </p>
            )}
          </div>

          <ActiveChips filters={filters} setFilters={setFilters} tiers={data?.tiers} onReset={resetFilters} />

          <BookView
            tissue={tissue}
            ghost={ghost}
            status={status}
            strength={strength}
            focus={focus}
            chapter={chapter}
            pickedRef={pickedRef}
            onFocus={setFocus}
            onChapter={(ch) => openChapter(ch)}
            onPickRef={setPickedRef}
            onReset={resetFilters}
          />

          <div className="legend">
            <div className="legend-colors">
              {SCOPES.map((s) => (
                <span key={s.id}>
                  <i style={{ background: SCOPE_COLORS[s.id] }} /> {s.short}
                </span>
              ))}
            </div>
            <span className="legend-hint">
              {level === 'chapter'
                ? 'Espessura = força da referência · clique numa linha para ver os textos · ← → trocam de capítulo · Esc volta'
                : level === 'book'
                  ? 'Espessura = nº de referências · clique num capítulo ou numa linha para abrir · Esc volta à Bíblia'
                  : 'Espessura = nº de referências · passe o cursor sobre um livro para isolar suas ligações · clique para abrir'}
            </span>
          </div>

          <footer className="site-foot">
            <p>
              Referências:{' '}
              <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noreferrer">
                OpenBible.info
              </a>{' '}
              (CC-BY) · Texto: Almeida, domínio público · <a href="/privacidade">Privacidade</a>
            </p>
            <p className="credit">Desenvolvido por Leonardo D'avila</p>
          </footer>
        </main>
      </div>

      {chapter && (
        <ChapterPanel
          focus={focus}
          chapter={chapter}
          verse={nav.verse}
          rows={rows}
          rowsStatus={bookRows.status}
          filters={filters}
          minVotes={minVotes}
          tierLabel={tierLabel}
          strength={strength}
          pickedRef={pickedRef}
          onPickRef={setPickedRef}
          onClose={() => openChapter(null)}
          onChapter={goChapter}
        />
      )}

      {intro === 'welcome' && <WelcomeModal onStartTour={startTour} onClose={() => setIntro(null)} />}
      {intro === 'tour' && <Tour steps={TOUR_STEPS} onClose={() => setIntro(null)} />}
    </div>
  )
}
