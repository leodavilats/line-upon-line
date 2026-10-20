# Linha sobre Linha

> "Pois é preceito sobre preceito, preceito sobre preceito; regra sobre regra, regra sobre regra; um pouco aqui, um pouco ali." (Isaías 28:10, Almeida)
>
> O nome vem deste versículo: no hebraico, *qav laqav* é literalmente "linha sobre linha" (*qav* = linha, cordel de medir), como traduz a King James ("line upon line"). Daí também o nome do repositório, **line-upon-line**.

Uma Bíblia aberta interativa que desenha as ~345 mil referências cruzadas do OpenBible.info como arcos entre as páginas.

Há três níveis de zoom:

1. **Bíblia**: arcos livro ↔ livro, agregados. Passe o cursor sobre um livro para isolar as ligações dele.
2. **Livro**: o livro se expande em lente e mostra seus capítulos; os arcos saem de cada capítulo.
3. **Capítulo**: cada referência versículo a versículo, com um painel de leitura que mostra o texto do capítulo e, sob cada versículo, as passagens relacionadas.

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173
```

Os dados gerados (`public/data/` e `src/data/verseCounts.json`) já estão no projeto. Para regenerá-los:

```bash
npm run build-data              # usa o cache em data-raw/
npm run build-data -- --refresh # baixa as fontes de novo
```

## Força da conexão

Em vez de votos, cada referência tem uma **força em percentil**: "top 3%" quer dizer que só 3% das 343.570 referências têm pelo menos tantos votos quanto ela no OpenBible.info. O filtro mostra as X% mais fortes (0,025%, 0,5%, 1%, 2%, 5%, 10%, 25%, 50% ou todas). O padrão, ao abrir e ao restaurar, é **todas**. Top 0,025% são as 83 referências com 384 votos ou mais.

Como muitas referências empatam no número de votos, a fatia real de cada faixa fica um pouco abaixo da nominal (por exemplo, "top 5%" corresponde a 21 votos ou mais, ou 4,76% do total). A barra lateral mostra o valor real.

## Boas-vindas e tour

A cada aba nova aparece um modal com o objetivo do projeto, seguido opcionalmente de um tour guiado que destaca os elementos reais da tela (livro, níveis, filtros, busca, ajuda). Dá para pular a qualquer momento, marcar "não mostrar novamente" (guardado no navegador) e reabrir pelo botão **?** no topo.

## Filtros (barra lateral)

| Seção | O que faz |
|---|---|
| Força da conexão | mostra só as X% referências mais fortes |
| Testamentos | dentro do AT, entre os testamentos, dentro do NT (as cores dos arcos seguem essa divisão) |
| Explorar ligações | atalhos prontos, como Profetas ↔ Evangelhos |
| Mais opções (recolhido) | grupos personalizados De/Para, incluir referências dentro do mesmo livro, ir para livro e capítulo |

Os filtros ativos aparecem como chips removíveis acima do livro, e o botão "Filtros" mostra quantos estão ativos.

## Interação

- Clique num livro (ou numa linha do nível Bíblia) para abri-lo; clique num capítulo, ou numa linha que sai dele, para abrir o capítulo.
- As linhas têm um "ímã": a mais próxima do cursor (até ~14 px) acende e recebe o clique, sem precisar acertar a linha fina.
- Recolher a barra lateral aumenta o livro.
- No capítulo, clique numa linha para destacá-la no painel, ou numa referência do painel para destacá-la no livro.
- As setas ← → trocam de capítulo. Esc sobe um nível.
- A busca sugere livros enquanto você digita ("jo 3:16" leva a João 3, já rolado até o versículo 16).

## Estrutura

```
src/
  data/
    books.js          66 livros (cânon protestante), abreviações e nº de capítulos
    verseCounts.json  nº de versículos por capítulo, para posicionar os arcos (gerado)
  lib/
    layout.js         posição dos livros (com lente) e geometria dos arcos
    xrefs.js          força em percentil, filtros e montagem do tecido em cada nível
    data.js           carregamento sob demanda com cache
    search.js         sugestões de navegação
  components/
    BookView.jsx      o livro: SVG de fundo, Canvas dos arcos, SVG de destaques
    Sidebar.jsx       barra lateral de filtros
    SearchBox.jsx     busca com sugestões
    ChapterPanel.jsx  painel de leitura do capítulo
scripts/
  build-text.mjs      Almeida completa → public/data/text/LIVRO/CAP.json
  build-xrefs.mjs     OpenBible → public/data/xref-books.json e public/data/xref/LIVRO.json
```

## Dados

**Texto bíblico.** João Ferreira de Almeida, domínio público, do repositório [open-bibles](https://github.com/seven1m/open-bibles): 31.098 versículos divididos em 1.189 arquivos de capítulo, carregados só quando necessários.

**Referências cruzadas.** [OpenBible.info](https://www.openbible.info/labs/cross-references/), licença CC-BY (atribuição obrigatória, presente na barra lateral). As referências com votos negativos são descartadas, e os intervalos ancoram no primeiro versículo. São gerados:

- `xref-books.json` (~50 KB): pares de livros com a contagem por faixa de força, as faixas e a tabela de percentis;
- `xref/LIVRO.json`: cada referência que toca o livro, como `[cap, vers, outroLivro, outroCap, outroVers, outroVersFinal, votos]`. O maior arquivo é o de Salmos, com 1,3 MB (cerca de 300 KB com gzip).

O OpenBible usa a versificação da KJV, que coincide com a desta Almeida. Se uma referência apontar para um versículo inexistente, o painel avisa.

---

Desenvolvido por Leonardo D'avila (@oleodavila).
