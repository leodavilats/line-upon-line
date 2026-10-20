import { useMemo, useRef, useState } from 'react'
import { suggest } from '../lib/search.js'

export default function SearchBox({ onNavigate }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const options = useMemo(() => suggest(query), [query])

  function choose(option) {
    if (!option) return
    onNavigate(option)
    setQuery('')
    setOpen(false)
    // Devolve o teclado à página (setas e Esc passam a valer).
    inputRef.current?.blur()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      choose(options[active])
    } else if (e.key === 'Escape') {
      setQuery('')
      inputRef.current?.blur()
    }
  }

  const showList = open && query.trim()

  return (
    <div className="searchbox" role="combobox" aria-expanded={Boolean(showList)} aria-haspopup="listbox">
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        placeholder="Ir para… Is 53, Jo 3:16, Salmos"
        aria-label="Ir para um livro, capítulo ou versículo"
        aria-controls="search-options"
      />
      {showList && (
        <ul className="search-options" id="search-options" role="listbox">
          {options.length ? (
            options.map((o, i) => (
              <li key={o.label} role="option" aria-selected={i === active}>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}>
                  <span>{o.label}</span>
                  <span className="opt-kind">{o.verse ? 'versículo' : o.chapter ? 'capítulo' : 'livro'}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="no-options">Nenhum livro encontrado. Tente “Is 53” ou “Romanos 8”.</li>
          )}
        </ul>
      )}
    </div>
  )
}
