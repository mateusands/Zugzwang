---
name: codereview
description: Code review sênior das últimas mudanças do Zugzwang (working tree ou últimos commits), focado em escalabilidade, manutenibilidade e nas invariantes próprias do repo (regra de ouro do chess.js, pureza do engine, contrato REST server↔web). Apenas reporta com arquivo/linha — não aplica correções.
---

# Code Review Sênior — Zugzwang

Atue como Engenheiro Sênior e revise criticamente as **últimas mudanças deste repositório**.

## Como identificar o que revisar (nesta ordem)

1. Working tree: `git status` + `git diff` + arquivos novos não rastreados relevantes.
2. Se limpo, os últimos commits da branch atual (`git log` + `git show`).
3. **Sempre leia o arquivo inteiro** quando o diff sozinho não der contexto — nunca revise um trecho no escuro.

## Pilar 1 — Invariantes do Zugzwang (verifique primeiro; são as que quebram o projeto)

- **Regra de ouro:** o diff importa `chess.js` fora de `packages/engine/src/engine.ts`? Isso é violação
  estrutural — o ponto do wrapper é manter a biblioteca de regras trocável. Reporte no topo.
- **Pureza do engine:** `packages/engine` e `packages/analysis` não podem depender de Express, de React,
  de `window`/`document`, nem de I/O de rede. Se entrou, a lógica de xadrez deixou de ser testável isolada.
- **`syncEngine`/avaliação continuam determinísticos?** Função de avaliação, minimax e ordenação de lances
  precisam ser puras — `Math.random()` ou `Date.now()` dentro delas torna o bot não-reproduzível e o teste
  instável. Se a feature exige aleatoriedade (ex.: variar abertura), ela entra **injetada**, não embutida.
- **Contrato REST server↔web:** o TypeScript **não** atravessa a fronteira HTTP. Se o diff mudou o shape
  de uma resposta do server, o tipo consumido no web foi atualizado campo a campo? Essa é a classe de bug
  nº 1 em qualquer front+back — o build passa e a tela quebra em runtime.
- **Sem CI/Docker/deploy:** o diff adicionou `.github/workflows`, `Dockerfile` ou script de deploy? É
  explicitamente fora de escopo no `CLAUDE.md` — reporte.

## Pilar 2 — Escalabilidade e performance

- O bot roda no **caminho quente** (minimax + poda alfa-beta). Alocação dentro do laço de busca, clonagem
  de tabuleiro por nó, ou `array.includes` em estrutura grande custam profundidade real de busca.
- Estado do server é **em memória**: alguma estrutura cresce sem limite (mapa de partidas nunca podado)?
  Num processo de longa duração isso é vazamento.
- No web, o Stockfish roda em **Web Worker**. Trabalho pesado que voltou para a thread principal trava o
  tabuleiro — verifique se a análise continua fora da UI thread.
- `useEffect` sem cleanup que dispare análise a cada render = trabalho duplicado e corrida entre respostas
  obsoletas. Toda análise assíncrona precisa ser cancelável/descartável quando a posição muda.

## Pilar 3 — Manutenibilidade

- Clean Code e SOLID: responsabilidades misturadas, acoplamento alto, complexidade ciclomática desnecessária.
- **TDD foi seguido?** Código de feature novo sem teste correspondente é violação do `CLAUDE.md`. O teste
  descreve **comportamento** (`it('deve <resultado> quando <condição>')`) ou detalhe de implementação?
- Nomes em **inglês** no código (convenção do repo); comentário e doc podem ser em português.
- **ESM:** import relativo interno precisa da extensão `.js`. Sem ela, quebra no runtime compilado.

## Pilar 4 — Robustez e segurança de aplicação

O server é local e sem autenticação, então **não** aplique aqui o checklist de API multi-tenant. O que
importa de fato neste repo:

- **Entrada não confiável:** lance/FEN/id de partida vindos do cliente são validados antes de chegar ao
  engine? FEN malformado que estoure exceção não tratada derruba a rota.
- **Erro cru vazando:** `catch` que devolve `err.message`/stack ao cliente. Devolva código estático e
  logue o detalhe no servidor.
- **`localStorage`:** dado persistido é lido de volta com `try/catch` e validação? JSON corrompido de uma
  versão anterior do schema não pode quebrar o boot do app.
- **Dependência nova** em algum `package.json`? Reporte pacote + licença. ⚠️ **Este repo é GPLv3** (por
  empacotar o Stockfish) — atenção a licença incompatível.
- **`dangerouslySetInnerHTML`** ou injeção de HTML com conteúdo dinâmico (ex.: PGN importado) sem sanitizar.

## Formato da resposta

- Nada de micro-otimização irrelevante.
- Para cada problema: **arquivo e linha**, o impacto a longo prazo, e o código refatorado demonstrando a
  solução. Ordene por severidade — violação de invariante primeiro.
- **Apenas revise e reporte. Não aplique as correções** sem ordem explícita.
