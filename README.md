# Zugzwang

> Um jogo de xadrez contra um bot, escrito em TypeScript.

<!-- Badges de placeholder — CI ainda não existe (ver Roadmap).
[![build](https://img.shields.io/badge/build-pending-lightgrey)](#)
-->

![status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![license](https://img.shields.io/badge/license-MIT-blue)

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

| Pacote             | Tecnologia                   | Papel                                        |
| ------------------ | ---------------------------- | -------------------------------------------- |
| `@zugzwang/engine` | TypeScript, chess.js, Vitest | Regras do xadrez, bot (minimax) e análise    |
| `@zugzwang/server` | TypeScript, Express          | API de jogo (partidas, lances, resposta bot) |
| `@zugzwang/web`    | TypeScript, React, Vite      | Tabuleiro clicável para jogar contra o bot   |

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
│   ├── server/   # API de jogo em Express (estado em memória)
│   └── web/      # Cliente React + Vite (tabuleiro jogável)
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

**Próximo:** takeback → histórico de partidas → **motor de avaliação
(Stockfish/WASM)** → revisão e classificação de lances → treinador → bots com
personalidade. Por fim, **CI/CD e deploy**.

Detalhes das convenções (commits, branches, PRs) estão no
[CLAUDE.md](CLAUDE.md).

## Status

🚧 **Em desenvolvimento ativo.** Já é **jogável contra o bot** — no navegador
(`pnpm dev`) e no terminal (`pnpm --filter @zugzwang/engine play`). Fases 1–6
concluídas; a próxima grande virada é o motor de avaliação (Stockfish) que
destrava a revisão de partidas.

## Licença

Distribuído sob a licença [MIT](LICENSE).
