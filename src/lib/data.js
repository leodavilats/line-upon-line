import { useEffect, useState } from 'react'

// Carregamento sob demanda com cache em memória (a promessa fica guardada, então
// pedidos simultâneos do mesmo arquivo viram uma só requisição).
const cache = new Map()

function load(path) {
  if (!cache.has(path)) {
    const p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`)
      return res.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path)
}

/** Linhas [cap, vers, outroLivro, outroCap, outroVers, outroVersFinal, votos] do livro. */
export const loadBookXrefs = (bookId) => load(`xref/${bookId}.json`)

/** Versículos do capítulo (índice 0 = versículo 1). */
export const loadChapter = (bookId, ch) => load(`text/${bookId}/${ch}.json`)

export function useAsync(fn, deps) {
  const [state, setState] = useState({ status: 'idle', data: null })
  useEffect(() => {
    let alive = true
    const p = fn()
    if (!p) {
      setState({ status: 'idle', data: null })
      return
    }
    setState((s) => ({ status: 'loading', data: s.data }))
    p.then(
      (data) => alive && setState({ status: 'ready', data }),
      () => alive && setState({ status: 'error', data: null }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export function useChapterText(bookId, ch) {
  return useAsync(() => (bookId && ch ? loadChapter(bookId, ch) : null), [bookId, ch])
}
