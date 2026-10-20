import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const SESSION_KEY = 'lp-intro-shown'
const NEVER_KEY = 'lp-intro-never'

// O armazenamento pode falhar (janela anônima, bloqueio); a página funciona sem ele.
const store = {
  get: (s, k) => {
    try {
      return s.getItem(k)
    } catch {
      return null
    }
  },
  set: (s, k, v) => {
    try {
      s.setItem(k, v)
    } catch {}
  },
}

/** A introdução aparece uma vez por aba (sessionStorage), salvo "não mostrar novamente". */
export const introWanted = () => !store.get(localStorage, NEVER_KEY) && !store.get(sessionStorage, SESSION_KEY)
export const markIntroShown = () => store.set(sessionStorage, SESSION_KEY, '1')

export function WelcomeModal({ onStartTour, onClose }) {
  const [never, setNever] = useState(false)
  const primary = useRef(null)

  useEffect(() => {
    primary.current?.focus()
    const onKey = (e) => e.key === 'Escape' && finish(onClose)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function finish(next) {
    if (never) store.set(localStorage, NEVER_KEY, '1')
    next()
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && finish(onClose)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <button className="icon-btn modal-close" onClick={() => finish(onClose)} aria-label="Fechar">
          ✕
        </button>
        <span className="eyebrow">Boas-vindas</span>
        <h2 id="welcome-title">Linha sobre Linha</h2>
        <p className="lead">
          A Escritura explica a própria Escritura. Este mapa desenha as referências cruzadas da Bíblia, cerca de 345 mil
          ligações entre passagens que tratam do mesmo tema, como arcos entre as páginas de uma Bíblia aberta.
        </p>
        <p className="modal-desktop-tip">
          <strong>Dica:</strong> para a melhor experiência, acesse pelo computador. Numa tela maior, o livro e as ligações
          ficam muito mais fáceis de ver e de clicar.
        </p>
        <ul className="features">
          <li>
            <strong>Do panorama ao versículo</strong>
            <span>Comece pela Bíblia inteira, aproxime-se de um livro e chegue ao capítulo.</span>
          </li>
          <li>
            <strong>As ligações mais fortes</strong>
            <span>Filtre pelas referências mais apoiadas pelos leitores e pelos testamentos.</span>
          </li>
          <li>
            <strong>Leia lado a lado</strong>
            <span>Abra um capítulo e veja, sob cada versículo, o texto das passagens relacionadas.</span>
          </li>
        </ul>
        <div className="modal-actions">
          <label className="switch-row">
            <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
            <span>Não mostrar novamente</span>
          </label>
          <div className="modal-buttons">
            <button className="btn btn-ghost" onClick={() => finish(onClose)}>
              Pular
            </button>
            <button className="btn" ref={primary} onClick={() => finish(onStartTour)}>
              Fazer o tour
            </button>
          </div>
        </div>
        <p className="modal-credit">Desenvolvido por Leonardo D'avila (@oleodavila)</p>
      </div>
    </div>
  )
}

const BALLOON_W = 340
const GAP = 14
const PAD = 8

function place(rect, balloonH) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clampX = (x) => Math.max(12, Math.min(x, vw - BALLOON_W - 12))
  const clampY = (y) => Math.max(12, Math.min(y, vh - balloonH - 12))
  if (vh - rect.bottom >= balloonH + GAP + PAD) {
    return { top: rect.bottom + GAP + PAD, left: clampX(rect.left + rect.width / 2 - BALLOON_W / 2), arrow: 'up' }
  }
  if (vw - rect.right >= BALLOON_W + GAP + PAD) {
    return { top: clampY(rect.top + rect.height / 2 - balloonH / 2), left: rect.right + GAP + PAD, arrow: 'left' }
  }
  if (rect.top >= balloonH + GAP + PAD) {
    return { top: rect.top - balloonH - GAP - PAD, left: clampX(rect.left + rect.width / 2 - BALLOON_W / 2), arrow: 'down' }
  }
  // Alvo grande (o livro): o balão fica dentro dele, perto do topo.
  return { top: clampY(rect.top + 40), left: clampX(rect.left + rect.width / 2 - BALLOON_W / 2), arrow: null }
}

/**
 * Tour guiado: destaca um elemento real da página por passo.
 * steps: [{ target: () => seletor, title, body }]
 */
export function Tour({ steps, onClose }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [balloonH, setBalloonH] = useState(180)
  const balloon = useRef(null)
  const step = steps[i]
  const last = i === steps.length - 1

  useLayoutEffect(() => {
    let el = null
    function measure() {
      el = document.querySelector(step.target())
      setRect(el ? el.getBoundingClientRect() : null)
    }
    el = document.querySelector(step.target())
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    measure()
    // Medidas de novo após animações (barra lateral, rolagem suave).
    const timers = [150, 400].map((ms) => setTimeout(measure, ms))
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  useLayoutEffect(() => {
    if (balloon.current) setBalloonH(balloon.current.offsetHeight)
  }, [i, rect])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') last ? onClose() : setI(i + 1)
      if (e.key === 'ArrowLeft' && i > 0) setI(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, last, onClose])

  const pos = rect ? place(rect, balloonH) : { top: window.innerHeight / 2 - balloonH / 2, left: window.innerWidth / 2 - BALLOON_W / 2, arrow: null }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour guiado">
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      ) : (
        <div className="tour-shade" />
      )}
      <div ref={balloon} className={`tour-balloon ${pos.arrow ? `arrow-${pos.arrow}` : ''}`} style={{ top: pos.top, left: pos.left, width: BALLOON_W }}>
        <span className="tour-progress">
          {i + 1} de {steps.length}
        </span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="link-btn" onClick={onClose}>
            Pular tour
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button className="btn btn-ghost" onClick={() => setI(i - 1)}>
                Anterior
              </button>
            )}
            <button className="btn" onClick={() => (last ? onClose() : setI(i + 1))} autoFocus>
              {last ? 'Concluir' : 'Próximo'}
            </button>
          </div>
        </div>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((s, k) => (
            <i key={s.title} className={k === i ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  )
}
