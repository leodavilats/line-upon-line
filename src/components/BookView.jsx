import { useEffect, useMemo, useRef, useState } from 'react'
import { BOOKS, BOOK_BY_ID } from '../data/books.js'
import {
  BASELINE,
  VIEW,
  arcHeight,
  arcPath,
  chapterStep,
  computeLayout,
  lerpLayout,
  pickLabels,
  sampleArc,
  xAt,
} from '../lib/layout.js'
import { formatShare } from '../lib/xrefs.js'

// As páginas sobem em direção à lombada e mergulham na dobra, como num livro aberto de verdade.
const LEFT_PAGE =
  'M 800 86 C 788 62, 730 52, 640 52 C 460 54, 240 60, 44 70 L 44 792 C 240 786, 460 784, 640 786 C 730 788, 788 792, 800 808 Z'
const RIGHT_PAGE =
  'M 800 86 C 812 62, 870 52, 960 52 C 1140 54, 1360 60, 1556 70 L 1556 792 C 1360 786, 1140 784, 960 786 C 870 788, 812 792, 800 808 Z'
// Fita marcadora: sai da dobra, passa sobre a capa e pende abaixo do livro.
const RIBBON = 'M 795 800 C 797 826, 806 846, 818 872 L 816 878 L 810 870 L 803 880 C 790 852, 784 828, 783 800 Z'

// Cor por recorte (testamentos). Também usadas na legenda da barra lateral.
// O vinho (entre os testamentos) é o destaque; o ocre dentro do AT recua para o fundo.
export const SCOPE_COLORS = { AT: '#a08560', cross: '#962638', NT: '#245f73' }
const GHOST_COLOR = '#8a7458'
const NO_PRIORITY = new Set()

// Linhas tênues que evocam colunas de texto impresso.
const TEXT_LINES = (() => {
  const lines = []
  for (const [x0, x1] of [[96, 418], [452, 764], [836, 1148], [1182, 1504]]) {
    for (let i = 0, y = 128; y <= 640; i++, y += 15) {
      const end = i % 9 === 8 ? x0 + (x1 - x0) * 0.5 : x1
      lines.push(`M ${x0} ${y} H ${end}`)
    }
  }
  return lines.join(' ')
})()

export const fmtRef = (b, ch, v, last = 0) => `${BOOKS[b].abbr} ${ch}:${v}${last ? `-${last}` : ''}`

const MAGNET_PX = 14 // alcance mínimo do cursor até uma linha, em pixels de tela
const HYSTERESIS = 4 // unidades do desenho que outra linha precisa estar mais perto para roubar o destaque

