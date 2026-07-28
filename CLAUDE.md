# CLAUDE.md — Guia do projeto Zugzwang

> Este arquivo orienta o Claude Code (e qualquer contribuidor) em sessões
> futuras. Leia antes de começar qualquer tarefa neste repositório.

## Visão geral

**Zugzwang** é um jogo de xadrez contra um bot, escrito em TypeScript. É um
projeto de portfólio, de longo prazo, evoluído em fases. O código é organizado
como um **monorepo com pnpm workspaces**.

### Stack

| Camada    | Tecnologia                                                                        |
| --------- | --------------------------------------------------------------------------------- |
| Engine    | TypeScript + [chess.js](https://github.com/jhlywa/chess.js) (isolado num wrapper) |
| Analysis  | TypeScript — contratos e políticas de qualidade compartilhados da análise         |
| Server    | TypeScript + Express + Stockfish (processo nativo, jobs assíncronos)              |
| Web       | TypeScript + React + Vite + Stockfish/WASM (Web Worker)                           |
| Testes    | Vitest                                                                            |
| Qualidade | ESLint (flat config) + Prettier                                                   |
| Runtime   | Node.js >= 20, pnpm >= 9                                                          |

### Estrutura de pastas

```
zugzwang/
├── packages/
│   ├── engine/   # Regras (wrapper chess.js) + bot (minimax) + análise
│   │   ├── src/
│   │   │   ├── engine.ts   # ChessEngine — ÚNICO ponto que toca chess.js
│   │   │   ├── bot.ts      # avaliação, minimax+αβ, dificuldade, análise
│   │   │   ├── render.ts   # tabuleiro em texto (para a CLI)
│   │   │   └── index.ts    # API pública do pacote
│   │   └── scripts/play.ts # CLI: jogar contra o bot no terminal
│   ├── analysis/ # Contratos compartilhados da análise Stockfish (sem I/O)
│   │   └── src/
│   │       ├── types.ts    # shape dos jobs, requisições e resultados
│   │       ├── quality.ts  # políticas de qualidade/classificação de lance
│   │       ├── uci.ts      # parsing do protocolo UCI
│   │       └── index.ts    # API pública do pacote
│   ├── server/   # API de jogo (Express, estado em memória) + jobs de análise
│   │   └── src/
│   │       ├── app.ts      # createApp() — rotas /games, testável sem listen()
│   │       ├── index.ts    # bootstrap (listen na porta)
│   │       └── analysis/   # backend de análise assíncrona (ver seção própria)
│   └── web/      # Cliente React + Vite — tabuleiro jogável
│       ├── src/               # App, BoardView, components/, hooks, helpers puros
│       └── tests/             # suíte do pacote (fica na RAIZ, não ao lado do fonte)
├── tsconfig.base.json      # Config TS compartilhada (cada pacote extende)
├── eslint.config.js        # ESLint flat config compartilhado
├── .gitattributes          # Fim de linha LF (.bat/.cmd em CRLF)
├── .claude/skills/         # Skills do Claude Code (versionadas)
├── pnpm-workspace.yaml
└── package.json            # Scripts raiz (dev/build/test/lint/format)
```

> **Skills (`.claude/skills/`, versionadas):** `iniciar-sessao`, `finalizar-sessao`,
> `backend`, `frontend`, `codereview` e `rodar-local` — codificam as convenções
> abaixo em forma acionável. O resto de `.claude/` é local e fica fora do git.
>
> **Docs de apoio (locais, em `.claude/`, fora do git):** `roadmap.md` (fases
> 6–12 detalhadas) e `HARDENING.md` (armadilhas e decisões acumuladas — leia
> antes de mexer no código).

## Regra de ouro do engine

**Nunca** importe `chess.js` diretamente fora de `packages/engine/src/engine.ts`.
Todo acesso às regras do xadrez passa pela classe `ChessEngine` e pelos tipos
exportados em `@zugzwang/engine`. Isso mantém a biblioteca de regras trocável
sem refatorar server nem web.

## Comandos

Na raiz (rodam em todos os pacotes via filtros do workspace):

```bash
pnpm install        # instala tudo
pnpm dev            # sobe todos os pacotes em modo watch (paralelo)
pnpm build          # builda todos os pacotes
pnpm test           # roda todos os testes
pnpm lint           # ESLint (0 warnings toleradas)
pnpm format         # Prettier --write
pnpm format:check   # Prettier --check (usado para validar)
```

Por pacote:

```bash
pnpm --filter @zugzwang/engine test
pnpm --filter @zugzwang/engine play     # jogar contra o bot no terminal
pnpm --filter @zugzwang/analysis test
pnpm --filter @zugzwang/server dev      # porta 3000
pnpm --filter @zugzwang/web dev         # porta 5173
```

Para jogar no navegador: `pnpm dev` e abra `http://localhost:5173`.

> ⚠️ **Node 26 quebra 3 testes de `packages/web`** (`appReview`, `appLiveReview`) com
> `Cannot read properties of undefined (reading 'clear')` em `localStorage.clear()`.
> **Não é regressão:** o Node 26 expõe um `localStorage` nativo experimental que só
> existe com `--localstorage-file` e tem precedência sobre o que o jsdom instala. Em
> Node 22/24 a suíte fica 100% verde. Confirme com
> `node -e "console.log(process.version, typeof localStorage)"` antes de culpar o código.

## Regras de código

- **TypeScript estrito.** `strict: true` e checagens extras já ligadas no
  `tsconfig.base.json`. Não relaxe sem justificativa.
- **Sem `any`** — a regra `@typescript-eslint/no-explicit-any` é `error`. Se um
  `any` for realmente inevitável, isole-o e comente o porquê.
- **Testes obrigatórios para lógica do `engine`.** Toda regra, movimento ou
  função de avaliação do bot precisa de teste no Vitest. Server e web podem ter
  testes mais leves por enquanto.
- **Código em inglês.** Nomes de variáveis, funções, tipos e mensagens de commit
  em inglês. Documentação (README, este arquivo, comentários explicativos) pode
  ser em português.
- **ESM.** Todos os pacotes são `"type": "module"`; use imports com extensão
  `.js` em imports relativos internos (ex.: `./engine.js`).

## Análise assíncrona (fase 10 — PR #12)

A revisão de partida deixou de rodar só no navegador: o **server** expõe um backend de
análise com Stockfish nativo, em jobs assíncronos, e o **web** consome esses jobs.

### Os três pacotes envolvidos

| Onde                            | Papel                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zugzwang/analysis`            | **contratos puros** — tipos dos jobs, parsing UCI, políticas de qualidade. Sem I/O, sem processo, sem rede. É a fonte da verdade compartilhada entre server e web      |
| `packages/server/src/analysis/` | execução: `stockfishProcess` (processo nativo), `analysisJobManager` (fila/pool), `fileAnalysisRepository` (persistência), `analysisRoutes` (HTTP), `runtime` (config) |
| `packages/web`                  | consome via `analysisApi.ts` → `reviewAnalysis.ts` / `liveReview.ts`                                                                                                   |

**Regra:** shape novo de job/resultado nasce em `@zugzwang/analysis` e é importado dos
dois lados. Definir o tipo só no server (ou só no web) recria a divergência de contrato
que o pacote existe para evitar.

### Rotas

```
GET  /analysis/health          # 503 quando o backend de análise não está montado
POST /analysis/jobs            # cria job
GET  /analysis/jobs/:id        # consulta
POST /analysis/jobs/:id        # atualiza
GET  /analysis/jobs/:id/events # stream de progresso
```

As rotas de análise só são registradas quando `createApp()` recebe `analysisJobs` — sem
isso, `createApp()` continua servindo só `/games` e `/analysis/health` responde `503`.
É o que mantém os testes do server isolados, sem subir Stockfish.

### Configuração (variáveis de ambiente, todas opcionais)

| Variável                 | Default               | Faixa   |
| ------------------------ | --------------------- | ------- |
| `ANALYSIS_POOL_SIZE`     | 2                     | 1–8     |
| `ANALYSIS_HASH_MB`       | 512                   | 16–4096 |
| `ANALYSIS_FAST_DEPTH`    | 18                    | 12–24   |
| `ANALYSIS_DEEP_DEPTH`    | ≥22                   | fast–32 |
| `ANALYSIS_MAXIMUM_DEPTH` | ≥26                   | deep–40 |
| `ANALYSIS_DATA_PATH`     | `.data/analysis.json` | —       |

Os valores são clampados na faixa (`boundedInteger` em `runtime.ts`) — valor fora do
intervalo é corrigido em silêncio, não rejeitado. As profundidades são encadeadas:
`fast ≤ deep ≤ maximum`.

⚠️ **A persistência é um arquivo JSON** (`.data/analysis.json`, gitignorado), não um
banco. Ele cresce com o histórico de jobs e é reescrito inteiro — não é o lugar para
volume alto sem repensar o repositório.

## Regra inegociável: TDD/BDD/SDD

Nenhum código de produção é escrito sem spec (SDD) → cenário Given/When/Then (BDD) →
teste vermelho antes do código (TDD). Sem exceções, mesmo em mudanças pequenas.

O ciclo aplicado a cada camada está nas skills versionadas: `/backend` (engine, analysis
e server — spec no cabeçalho do teste, `it('deve <resultado> quando <condição>')`, FEN
como cenário) e `/frontend` (web — helper puro antes de componente, jsdom por docblock).

## Convenção de commits — Conventional Commits

Formato: `tipo(escopo): descrição no imperativo`.

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`.
Escopos usuais: `engine`, `analysis`, `server`, `web`, `repo`.

Exemplos do domínio:

```
feat(engine): adiciona validação de roque
feat(engine): implementa detecção de en passant
fix(engine): corrige promoção de peão que não trocava a peça
test(engine): cobre casos de xeque-mate e afogamento (stalemate)
feat(server): adiciona rota POST /games para iniciar partida
feat(web): renderiza peças a partir do FEN do engine
refactor(engine): extrai avaliação de material para módulo próprio
docs(repo): documenta como rodar cada pacote localmente
chore(repo): atualiza dependências do workspace
```

## Convenção de branches

- `feat/nome-da-feature` — ex.: `feat/minimax-bot`
- `fix/nome-do-bug` — ex.: `fix/en-passant-invalido`
- `refactor/...`, `test/...`, `docs/...`, `chore/...` seguem o mesmo padrão.

Trabalhe sempre em branch; não faça commits direto na `main`.

## Estrutura de Pull Request

- **Título** no padrão dos commits (ex.: `feat(engine): adiciona minimax`).
- **Descrição** com seções:
  - **O que mudou** — resumo objetivo.
  - **Como testar** — comandos e passos para validar.
  - **Screenshots** — obrigatório quando mexer na UI (web).
- **PRs pequenos e focados** — uma responsabilidade por PR. Prefira vários PRs
  pequenos a um gigante.

## O que NÃO fazer ainda

> Restrições que continuam valendo. Não implemente por engano sem que o dono do
> projeto peça.

- **Nada de GitHub Actions / CI.** Nenhum workflow em `.github/`. CI/CD ainda é
  fase posterior.
- **Nada de Docker nem deploy.** Sem `Dockerfile`, sem scripts de deploy. O
  proxy do Vite (`/api` → server) é **só de desenvolvimento**.
- **Não commitar nem dar push automaticamente.** O dono do projeto revisa e
  commita/mergeia manualmente, a menos que peça o contrário explicitamente. O
  fluxo é: branch → PR → dono mergeia → sincroniza `main` → apaga a branch.

## Roadmap (fases)

**Concluídas** (jogável no navegador e no terminal):

1. **Base local** — monorepo, wrapper do engine, tooling (lint/format).
2. **Regras completas** — movimentos legais, xeque/mate/afogamento, roque, en
   passant, promoção, histórico/PGN.
3. **Bot com minimax** — avaliação + poda alfa-beta.
4. **Bot refinado** — estrutura de peões, segurança do rei, controle de centro;
   ordenação de lances, profundidade adaptativa, tabela de transposição.
5. **Polish** — desfazer (`undo`), níveis de dificuldade, análise pós-jogo, CLI.
6. **Interação no navegador** — server (API de jogo) + web (tabuleiro jogável:
   drag/clique, dicas, anotações, sons, promoção, tela de fim, persistência).
7. **Takeback + navegação** — desfazer o par de lances; navegar o histórico
   (◀▶, lista de lances clicável, teclado).
8. **Histórico de partidas** — salvar partidas encerradas (localStorage) e
   revê-las lance a lance (replay).
9. **Motor de avaliação** — Stockfish/WASM em Web Worker; barra de avaliação
   (avaliação, melhor lance, probabilidade de vitória) ao vivo e no replay.
   **O repo passou a GPLv3** por empacotar o binário do Stockfish.
10. **Revisão e classificação de lances** — livro de aberturas curado, análise
    multipv adaptativa, revisão de partida completa e retomável, lances revisados
    animados no replay (PR #11); e o **backend de análise assíncrona**: pacote
    `@zugzwang/analysis` com os contratos compartilhados, jobs de Stockfish nativo
    no server, revisão do web rodando sobre eles (PR #12). Ver a seção
    "Análise assíncrona" acima.

**Próximas** (detalhe em `.claude/roadmap.md`): 11 treinador (comentários) ·
12 bots com personalidade.

**CI/CD + deploy** (GitHub Actions, Docker) entram **só** quando o dono pedir —
não antes.
