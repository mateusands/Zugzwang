# Zugzwang

> Um jogo de xadrez contra um bot, escrito em TypeScript.

<!-- Badges de placeholder — CI ainda não existe (ver Roadmap).
[![build](https://img.shields.io/badge/build-pending-lightgrey)](#)
-->

![status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![license](https://img.shields.io/badge/license-GPLv3-blue)

## Sobre o projeto

**Zugzwang** — do termo enxadrístico alemão para a situação em que qualquer
lance disponível piora a própria posição — é um projeto de portfólio de longo
prazo: um jogo de xadrez jogável contra um bot, construído em fases, do zero.

O foco não é só o produto final, mas o processo: arquitetura limpa, testes,
convenções de commit/branch/PR e evolução incremental documentada.

### Principais decisões técnicas

- **Monorepo (pnpm workspaces).** Engine, servidor e cliente compartilham
  tipos e ferramentas (TypeScript, ESLint, Prettier) e evoluem juntos, sem o
  atrito de repositórios separados.
- **`chess.js` isolado num wrapper.** As regras do xadrez são consumidas apenas
  através da classe `ChessEngine` (em `packages/engine`). Nenhum outro pacote
  importa `chess.js` diretamente, o que permite trocar ou complementar a
  biblioteca de regras no futuro sem refatorar o resto do código.
- **Separação engine / server / web.** A lógica de jogo e do bot vive no
  `engine`, agnóstica a HTTP e a UI. O `server` expõe; o `web` desenha.
- **TypeScript estrito e testes desde o início.** Toda a base já roda com
  `strict` ligado e `any` proibido por lint.

## Stack

| Pacote               | Tecnologia                              | Papel                                             |
| -------------------- | --------------------------------------- | ------------------------------------------------- |
| `@zugzwang/analysis` | TypeScript                              | Contratos, parser UCI e política de qualidade     |
| `@zugzwang/engine`   | TypeScript, chess.js, Vitest            | Regras do xadrez e bot minimax                    |
| `@zugzwang/server`   | TypeScript, Express, Stockfish 18/WASM  | API de jogo e fila assíncrona de análise profunda |
| `@zugzwang/web`      | TypeScript, React, Vite, Stockfish/WASM | Tabuleiro, histórico, revisão e fallback local    |

Ferramentas transversais: **pnpm workspaces**, **ESLint**, **Prettier**.

## Como rodar localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) **>= 20**
- [pnpm](https://pnpm.io/) **>= 9** (`npm install -g pnpm`)

### Instalação

```bash
git clone https://github.com/mateusands/Zugzwang.git
cd Zugzwang
pnpm install
```

### Jogar contra o bot

**No navegador** (web + server juntos):

```bash
pnpm dev
# abra http://localhost:5173 e jogue clicando nas peças
```

**No terminal** (sem navegador):

```bash
pnpm --filter @zugzwang/engine play
```

### Executando (por pacote)

```bash
pnpm --filter @zugzwang/web dev       # cliente Vite em http://localhost:5173
pnpm --filter @zugzwang/server dev    # API em http://localhost:3000
pnpm --filter @zugzwang/engine test   # testes do engine
```

Verifique a API com:

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"zugzwang-server"}
```

O servidor inicia um pool limitado do Stockfish 18 completo para revisar
partidas em jobs assíncronos. Os resultados e o cache sobrevivem a reinícios em
`.data/analysis.json`; se o pool não puder iniciar, a revisão continua com o
motor lite do navegador. O orçamento pode ser ajustado sem alterar código:

```bash
ANALYSIS_POOL_SIZE=2 ANALYSIS_HASH_MB=512 ANALYSIS_MAXIMUM_DEPTH=30 pnpm --filter @zugzwang/server dev
```

`ANALYSIS_POOL_SIZE` aceita 1–8 processos, `ANALYSIS_HASH_MB` define o hash total
dividido pelo pool e `ANALYSIS_DATA_PATH` troca o caminho da persistência. A
profundidade dos perfis pode ser calibrada com `ANALYSIS_FAST_DEPTH` (18),
`ANALYSIS_DEEP_DEPTH` (22) e `ANALYSIS_MAXIMUM_DEPTH` (26, até 40). Profundidades
altas crescem exponencialmente e são indicadas para uma máquina dedicada. A
saúde do motor está em `GET /analysis/health`; jobs usam
`POST /analysis/jobs`, `GET /analysis/jobs/:id`, SSE em
`GET /analysis/jobs/:id/events` e cancelamento em `DELETE /analysis/jobs/:id`.

### Outros comandos

```bash
pnpm build          # builda todos os pacotes
pnpm test           # roda todos os testes
pnpm lint           # ESLint
pnpm format         # Prettier --write
```

## Estrutura do projeto

```
zugzwang/
├── packages/
│   ├── engine/   # Regras (wrapper chess.js) + bot (minimax) + análise + CLI
│   ├── analysis/ # Contratos e política compartilhados da análise Stockfish
│   ├── server/   # API de jogo + jobs assíncronos de análise
│   └── web/      # Cliente React + Vite (tabuleiro, histórico e revisão)
├── tsconfig.base.json   # Config TypeScript compartilhada
├── eslint.config.js     # Lint compartilhado
├── pnpm-workspace.yaml
├── CLAUDE.md            # Guia de contribuição / convenções do projeto
└── README.md
```

## Roadmap

**Concluído:**

1. **Base local** — monorepo, wrapper do engine, tooling.
2. **Regras completas** — movimentos legais, xeque/mate/afogamento, roque, _en
   passant_, promoção, histórico/PGN.
3. **Bot com minimax** — avaliação de posição e poda alfa-beta.
4. **Bot refinado** — estrutura de peões, segurança do rei, controle de centro;
   ordenação de lances, profundidade adaptativa e tabela de transposição.
5. **Polish** — desfazer, níveis de dificuldade, análise pós-jogo, CLI.
6. **Interação no navegador** — API de jogo no server + tabuleiro jogável no web
   (drag/clique, dicas, anotações, sons, promoção, tela de fim, persistência).
7. **Takeback + navegação** — desfazer o par de lances e navegar o histórico
   (◀▶, lista de lances clicável, teclado).
8. **Histórico de partidas** — salvar partidas encerradas (localStorage) e
   revê-las lance a lance (replay).
9. **Motor de avaliação** — Stockfish/WASM num Web Worker; barra de avaliação
   ao lado do tabuleiro (avaliação, melhor lance, probabilidade de vitória).
10. **Revisão de partida** — classificação lance a lance, precisão, destaques e
    análise Stockfish full assíncrona no backend com cache persistente. A
    passagem rápida e o refinamento dos quatro lances mais críticos acontecem
    em segundo plano durante a própria partida; o encerramento conclui apenas o
    que ainda não chegou ao cache.

**Próximo:** treinador → bots com personalidade. Por fim, **CI/CD e deploy**.

Detalhes das convenções (commits, branches, PRs) estão no
[CLAUDE.md](CLAUDE.md).

## Status

🚧 **Em desenvolvimento ativo.** Já é **jogável contra o bot** — no navegador
(`pnpm dev`) e no terminal (`pnpm --filter @zugzwang/engine play`) — com
histórico de partidas, barra de avaliação e revisão profunda com Stockfish.
Fases 1–10 concluídas; a próxima etapa é o treinador.

## Licença

Distribuído sob a licença [GNU GPL v3](LICENSE).

A análise de posições usa o [Stockfish](https://stockfishchess.org/) compilado
para WebAssembly (via [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)),
que é software livre sob GPLv3 — por isso este projeto também adota a GPLv3.
O binário do motor não é versionado aqui: é obtido do pacote `stockfish` (npm).
As variantes lite são copiadas para `packages/web/public/engine/` no
`dev`/`build`; o servidor executa a variante full diretamente do pacote.
