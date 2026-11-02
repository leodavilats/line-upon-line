import { BOOKS, BOOK_BY_ID } from '../data/books.js'
import { loadBookXrefs } from '../lib/data.js'
import { GROUPS } from '../lib/xrefs.js'

// Navegação por listas, usada só no celular (o CSS a esconde no computador). O livro desenhado
// continua acima como ilustração; aqui ficam os alvos grandes e confiáveis para o dedo, já que
// na tela pequena um livro ou capítulo no desenho tem poucos pixels e é difícil de acertar.
export default function MobileNav({ focus, onFocus, onChapter }) {
  if (focus) {
    const book = BOOK_BY_ID[focus]
    return (
      <nav className="mobile-nav" aria-label={`Capítulos de ${book.pt}`}>
        <p className="mnav-title">Toque num capítulo de {book.pt}</p>
        <div className="chapter-grid">
          {Array.from({ length: book.chapters }, (_, i) => (
            <button key={i + 1} onClick={() => onChapter(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
      </nav>
    )
  }
  return (
    <nav className="mobile-nav" aria-label="Livros da Bíblia">
      <p className="mnav-title">Toque num livro</p>
      {GROUPS.map((g) => {
        const books = BOOKS.slice(BOOK_BY_ID[g.from].index, BOOK_BY_ID[g.to].index + 1)
        return (
          <section key={g.id} className="mnav-group">
            <h3>{g.label}</h3>
            <div className="book-grid">
              {books.map((b) => (
                <button key={b.id} onClick={() => onFocus(b.id)} onPointerDown={() => loadBookXrefs(b.id)}>
                  {b.pt}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </nav>
  )
}
