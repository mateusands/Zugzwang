---
name: backend
description: Desenvolvimento do engine e do server do Zugzwang (TypeScript + Express 4 + estado em memória, minimax, análise Stockfish). Codifica as convenções do repo — regra de ouro do chess.js, pureza e determinismo do engine, contrato REST que casa com o tipo do web, TDD obrigatório. Use ao mexer em packages/engine, packages/analysis ou packages/server.
---

# Backend — `packages/engine` · `packages/analysis` · `packages/server`

Guia para qualquer mexida fora do navegador. Segue o `CLAUDE.md`: **TDD/BDD/SDD obrigatório**,
**nada de commit/push sem ordem**, **não refatore o que não foi pedido**.

**Três pacotes, papéis distintos** (não confunda):

| Pacote | Papel | Depende de |
|---|---|---|
| `@zugzwang/engine` | regras (wrapper `chess.js`), bot minimax+αβ, avaliação, render de texto | nada do domínio |
| `@zugzwang/analysis` | contratos compartilhados da análise Stockfish | nada do domínio |
| `@zugzwang/server` | API Express de jogo, estado **em memória** | engine + analysis |

---

## Regra de ouro (a que define a arquitetura)

**`chess.js` só existe dentro de `packages/engine/src/engine.ts`.** Todo acesso às regras passa por
`ChessEngine` e pelos tipos exportados em `@zugzwang/engine`. Se você precisou de um método do `chess.js`
que o wrapper não expõe, **estenda o wrapper** — não importe a lib no server nem no web. O ponto é manter
a biblioteca de regras trocável sem refatorar o resto.

---

## Regras não-negociáveis

1. **O engine é puro e determinístico.** Avaliação, minimax, ordenação de lances e profundidade adaptativa
   não podem chamar `Math.random()`, `Date.now()`, rede ou disco. Mesma posição + mesma profundidade =
   mesmo lance, sempre. Se a feature exige tempo ou aleatoriedade, **injete** como parâmetro para o teste
   poder fixar. Sem isso, teste de bot vira teste instável.
2. **Não assuma que uma rota existe** — verifique `packages/server/src/app.ts`. O `createApp()` é separado
   do `listen()` justamente para ser testável sem subir porta; mantenha essa separação.
3. **Contrato REST casa EXATAMENTE o tipo que o web consome.** O TypeScript não atravessa HTTP — o build
   passa e a tela quebra. Ao mudar o shape de uma resposta, **grep o tipo no `packages/web/src`** e case
   campo a campo (`fen`, `turn`, `status`, `gameOver`, `winner`, `pieces`, `legalMoves`, `legalTargets`,
   `history`, `fens`, `pgn`). Campo renomeado no server e não no web = bug silencioso.
4. **Valide a entrada antes de entregar ao engine.** FEN, SAN/UCI e id de partida vêm do cliente. FEN
   malformado que estoure dentro do `chess.js` derruba a rota — valide na borda e responda 400.
5. **Nunca devolva erro cru.** `res.json({ message: err.message })` vaza stack e detalhe interno. Fallback
   5xx = payload estático + `console.error`/logger no servidor.
6. **Estado em memória tem ciclo de vida.** O mapa de partidas cresce para sempre se nada o poda. Ao
   adicionar estado de longa duração, defina como ele é liberado.
7. **ESM:** import relativo interno **com extensão `.js`** (ex.: `./engine.js`). Todos os pacotes são
   `"type": "module"`.
8. **Sem `any`** — `@typescript-eslint/no-explicit-any` é `error`. Se for realmente inevitável, isole e
   comente o porquê.

---

## SDD + BDD + TDD (obrigatório) + validar verde

**Ordem: spec → comportamento → teste falhando → código.** Detalhe completo no `CLAUDE.md`.

- **SDD:** cabeçalho do arquivo de teste explica o **contrato** e o **porquê** (o bug ou a decisão que o
  originou). É a spec que sobrevive ao esquecimento — o teste sozinho não explica o motivo.
- **BDD:** `describe('<módulo>')` → `it('deve <resultado> quando <condição>')`, em português, na linguagem
  do xadrez (lance, xeque, roque, afogamento) e não na do código. Se o `it` cita nome de variável, você
  está testando implementação — reescreva.
- **TDD:** Red (roda e **falha**) → Green (mínimo para passar) → Refactor (limpa mantendo verde).
- **Alvo prioritário:** lógica pura do engine — regras de movimento, detecção de xeque/mate/afogamento,
  roque, en passant, promoção, e as funções de avaliação do bot. Toda regra nova precisa de teste, sem
  exceção (`CLAUDE.md`: "Testes obrigatórios para lógica do engine").
- **Posição de teste é FEN**, não sequência de lances — FEN deixa o cenário explícito e o teste legível.

```bash
pnpm --filter @zugzwang/engine test
pnpm --filter @zugzwang/server test
pnpm --filter @zugzwang/engine play    # jogar contra o bot no terminal (validação de verdade)
pnpm lint                              # 0 warnings toleradas
pnpm build                             # tsc em todos os pacotes
```

Depois de verde, **exercite de verdade**: o `play` no terminal mostra comportamento que o teste não pega
(bot que demora demais, lance legal mas absurdo, partida que não termina).

## Fluxo

1. Leia o módulo alvo + os vizinhos → descubra o padrão antes de inventar um novo.
2. Mapeie o impacto: quem chama, quem depende, o contrato com o web.
3. TDD (Red → Green → Refactor).
4. Verde: lint + build + testes + exercitar no `play`.
5. **Sem commit/push sem ordem.** Quando mandarem, branch de feature + Conventional Commits
   (`feat(engine): ...`, `fix(server): ...`).
