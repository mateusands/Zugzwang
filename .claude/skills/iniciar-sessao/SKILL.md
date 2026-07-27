---
name: iniciar-sessao
description: Inicializa a sessão de trabalho no Zugzwang — lê o CLAUDE.md, o estado do git e as pendências da última sessão, em modo somente leitura, e confirma o alinhamento de escopo antes de qualquer código. Use no começo de cada sessão.
---

# Inicialização de Sessão — Zugzwang

Este repo é um **monorepo pnpm** (engine + analysis + server + web) de um jogo de xadrez contra bot.
A fonte da verdade é **o código**; o `CLAUDE.md` é o mapa.

Antes de qualquer ação, execute os passos de leitura abaixo:

1. **Leia o `CLAUDE.md` da raiz** — propósito, regra de ouro do engine, stack, convenção de commits e
   branches, roadmap e a lista de "o que NÃO fazer ainda" (sem CI, sem Docker, sem deploy).

2. **Leia a última sessão**, se houver: `.claude/sessions/` (o arquivo mais recente). É onde ficam as
   pendências deixadas pela sessão anterior.

3. **Levante o estado real do git** (somente leitura):
   ```bash
   git status --short && git branch --show-current && git log --oneline -10
   ```
   Se a branch atual for `main`, lembre: **não se commita direto na `main`** — o fluxo é
   branch → PR → dono mergeia.

4. **Identifique o pacote alvo** pelo que o usuário pediu e leia só ele + os vizinhos que ele toca.
   Não carregue os 4 pacotes de uma vez.

   | Pacote | Papel |
   |---|---|
   | `packages/engine` | regras (wrapper `chess.js`) + bot minimax + análise |
   | `packages/analysis` | contratos compartilhados de análise Stockfish |
   | `packages/server` | API Express de jogo (estado em memória) |
   | `packages/web` | cliente React + Vite (tabuleiro jogável) |

5. **MODO SOMENTE LEITURA:** é proibido alterar código, criar ou apagar arquivo nesta etapa. O objetivo
   é só carregar contexto e verificar escopo.

## Gates que valem nesta sessão

Confirme explicitamente que estão ativos, porque são as regras que mais custam retrabalho aqui:

- **Regra de ouro:** `chess.js` só pode ser importado em `packages/engine/src/engine.ts`. Em qualquer
  outro lugar, use `ChessEngine` e os tipos de `@zugzwang/engine`.
- **TDD/BDD/SDD obrigatório** — spec → cenário → teste vermelho → código. Sem exceção, nem em mudança pequena.
- **Sem commit/push sem ordem explícita.** Trabalho em branch de feature.
- **Sem CI, sem Docker, sem deploy** — fase posterior, não implemente por engano.

## O que responder ao usuário

Retorno **curto**: em que branch estamos, se o working tree está limpo, qual pacote vamos tocar, e se
havia pendência da sessão anterior. Confirme numa frase que os gates acima estão ativos. O objetivo é
só validar o alinhamento antes de codar.
