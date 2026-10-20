import { useState } from 'react'
import { BOOKS, BOOK_BY_ID } from '../data/books.js'
import { GROUPS, PRESETS, SCOPES, formatShare } from '../lib/xrefs.js'
import AdSlot from './AdSlot.jsx'
import { SCOPE_COLORS } from './BookView.jsx'

const fmt = (n) => n.toLocaleString('pt-BR')
const sameSet = (set, list) => set.size === list.length && list.every((x) => set.has(x))
const tickLabel = (pct) => (pct >= 100 ? 'Todas' : pct.toLocaleString('pt-BR'))

function GroupPicker({ label, value, onChange }) {
  function toggle(id) {
    const next = new Set(value)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }
  return (
    <div className="group-picker">
      <span className="field-label">
        {label} <em>{value.size ? `${value.size} selecionado${value.size > 1 ? 's' : ''}` : 'qualquer grupo'}</em>
      </span>
      <div className="mini-chips">
        {GROUPS.map((g) => (
          <button key={g.id} className={value.has(g.id) ? 'on' : ''} aria-pressed={value.has(g.id)} onClick={() => toggle(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Sidebar({ open, filters, setFilters, data, scopeCounts, focus, chapter, onFocus, onChapter, onClose, onReset }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const tiers = data?.tiers
  const tier = tiers?.[filters.tier]
  const book = focus ? BOOK_BY_ID[focus] : null

  const hasGroups = filters.groupsA.size > 0 || filters.groupsB.size > 0
  const preset = PRESETS.find((p) => sameSet(filters.groupsA, p.a) && sameSet(filters.groupsB, p.b))
  // "Mais opções" começa aberto se já houver algo ativo lá dentro.
  const [showMore, setShowMore] = useState(() => (hasGroups && !preset) || filters.sameBook)

  function toggleScope(id) {
    setFilters((f) => {
      const scopes = new Set(f.scopes)
      scopes.has(id) ? scopes.delete(id) : scopes.add(id)
      return { ...f, scopes: scopes.size ? scopes : f.scopes }
    })
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Filtros" aria-hidden={!open}>
      <div className="sidebar-head">
        <h2>Filtros</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Recolher filtros" title="Recolher filtros">
          ‹
        </button>
      </div>

      <div className="sidebar-body">
        <section className="fsection" data-tour="strength">
          <h3>Força da conexão</h3>
          {tiers ? (
            <>
              <div className="strength-value">
                <strong>{tier.pct >= 100 ? 'Todas' : `Top ${tier.pct.toLocaleString('pt-BR')}%`}</strong>
                <span>
                  {fmt(scopeCounts ? scopeCounts.AT + scopeCounts.cross + scopeCounts.NT : data.totals[filters.tier])} referências
                </span>
              </div>
              <input
                type="range"
                className="strength-range"
                min="0"
                max={tiers.length - 1}
                step="1"
                value={filters.tier}
                onChange={(e) => set({ tier: Number(e.target.value) })}
                aria-label="Mostrar as conexões mais fortes"
                aria-valuetext={tier.pct >= 100 ? 'todas' : `top ${tier.pct}%`}
                style={{ '--fill': `${(filters.tier / (tiers.length - 1)) * 100}%` }}
              />
              <div className="range-ticks" aria-hidden="true">
                {tiers.map((t, i) => (
                  <button key={t.pct} className={i === filters.tier ? 'on' : ''} onClick={() => set({ tier: i })} tabIndex={-1}>
                    {tickLabel(t.pct)}
                  </button>
                ))}
              </div>
              <p className="help">
                {tier.pct >= 100
                  ? `Todas as ${fmt(data.total)} referências do OpenBible.info.`
                  : `${formatShare(tier.share)} das ${fmt(data.total)} referências do OpenBible.info: as mais apoiadas pelos leitores.`}
              </p>
            </>
          ) : (
            <p className="help">Carregando…</p>
          )}
        </section>

        <section className="fsection">
          <h3>Testamentos</h3>
          <div className="scope-list">
            {SCOPES.map((s) => (
              <label key={s.id} className={`scope-row ${filters.scopes.has(s.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={filters.scopes.has(s.id)} onChange={() => toggleScope(s.id)} />
                <span className="swatch" style={{ background: SCOPE_COLORS[s.id] }} />
                <span className="scope-name">{s.label}</span>
                <span className="scope-count">{scopeCounts ? fmt(scopeCounts[s.id]) : ''}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="fsection">
          <h3>Explorar ligações</h3>
          <div className="presets">
            {PRESETS.map((p) => {
              const on = preset === p
              return (
                <button
                  key={p.id}
                  className={`preset ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    on ? set({ groupsA: new Set(), groupsB: new Set() }) : set({ groupsA: new Set(p.a), groupsB: new Set(p.b) })
                  }
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className={`fsection more ${showMore ? 'open' : ''}`}>
          <button className="more-toggle" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
            <span>Mais opções</span>
            <span aria-hidden="true">{showMore ? '−' : '+'}</span>
          </button>

          {showMore && (
            <div className="more-body">
              <div className="sub">
                <span className="sub-title">Grupos personalizados</span>
                <GroupPicker label="De" value={filters.groupsA} onChange={(groupsA) => set({ groupsA })} />
                <div className="group-actions">
                  <button className="link-btn" onClick={() => set({ groupsA: filters.groupsB, groupsB: filters.groupsA })} disabled={!hasGroups}>
                    ⇅ Inverter
                  </button>
                  <button className="link-btn" onClick={() => set({ groupsA: new Set(), groupsB: new Set() })} disabled={!hasGroups}>
                    Limpar grupos
                  </button>
                </div>
                <GroupPicker label="Para" value={filters.groupsB} onChange={(groupsB) => set({ groupsB })} />
              </div>

              <div className="sub">
                <label className="switch-row">
                  <input type="checkbox" checked={filters.sameBook} onChange={(e) => set({ sameBook: e.target.checked })} />
                  <span>Incluir referências dentro do mesmo livro</span>
                </label>
              </div>

              <div className="sub">
                <span className="sub-title">Ir para</span>
                <div className="nav-fields">
                  <label>
                    <span className="field-label">Livro</span>
                    <select value={focus ?? ''} onChange={(e) => onFocus(e.target.value || null)}>
                      <option value="">Bíblia inteira</option>
                      <optgroup label="Antigo Testamento">
                        {BOOKS.filter((b) => b.t === 'AT').map((b) => (
                          <option key={b.id} value={b.id}>{b.pt}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Novo Testamento">
                        {BOOKS.filter((b) => b.t === 'NT').map((b) => (
                          <option key={b.id} value={b.id}>{b.pt}</option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Capítulo</span>
                    <select value={chapter ?? ''} onChange={(e) => onChapter(e.target.value ? Number(e.target.value) : null)} disabled={!book}>
                      <option value="">{book ? 'Todos' : '—'}</option>
                      {book &&
                        Array.from({ length: book.chapters }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}
        </section>

        <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR} className="ad-sidebar" />
      </div>

      <div className="sidebar-foot">
        <button className="btn btn-ghost" onClick={onReset}>
          Restaurar padrão
        </button>
      </div>
    </aside>
  )
}
