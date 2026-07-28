---
name: finalizar-sessao
description: Encerra a sessão de trabalho no Zugzwang — gera o relatório da sessão em .claude/sessions/ e atualiza o CLAUDE.md se a arquitetura mudou. Use ao final de cada sessão.
---

# Encerramento de Sessão — Zugzwang

O objetivo agora **não é codar**, e sim consolidar o que a sessão mudou para a próxima não começar do zero.

## 1. Relatório da sessão

- Crie `.claude/sessions/YYYY-MM-DD.md` (data de hoje). Se já existir um arquivo com a data de hoje,
  **acrescente** uma seção nova em vez de sobrescrever.
- Conteúdo exigido:
  - **O que foi feito** — features, bugs resolvidos, refactors, com o pacote afetado.
  - **Decisões técnicas não-óbvias** — e o porquê. Isso é o que sobrevive ao esquecimento.
  - **Testes** — o que passou a ser coberto; se algo ficou vermelho, qual e por quê.
  - **Pendências** — o que ficou para a próxima sessão, explícito o bastante para retomar sem contexto.
  - **Estado do git** — branch, se há PR aberto, se ficou coisa não commitada.

> `.claude/sessions/` é **gitignorado** — é caderno de bordo local, não documentação do repo.

## 2. Atualização do CLAUDE.md

Avalie criticamente se a sessão mudou algo que o `CLAUDE.md` afirma. Se mudou, atualize — um `CLAUDE.md`
desatualizado é pior que nenhum, porque é lido como verdade. Gatilhos típicos:

- Pacote novo em `packages/` (a seção "Estrutura de pastas" lista os pacotes um a um).
- Comando novo ou alterado nos scripts do `package.json`.
- Mudança de arquitetura: novo módulo no engine, rota nova no server, novo fluxo no web.
- Fase do roadmap concluída.
- Armadilha nova descoberta (do tipo que fez você perder tempo) — documente para não repetir.

## 3. Validação final

Antes de declarar encerrado, confirme o verde e **relate o resultado real**, sem maquiar:

```bash
pnpm lint && pnpm build && pnpm test
```

A suíte deve ficar **100% verde** em qualquer versão de Node suportada. O antigo problema do
`localStorage` no Node 26 está resolvido por `packages/web/tests/setup.ts`; se ele voltar a aparecer,
é regressão de verdade e não armadilha de ambiente.

## O que responder ao usuário

1. Caminho do relatório gerado.
2. Se o `CLAUDE.md` foi atualizado, e o que mudou nele (ou que nada foi necessário).
3. Resultado real do lint/build/test.
4. **Não commite nem faça push** — só quando o dono mandar.
