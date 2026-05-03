---
description: Ingere a sessão atual (ou um tópico específico) na wiki em .wiki/
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

Execute a operação de **INGEST** definida em `.wiki/AGENTS.md` (Operação 1).

Argumento opcional: $ARGUMENTS — quando vazio, ingere a conversa atual + qualquer arquivo `*-PENDING.md` em `.wiki/raw/sessions/`. Quando preenchido, foque a ingestão nesse tópico/arquivo.

Passos resumidos (ver `.wiki/AGENTS.md` para detalhes):

1. Liste sessões pendentes (`ls .wiki/raw/sessions/*-PENDING.md`).
2. Para cada pendente: leia o arquivo, complemente o conteúdo (objetivo, decisões, aprendizados) com base na conversa atual, e renomeie removendo `-PENDING`.
3. Identifique tópicos que merecem nova página entity/concept/synthesis ou atualização de existente.
4. **Antes de escrever**, mostre ao usuário um plano: arquivos novos × arquivos modificados, com 1 linha de resumo cada. Aguarde confirmação.
5. Aplique as mudanças. Atualize `.wiki/index.md`.
6. Append em `.wiki/log.md`: `## [YYYY-MM-DD HH:mm] ingest | <título> — <páginas tocadas>`.

Não escreva conteúdo que já viva em `.context/features/` — referencie por path.
