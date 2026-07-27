---
name: frontend
description: Desenvolvimento do cliente web do Zugzwang (React 18 + Vite 6 + CSS puro + Stockfish/WASM em Web Worker). Codifica as convenções do repo — helpers puros separados de componente, isolamento cross-origin exigido pelo SharedArrayBuffer, análise fora da UI thread, TDD de componente com Vitest + jsdom. Use ao mexer em packages/web.
---

# Frontend — `packages/web`

Guia para qualquer mexida de UI. Segue o `CLAUDE.md`: **TDD/BDD/SDD obrigatório**, **nada de commit/push
sem ordem**, **não refatore o que não foi pedido**.

**Stack real deste pacote** (confira no `packages/web/package.json` — não presuma):

| Lib | Versão | Observação |
|---|---|---|
| React | **18.3** | não é 19 — sem `use`, sem `ref` como prop; `forwardRef` continua valendo |
| Vite | **6.x** | dev na 5173 |
| Vitest + Testing Library | **3.0 / 16** | jsdom por docblock, não global |
| Estilo | **CSS puro** (`src/index.css`) | **não há Tailwind, nem shadcn, nem lib de componente** |
| Stockfish | **18 lite** (MT + ST) | WASM em Web Worker |

Não introduza Tailwind, styled-components ou biblioteca de UI sem pedido explícito — o pacote é
deliberadamente sem framework de estilo.

---

## Arquitetura: helper puro ≠ componente

A divisão mais importante do pacote. `src/` tem duas naturezas de arquivo:

- **Helpers puros** (`board.ts`, `fen.ts`, `material.ts`, `outcome.ts`, `winprob.ts`, `annotations.ts`,
  `openingBook.ts`, `review.ts`, `replay.ts`, `uci.ts`…): sem React, sem DOM, testáveis direto. **É aqui
  que a lógica deve morar.**
- **Componentes e hooks** (`App.tsx`, `BoardView.tsx`, `components/`, `useEvaluation.ts`,
  `usePieceDrag.ts`, `useSavedGames.ts`): orquestram, não calculam.

Regra prática: se você está prestes a escrever um `if` de regra de negócio dentro de um `.tsx`, **extraia
para um helper puro** e teste ele direto. É o que torna a suíte deste pacote rápida e honesta — repare que
a maioria dos testes em `tests/` é de `.ts`, não de `.tsx`.

---

## Isolamento cross-origin — o que mais quebra e não dá erro claro

O Stockfish multi-thread exige `SharedArrayBuffer`, que só existe com a página **cross-origin isolated**.
O `vite.config.ts` injeta os dois headers em `server` **e** `preview`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- Se os headers sumirem, **não aparece erro vermelho** — a página cai no fallback single-thread
  (`stockfish-18-lite-single.js`) e a análise fica lenta. Sintoma é performance, não exceção.
- `require-corp` faz qualquer recurso de terceiro sem CORP ser **bloqueado**. Ao adicionar imagem, fonte
  ou script externo, isso é o primeiro suspeito.
- Os binários do engine **não** ficam no git: `scripts/copy-engine.mjs` roda no `predev`/`prebuild` e
  copia os arquivos lite para `public/engine/`. Se `public/engine/` estiver vazio, você rodou `vite`
  direto em vez de `pnpm dev` — use os scripts do pacote.

---

## Análise assíncrona — a UI nunca espera

O motor roda em Web Worker (`stockfishClient.ts`, `useEvaluation.ts`) e a revisão de partida vai para o
backend de análise (`analysisApi.ts`, `reviewAnalysis.ts`, `liveReview.ts`).

- **Toda análise em voo precisa ser descartável.** Se a posição mudou (lance novo, takeback, navegação no
  histórico), a resposta que chegar depois é **obsoleta** e não pode sobrescrever o estado atual. É a
  classe de bug mais cara aqui — teste isso explicitamente (ver `appLiveReview.test.tsx`).
- Nada de trabalho pesado na UI thread: se o tabuleiro travou ao analisar, algo voltou para o main thread.
- `useEffect` que dispara análise precisa de cleanup — sem ele, cada render acumula trabalho duplicado.

---

## Persistência

Partidas salvas e cache de revisão vivem em `localStorage` (`savedGames.ts`, `reviewCheckpoint.ts`).

- **Leitura sempre defensiva**: `try/catch` + validação de shape. JSON gravado por uma versão anterior não
  pode quebrar o boot do app.
- Não presuma que a quota existe — `setItem` lança `QuotaExceededError` quando o histórico cresce.

---

## SDD + BDD + TDD de componente (obrigatório)

**Ordem: spec → comportamento → teste falhando → código.**

- **Local dos testes:** `packages/web/tests/*.test.ts(x)` — pasta `tests/` na **raiz do pacote**, não ao
  lado do fonte (difere da convenção do sync-ai; siga a daqui).
- **jsdom é por arquivo, via docblock** — a primeira linha do teste de componente precisa ser
  `// @vitest-environment jsdom`. Sem isso o teste roda em Node e `document` não existe.
- **BDD:** `it('deve <o que o jogador vê> quando <ação>')` — comportamento do jogador, não estado interno.
- Prefira testar o **helper puro**; teste de componente só quando o comportamento é de UI de verdade
  (clique, render condicional, navegação de histórico).
- **jsdom não testa layout nem CSS** (geometria do tabuleiro, cor de casa, drag real). Não escreva "teste"
  que finge cobrir estilo — trave o comportamento e valide o visual no navegador.

```bash
pnpm --filter @zugzwang/web test
pnpm --filter @zugzwang/web typecheck
pnpm --filter @zugzwang/web dev      # 5173, e olhe a tela
```

⚠️ **Armadilha de ambiente (Node 26):** `appReview.test.tsx` e `appLiveReview.test.tsx` falham com
`Cannot read properties of undefined (reading 'clear')` em `localStorage.clear()`. **Não é bug do código** —
o Node 26 expõe um `localStorage` nativo experimental que só existe com `--localstorage-file` e tem
precedência sobre o do jsdom. Em Node 22/24 passam. Antes de "consertar", confirme que a falha é essa.

## Fluxo

1. Leia o arquivo alvo + o vizinho → descubra o padrão (helper puro vs componente, como o estado flui).
2. Mapeie o impacto: quem consome o helper, mudança em `index.css` afeta o app inteiro.
3. TDD (Red → Green → Refactor). Lógica → helper puro. Comportamento → componente.
4. Verde: typecheck + suíte + **olho no 5173**.
5. **Sem commit/push sem ordem.** Quando mandarem, branch de feature.
