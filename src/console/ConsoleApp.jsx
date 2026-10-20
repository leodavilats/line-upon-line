import { useCallback, useEffect, useState } from 'react'
import { BarList, DailyChart } from './charts.jsx'

const RANGES = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 365, label: '12 meses' },
]
const TZ = 'America/Sao_Paulo'
const fmt = (n) => n.toLocaleString('pt-BR')
const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return (code) => (code && code.length === 2 ? names.of(code) : code)
  } catch {
    return (code) => code
  }
})()
const DEVICE = { desktop: 'Computador', mobile: 'Celular', tablet: 'Tablet', smarttv: 'TV', console: 'Console de jogos', wearable: 'Vestível' }

export function duration(s) {
  if (!s || s < 1) return '< 1 s'
  if (s < 60) return `${Math.round(s)} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${Math.round(s % 60)} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

async function api(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `HTTP ${res.status}`), { status: res.status })
  return body
}

function Login({ onLogin, notice }) {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(notice)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const me = await api('/api/console/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }),
      })
      onLogin(me.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">Console</span>
        <h1>Linha sobre Linha</h1>
        <label>
          <span>Usuário</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

function Delta({ now, before }) {
  if (!before) return <span className="delta">sem período anterior</span>
  const pct = Math.round(((now - before) / before) * 100)
  return (
    <span className="delta">
      {pct === 0 ? '=' : pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% vs. período anterior
    </span>
  )
}

function Tile({ label, value, children }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {children}
    </div>
  )
}

function Dashboard({ user, onLogout }) {
  const [days, setDays] = useState(30)
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }))
    try {
      setState({ status: 'ready', data: await api(`/api/console/stats?days=${days}`), error: null })
    } catch (err) {
      if (err.status === 401) return onLogout()
      setState((s) => ({ ...s, status: 'error', error: err.message }))
    }
  }, [days, onLogout])

  useEffect(() => {
    load()
  }, [load])

  const d = state.data
  const cur = d?.current
  const label = (row, map) => ({ ...row, label: map(row.label) })

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <span className="eyebrow">Console</span>
          <h1>Linha sobre Linha</h1>
        </div>
        <div className="dash-tools">
          <div className="segmented" role="group" aria-label="Período">
            {RANGES.map((r) => (
              <button key={r.days} className={r.days === days ? 'on' : ''} aria-pressed={r.days === days} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={load} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button className="btn btn-ghost" onClick={onLogout} title={`Conectado como ${user}`}>
            Sair
          </button>
        </div>
      </header>

      {state.status === 'error' && <p className="banner" role="alert">{state.error}</p>}

      {d && (
        <>
          <section className="tiles" aria-label="Resumo do período">
            <Tile label="Visitas" value={fmt(cur.visits)}>
              <Delta now={cur.visits} before={d.previous.visits} />
            </Tile>
            <Tile label="Visitantes únicos" value={fmt(cur.visitors)}>
              <Delta now={cur.visitors} before={d.previous.visitors} />
            </Tile>
            <Tile label="Visitas de novos visitantes" value={cur.visits ? `${Math.round((cur.new_visits / cur.visits) * 100)}%` : '—'}>
              <span className="delta">{fmt(cur.new_visits)} primeiras visitas</span>
            </Tile>
            <Tile label="Duração mediana" value={cur.visits ? duration(cur.median_s) : '—'}>
              <span className="delta">metade das visitas dura mais que isso</span>
            </Tile>
            <Tile label="Agora" value={fmt(d.active)}>
              <span className="delta">ativos nos últimos 5 min</span>
            </Tile>
          </section>

          <section className="card">
            <h2>Visitas por dia</h2>
            <DailyChart rows={d.daily} />
          </section>

          <section className="grid">
            <BarList title="Países" rows={d.countries.map((r) => label(r, regionName))} total={cur.visits} />
            <BarList title="Cidades" rows={d.cities} total={cur.visits} />
            <BarList title="Dispositivos" rows={d.devices.map((r) => label(r, (v) => DEVICE[v] ?? v))} total={cur.visits} />
            <BarList title="Navegadores" rows={d.browsers} total={cur.visits} />
            <BarList title="Sistemas" rows={d.systems} total={cur.visits} />
            <BarList title="Origem" rows={d.referrers} total={cur.visits} />
          </section>

          <section className="card">
            <h2>Acessos recentes</h2>
            {d.recent.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Duração</th>
                      <th>Local</th>
                      <th>Dispositivo</th>
                      <th>Navegador</th>
                      <th>Sistema</th>
                      <th>Tela</th>
                      <th>Idioma</th>
                      <th>Origem</th>
                      <th>Visitante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.recent.map((v) => (
                      <tr key={`${v.started_at}-${v.screen}-${v.city}`}>
                        <td className="nowrap">
                          {new Date(v.started_at).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="num">{duration(v.duration_s)}</td>
                        <td>{[v.city, v.region, regionName(v.country)].filter(Boolean).join(', ') || '—'}</td>
                        <td>{DEVICE[v.device_type] ?? v.device_type ?? '—'}</td>
                        <td>{v.browser ?? '—'}</td>
                        <td>{v.os ?? '—'}</td>
                        <td className="num">{v.screen ?? '—'}</td>
                        <td>{v.language ?? '—'}</td>
                        <td>{v.referrer ?? 'Acesso direto'}</td>
                        <td>{v.is_new ? 'Novo' : 'Recorrente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">Nenhum acesso neste período.</p>
            )}
            <p className="note">
              Mostrando os {fmt(d.recent.length)} acessos mais recentes do período. Localização estimada pelo IP, que não é
              armazenado. Horários de Brasília.
            </p>
          </section>
        </>
      )}
      {!d && state.status === 'loading' && <p className="empty">Carregando…</p>}
    </div>
  )
}

export default function ConsoleApp() {
  const [auth, setAuth] = useState({ status: 'checking', user: null, notice: null })

  useEffect(() => {
    api('/api/console/me')
      .then((me) => setAuth({ status: 'in', user: me.user }))
      .catch((err) => setAuth({ status: 'out', user: null, notice: err.status === 503 ? err.message : null }))
  }, [])

  const logout = useCallback(async () => {
    await api('/api/console/logout', { method: 'POST' }).catch(() => {})
    setAuth({ status: 'out', user: null, notice: null })
  }, [])

  if (auth.status === 'checking') return <p className="empty">Carregando…</p>
  if (auth.status === 'out') return <Login notice={auth.notice} onLogin={(user) => setAuth({ status: 'in', user })} />
  return <Dashboard user={auth.user} onLogout={logout} />
}
