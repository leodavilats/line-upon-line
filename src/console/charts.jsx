import { useState } from 'react'

const fmt = (n) => n.toLocaleString('pt-BR')
const W = 1000
const H = 220
const PAD = { top: 12, right: 8, bottom: 28, left: 40 }

// Arredonda o topo da escala para um número "redondo" (1, 2, 5 × 10ⁿ).
function niceMax(v) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 5, 10].map((m) => m * p).find((n) => n >= v)
}

const dayLabel = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', opts)

/** Barras de visitas por dia: uma série, um eixo, dica ao passar o cursor e tabela alternativa. */
export function DailyChart({ rows }) {
  const [hover, setHover] = useState(null)
  const max = niceMax(Math.max(...rows.map((r) => r.visits), 0))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const step = plotW / rows.length
  const gap = Math.min(2, step * 0.3)
  const barW = Math.max(step - gap, 1)
  const y = (v) => PAD.top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]
  const labelIdx = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])]
  const h = hover !== null ? rows[hover] : null

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visitas por dia no período" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={PAD.left - 8} y={y(t)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {fmt(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = PAD.left + i * step + gap / 2
          const top = y(r.visits)
          const bh = PAD.top + plotH - top
          const rad = Math.min(4, barW / 2, bh)
          // Topo arredondado, base reta apoiada no eixo.
          const d = bh > 0
            ? `M ${x} ${top + bh} V ${top + rad} Q ${x} ${top} ${x + rad} ${top} H ${x + barW - rad} Q ${x + barW} ${top} ${x + barW} ${top + rad} V ${top + bh} Z`
            : null
          return (
            <g key={r.day} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.left + i * step} y={PAD.top} width={step} height={plotH} className="hit" />
              {d && <path d={d} className={`bar ${hover === i ? 'on' : ''}`} />}
            </g>
          )
        })}
        {labelIdx.map((i) => (
          <text key={i} x={PAD.left + i * step + step / 2} y={H - 8} className="axis-label" textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}>
            {dayLabel(rows[i].day, { day: '2-digit', month: 'short' })}
          </text>
        ))}
      </svg>
      {h && (
        <div
          className="chart-tip"
          style={{ left: `${((PAD.left + hover * step + step / 2) / W) * 100}%`, transform: hover > rows.length / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}
        >
          <strong>{dayLabel(h.day, { weekday: 'short', day: '2-digit', month: 'short' })}</strong>
          <span>{fmt(h.visits)} visita{h.visits === 1 ? '' : 's'}</span>
          <span>{fmt(h.visitors)} visitante{h.visitors === 1 ? '' : 's'}</span>
        </div>
      )}
      <details className="table-toggle">
        <summary>Ver como tabela</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th className="num">Visitas</th>
                <th className="num">Visitantes</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.day}>
                  <td>{dayLabel(r.day, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                  <td className="num">{fmt(r.visits)}</td>
                  <td className="num">{fmt(r.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** Ranking em barras horizontais (uma série): rótulo, barra, valor e fatia do total. */
export function BarList({ title, rows, total }) {
  const max = Math.max(...rows.map((r) => r.n), 1)
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.length ? (
        <ul className="barlist">
          {rows.map((r) => (
            <li key={r.label} title={`${r.label}: ${fmt(r.n)} visita${r.n === 1 ? '' : 's'}`}>
              <span className="bl-label">{r.label}</span>
              <span className="bl-track">
                <span className="bl-bar" style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
              <span className="bl-value">{fmt(r.n)}</span>
              <span className="bl-share">{total ? `${Math.round((r.n / total) * 100)}%` : ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Sem dados.</p>
      )}
    </section>
  )
}
