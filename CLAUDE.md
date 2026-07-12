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
| Server    | TypeScript + Express                                                              |
| Web       | TypeScript + React + Vite                                                         |
| Testes    | Vitest                                                                            |
| Qualidade | ESLint (flat config) + Prettier                                                   |
| Runtime   | Node.js >= 20, pnpm >= 9                                                          |

### Estrutura de pastas

```
zugzwang/
├── packages/
│   ├── engine/   # Wrapper sobre chess.js + (futuro) lógica do bot
│   │   └── src/
│   │       ├── engine.ts   # ChessEngine — ÚNICO ponto que toca chess.js
│   │       └── index.ts    # API pública do pacote
│   ├── server/   # API HTTP (Express). Hoje só GET /health
│   │   └── src/
│   │       ├── app.ts      # createApp() — app testável, sem listen()
│   │       └── index.ts    # bootstrap (listen na porta)
│   └── web/      # Cliente React + Vite. Hoje só um placeholder de tabuleiro
│       └── src/
├── tsconfig.base.json      # Config TS compartilhada (cada pacote extende)
├── eslint.config.js        # ESLint flat config compartilhado
├── pnpm-workspace.yaml
└── package.json            # Scripts raiz (dev/build/test/lint/format)
```

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
pnpm --filter @zugzwang/server dev
pnpm --filter @zugzwang/web dev
```

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

## Regra inegociável: TDD/BDD/SDD

Nenhum código de produção é escrito sem spec (SDD) → cenário Given/When/Then (BDD) →
teste vermelho antes do código (TDD). Sem exceções, mesmo em mudanças pequenas.
Ver skill `tdd-bdd-sdd` para o ciclo completo.

## Convenção de commits — Conventional Commits

Formato: `tipo(escopo): descrição no imperativo`.

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`.
Escopos usuais: `engine`, `server`, `web`, `repo`.

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

> Estas restrições valem para a fase atual (estruturação inicial). Não
> implemente por engano em sessões futuras sem que o dono do projeto peça.

- **Nada de GitHub Actions / CI.** Nenhum workflow em `.github/`. CI/CD é uma
  fase posterior (ver Roadmap).
- **Nada de Docker nem deploy.** Sem `Dockerfile`, sem scripts de deploy.
- **Nada de lógica de jogo além do necessário.** O engine hoje é só o wrapper
  do chess.js + testes de exemplo; server e web são esqueletos.
- **Não commitar nem dar push automaticamente.** O dono do projeto revisa e
  commita manualmente, a menos que peça o contrário explicitamente.

## Roadmap (fases)

1. **Base local** _(fase atual)_ — monorepo, wrapper do engine, esqueletos de
   server e web, testes de exemplo, tooling (lint/format).
2. **Regras completas do jogo** — expor no engine tudo que o jogo precisa
   (movimentos legais, xeque, mate, afogamento, roque, en passant, promoção),
   com boa cobertura de testes.
3. **Bot com minimax** — avaliação de posição + minimax com poda alfa-beta.
4. **Bot refinado** — melhorias de avaliação, profundidade, níveis de
   dificuldade, quiescence search etc.
5. **CI/CD e deploy** — GitHub Actions (lint + testes + build) e deploy em
   servidor próprio. **Só nesta fase** entram Actions/Docker.