// Distância de um ponto até a polilinha [x0, y0, x1, y1, …] (segmento a segmento, não só aos vértices).
function distToPolyline(pts, px, py) {
  let best = Infinity
  for (let k = 0; k < pts.length - 2; k += 2) {
    const ax = pts[k]
    const ay = pts[k + 1]
    const dx = pts[k + 2] - ax
    const dy = pts[k + 3] - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}

// Com poucos arcos visíveis, sobe a opacidade mínima para nada sumir.
function tissueStyle(item, tissue) {
  const t = Math.sqrt(item.count / tissue.max)
  const floor = tissue.items.length < 200 ? 0.32 : 0.08
  return { alpha: floor + (0.66 - floor) * t, width: 0.6 + 5 * t }
}

function useAnimatedLayout(target) {
  const [layout, setLayout] = useState(target)
  const current = useRef(target)
  useEffect(() => {
    const from = current.current
    if (from === target) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current.current = target
      setLayout(target)
      return
    }
    const t0 = performance.now()
    let raf
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 480)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      const next = k === 1 ? target : lerpLayout(from, target, e)
      current.current = next
      setLayout(next)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return layout
}

function TissueCanvas({ tissue, ghost, layout, dimmed }) {
  const ref = useRef(null)
  const drawRef = useRef(null)

  drawRef.current = () => {
    const canvas = ref.current
    const width = canvas?.clientWidth
    if (!width) return
    const dpr = window.devicePixelRatio || 1
    const scale = width / VIEW.w
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(VIEW.h * scale * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, -VIEW.x * scale * dpr, -VIEW.y * scale * dpr)
    ctx.clearRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h)
    ctx.lineCap = 'round'
    const stroke = (item, color, alpha, lw) => {
      const x1 = xAt(layout, item.a)
      const x2 = xAt(layout, item.z)
      const h = arcHeight(x1, x2)
      ctx.globalAlpha = alpha
      ctx.lineWidth = lw
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.moveTo(x1, BASELINE)
      ctx.bezierCurveTo(x1, BASELINE - h, x2, BASELINE - h, x2, BASELINE)
      ctx.stroke()
    }
    if (ghost) for (const item of ghost.items) stroke(item, GHOST_COLOR, 0.07, 0.6 + 2 * Math.sqrt(item.count / ghost.max))
    if (tissue) {
      for (const item of tissue.items) {
        const { alpha, width: lw } = tissueStyle(item, tissue)
        stroke(item, SCOPE_COLORS[item.scope], alpha, lw)
      }
    }
  }

  useEffect(() => drawRef.current())

  useEffect(() => {
    const ro = new ResizeObserver(() => drawRef.current())
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  return <canvas ref={ref} className={`xref-canvas ${dimmed ? 'dimmed' : ''}`} aria-hidden="true" />
}

const nRefs = (k) => `${k.toLocaleString('pt-BR')} referência${k === 1 ? '' : 's'}`

function tissueTip(item, focus, strength) {
  if (item.kind === 'pair') {
    return {
      title: item.a.b === item.z.b ? `Dentro de ${BOOKS[item.a.b].pt}` : `${BOOKS[item.a.b].pt} ↔ ${BOOKS[item.z.b].pt}`,
      line: nRefs(item.count),
      hint: `Clique para abrir ${BOOKS[item.near].pt}`,
    }
  }
  if (item.kind === 'chapter') {
    const name = BOOK_BY_ID[focus].pt
    return {
      title:
        item.ob === item.a.b ? `${name} ${item.ch} ↔ ${name} ${item.och}` : `${name} ${item.ch} ↔ ${BOOKS[item.ob].pt}`,
      line: nRefs(item.count),
      hint: `Clique para abrir o capítulo ${item.ch}`,
    }
  }
  const [ch, v, ob, och, ov, last, votes] = item.row
  return {
    title: `${fmtRef(item.a.b, ch, v)} ↔ ${fmtRef(ob, och, ov, last)}`,
    line: `Força: top ${formatShare(strength(votes))}`,
    hint: 'Clique para ver os textos',
  }
}

export default function BookView({ tissue, ghost, status, strength, focus, chapter, pickedRef, onFocus, onChapter, onPickRef, onReset }) {
  const wrapRef = useRef(null)
  const layersRef = useRef(null)
  const frame = useRef(0)
  const [tip, setTip] = useState(null)
  const [tHover, setTHover] = useState(null)
  // Livro (nível Bíblia) ou capítulo (nível livro) sob o cursor: realça as linhas que o tocam.
  const [spot, setSpot] = useState(null)

  const target = useMemo(() => computeLayout(focus), [focus])
  const layout = useAnimatedLayout(target)
  const labels = useMemo(() => {
    const shown = pickLabels(target, focus ? new Set([focus]) : NO_PRIORITY)
    if (focus) shown.delete(focus)
    return shown
  }, [target, focus])

  const samples = useMemo(
    () =>
      tissue?.items.map((item) => {
        const x1 = xAt(layout, item.a)
        const x2 = xAt(layout, item.z)
        return { item, x1, x2, pts: sampleArc(x1, x2), reach: 5 + tissueStyle(item, tissue).width / 2 }
      }) ?? [],
    [tissue, layout],
  )

  // Totais por livro / capítulo, para os balões dos rótulos.
  const totals = useMemo(() => {
    const books = new Map()
    const chapters = new Map()
    for (const item of tissue?.items ?? []) {
      books.set(item.a.b, (books.get(item.a.b) ?? 0) + item.count)
      if (item.z.b !== item.a.b) books.set(item.z.b, (books.get(item.z.b) ?? 0) + item.count)
      if (item.kind === 'chapter') chapters.set(item.ch, (chapters.get(item.ch) ?? 0) + item.count)
    }
    return { books, chapters }
  }, [tissue])

  const spotItems = useMemo(() => {
    if (!spot || !tissue) return []
    return tissue.items.filter((i) =>
      spot.kind === 'book' ? i.a.b === spot.b || i.z.b === spot.b : i.kind === 'chapter' && i.ch === spot.ch,
    )
  }, [spot, tissue])

  const focusLayout = focus ? layout[BOOK_BY_ID[focus].index] : null
  const step = focusLayout ? chapterStep(focusLayout.w, focusLayout.chapters) : 1

  const picked = pickedRef && tissue?.items.find((i) => i.key === pickedRef)
  const pickedX = picked && [xAt(layout, picked.a), xAt(layout, picked.z)]

  function tipPos(e) {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function findTissue({ clientX, clientY }) {
    const r = layersRef.current.getBoundingClientRect()
    const vx = VIEW.x + ((clientX - r.left) / r.width) * VIEW.w
    const vy = VIEW.y + ((clientY - r.top) / r.height) * VIEW.h
    if (vy > BASELINE + 2) return null
    // Ímã: alcance mínimo de MAGNET_PX na tela, seja qual for a espessura da linha.
    const magnet = MAGNET_PX / (r.width / VIEW.w)
    let best = null
    let bestD = Infinity
    let currentD = Infinity
    // Do maior para o menor: arcos fortes ganham em empate.
    for (let i = samples.length - 1; i >= 0; i--) {
      const s = samples[i]
      const reach = Math.max(s.reach, magnet)
      if (vx < Math.min(s.x1, s.x2) - reach || vx > Math.max(s.x1, s.x2) + reach) continue
      const d = distToPolyline(s.pts, vx, vy)
      if (s.item.key === tHover?.item.key) currentD = d
      if (d < bestD && d <= reach) {
        bestD = d
        best = s
      }
    }
    // Histerese: mantém a linha já destacada até outra ficar claramente mais perto.
    if (tHover && currentD <= Math.max(tHover.reach, magnet) && currentD - bestD < HYSTERESIS) {
      best = samples.find((s) => s.item.key === tHover.item.key) ?? best
    }
    if (best?.item.kind === 'pair') {
      const near = Math.abs(vx - best.x1) <= Math.abs(vx - best.x2) ? best.item.a.b : best.item.z.b
      best = { ...best, item: { ...best.item, near } }
    }
    return best
  }

  function onLayersMove(e) {
    // Sobre a faixa de livros/capítulos quem manda é o realce do rótulo.
    if (e.target.closest?.('.book-hit, .chapter') || !samples.length) return
    const pos = tipPos(e)
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const hit = findTissue({ clientX, clientY })
      setTHover(hit)
      setTip(hit ? { ...pos, ...tissueTip(hit.item, focus, strength), scope: hit.item.scope } : null)
    })
  }

  function clearHover() {
    cancelAnimationFrame(frame.current)
    setTHover(null)
    setTip(null)
  }

  function onPageClick() {
    const item = tHover?.item
    if (!item) return
    clearHover()
    if (item.kind === 'pair') onFocus(BOOKS[item.near].id)
    else if (item.kind === 'chapter') onChapter(item.ch)
    else onPickRef(item.key)
  }

  function spotOn(e, next, info) {
    clearHover()
    setSpot(next)
    setTip({ ...tipPos(e), ...info })
  }
  function spotOff() {
    setSpot(null)
    setTip(null)
  }

  const empty = status === 'ready' && tissue && tissue.items.length === 0

  return (
    <div className="book" ref={wrapRef}>
      <div className="book-scroll">
        <div
          className={`book-layers ${tHover ? 'pointing' : ''}`}
          ref={layersRef}
          onMouseMove={onLayersMove}
          onMouseLeave={clearHover}
        >
          {/* Camada 1: o livro */}
          <svg className="book-svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Bíblia aberta com as referências cruzadas desenhadas como arcos">
            <defs>
              <linearGradient id="leather" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5e271d" />
                <stop offset="1" stopColor="#38160f" />
              </linearGradient>
              <linearGradient id="page-left" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#ecdcb8" />
                <stop offset="0.12" stopColor="#f6ecd5" />
                <stop offset="0.86" stopColor="#f8f0dd" />
                <stop offset="1" stopColor="#d3bd92" />
              </linearGradient>
              <linearGradient id="page-right" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0" stopColor="#ecdcb8" />
                <stop offset="0.12" stopColor="#f6ecd5" />
                <stop offset="0.86" stopColor="#f8f0dd" />
                <stop offset="1" stopColor="#d3bd92" />
              </linearGradient>
              {/* Sombra da dobra: a luz não alcança o fundo da calha. */}
              <linearGradient id="gutter" gradientUnits="userSpaceOnUse" x1="600" y1="0" x2="1000" y2="0">
                <stop offset="0" stopColor="#4a2c14" stopOpacity="0" />
                <stop offset="0.3" stopColor="#4a2c14" stopOpacity="0.05" />
                <stop offset="0.44" stopColor="#4a2c14" stopOpacity="0.2" />
                <stop offset="0.5" stopColor="#4a2c14" stopOpacity="0.42" />
                <stop offset="0.56" stopColor="#4a2c14" stopOpacity="0.2" />
                <stop offset="0.7" stopColor="#4a2c14" stopOpacity="0.05" />
                <stop offset="1" stopColor="#4a2c14" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#5e1018" />
                <stop offset="0.5" stopColor="#8e1d27" />
                <stop offset="1" stopColor="#6a141c" />
              </linearGradient>
            </defs>

            <rect x="20" y="40" width="1560" height="786" rx="20" fill="url(#leather)" />
            <rect x="30" y="50" width="1540" height="766" rx="13" className="cover-tooling" />
            {/* Espessura do miolo: folhas empilhadas para fora e para baixo, com corte dourado. */}
            {[5, 4, 3, 2, 1].map((i) => (
              <g key={i} className={`page-edge ${i % 2 ? '' : 'alt'}`}>
                <path d={LEFT_PAGE} transform={`translate(${-i * 2} ${i * 1.5})`} />
                <path d={RIGHT_PAGE} transform={`translate(${i * 2} ${i * 1.5})`} />
              </g>
            ))}
            <path d={RIBBON} fill="url(#ribbon)" className="ribbon" />
            <g onClick={onPageClick}>
              <path d={LEFT_PAGE} fill="url(#page-left)" />
              <path d={RIGHT_PAGE} fill="url(#page-right)" />
              <path d={TEXT_LINES} className="text-lines" />
              <path d={`${LEFT_PAGE} ${RIGHT_PAGE}`} fill="url(#gutter)" />
              <path d="M 800 86 V 808" className="spine" />
            </g>

            <line x1="80" y1={BASELINE} x2="780" y2={BASELINE} className="baseline" />
            <line x1="820" y1={BASELINE} x2="1520" y2={BASELINE} className="baseline" />
            {layout.map((b, i) =>
              b.id === focus ? null : (
                <g
                  key={b.id}
                  className={`book-hit ${spot?.kind === 'book' && spot.b === i ? 'on' : ''}`}
                  onClick={() => {
                    spotOff()
                    onFocus(b.id)
                  }}
                  onMouseEnter={(e) =>
                    spotOn(e, { kind: 'book', b: i }, {
                      title: b.pt,
                      line: `${b.chapters} capítulo${b.chapters > 1 ? 's' : ''} · ${nRefs(totals.books.get(i) ?? 0)}${focus ? ` com ${BOOK_BY_ID[focus].pt}` : ''}`,
                      hint: 'Clique para abrir o livro',
                    })
                  }
                  onMouseLeave={spotOff}
                >
                  <rect x={b.x} y={BASELINE + 1} width={b.w} height="56" className="book-hit-area" />
                  <rect x={b.x + 0.4} y={BASELINE + 3} width={Math.max(b.w - 0.8, 0.6)} height="6" className={`book-band ${i % 2 ? 'odd' : ''}`} />
                  {labels.has(b.id) && (
                    <text transform={`translate(${b.cx} ${BASELINE + 16}) rotate(90)`} className="book-label">
                      {b.abbr}
                    </text>
                  )}
                </g>
              ),
            )}

            {focusLayout && (
              <g className="chapters">
                {Array.from({ length: focusLayout.chapters }, (_, k) => {
                  const c = k + 1
                  const cw = focusLayout.w / focusLayout.chapters
                  const x = focusLayout.x + cw * k
                  const showNum = c === 1 || c % step === 0 || c === chapter
                  return (
                    <g
                      key={c}
                      className={`chapter ${c === chapter ? 'on' : ''} ${spot?.kind === 'chapter' && spot.ch === c ? 'hot' : ''}`}
                      onClick={() => {
                        spotOff()
                        onChapter(c === chapter ? null : c)
                      }}
                      onMouseEnter={(e) =>
                        spotOn(e, { kind: 'chapter', ch: c }, {
                          title: `${focusLayout.pt} ${c}`,
                          line: chapter ? 'Clique para abrir' : nRefs(totals.chapters.get(c) ?? 0),
                          hint: c === chapter ? 'Clique para fechar o capítulo' : 'Clique para abrir o capítulo',
                        })
                      }
                      onMouseLeave={spotOff}
                    >
                      <rect x={x} y={BASELINE + 1} width={cw} height="32" className="chapter-hit" />
                      <rect x={x + 0.3} y={BASELINE + 3} width={Math.max(cw - 0.6, 0.4)} height="8" className={`chapter-band ${k % 2 ? 'odd' : ''}`} />
                      {showNum && (
                        <text x={x + cw / 2} y={BASELINE + 24} className="chapter-num">
                          {c}
                        </text>
                      )}
                    </g>
                  )
                })}
                <text x={focusLayout.cx} y={BASELINE + 48} className="focus-name">
                  {focusLayout.pt}
                </text>
              </g>
            )}

            <text x="420" y="776" className="testament-label">Antigo Testamento</text>
            <text x="1180" y="776" className="testament-label">Novo Testamento</text>
          </svg>

          {/* Camada 2: tecido de referências */}
          <TissueCanvas tissue={tissue} ghost={ghost} layout={layout} dimmed={spotItems.length > 0 || Boolean(picked)} />

          {/* Camada 3: destaques */}
          <svg className="book-svg book-fg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
            {spotItems.map((item) => (
              <path
                key={item.key}
                d={arcPath(xAt(layout, item.a), xAt(layout, item.z))}
                className="spot-arc"
                style={{ stroke: SCOPE_COLORS[item.scope], strokeWidth: 0.8 + 3.5 * Math.sqrt(item.count / tissue.max) }}
              />
            ))}
            {tHover && (
              <path d={arcPath(tHover.x1, tHover.x2)} className="hover-arc" style={{ stroke: SCOPE_COLORS[tHover.item.scope] }} />
            )}
            {pickedX && (
              <>
                <path d={arcPath(pickedX[0], pickedX[1])} className="picked-arc" style={{ stroke: SCOPE_COLORS[picked.scope] }} />
                <g className="endpoint-labels">
                  {[
                    [pickedX[0], fmtRef(picked.a.b, picked.row[0], picked.row[1])],
                    [pickedX[1], fmtRef(picked.row[2], picked.row[3], picked.row[4], picked.row[5])],
                  ]
                    .sort((p, q) => p[0] - q[0])
                    .map(([x, label], i) => (
                      <text key={label} x={i ? x + 7 : x - 7} y={BASELINE - 9} textAnchor={i ? 'start' : 'end'}>
                        {label}
                      </text>
                    ))}
                </g>
              </>
            )}
          </svg>

          {(status === 'loading' || empty) && (
            <div className="book-message" role="status">
              {status === 'loading' ? (
                <p>Carregando referências…</p>
              ) : (
                <>
                  <p>Nenhuma referência com estes filtros.</p>
                  <button className="btn" onClick={onReset}>
                    Limpar filtros
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {tip && (
        <div
          className={`tooltip ${tip.x > (wrapRef.current?.clientWidth ?? 0) - 320 ? 'flip-x' : ''} ${tip.y > (wrapRef.current?.clientHeight ?? 0) - 110 ? 'flip-y' : ''}`}
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.scope && <span className="dot" style={{ background: SCOPE_COLORS[tip.scope] }} />}
          <strong>{tip.title}</strong>
          <span className="tooltip-line">{tip.line}</span>
          <span className="tooltip-hint">{tip.hint}</span>
        </div>
      )}
    </div>
  )
}
