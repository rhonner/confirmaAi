# AGENTS.md — Manual Operacional da Wiki

> Este arquivo configura como o LLM deve se comportar como **mantenedor da wiki**.
> Lê-lo é obrigatório antes de operar sobre `.wiki/`.

---

## Hierarquia de fontes (em caso de conflito)

1. **`.context/`** vence sobre `.wiki/` para regras operacionais de features (arquitetura, contratos, fluxos atuais).
2. **`.wiki/`** vence sobre `CLAUDE.md` raiz para “conhecimento de bastidor” (decisões, lições, contexto histórico).
3. Se a wiki contradiz `.context/`, atualize a página da wiki (não o `.context/`); registre a contradição em `log.md`.

---

## Quando ler / quando escrever

### LER da wiki (sempre antes de):

- Responder perguntas “por que isso é assim?”, “qual a história disso?”, “o que já decidimos sobre X?”.
- Sugerir uma decisão arquitetural — verifique se já existe ADR/decisão relacionada em `pages/synthesis/` ou `raw/decisions/`.
- Iniciar tarefa não-trivial — ler `index.md` (catálogo) e `log.md` (últimas 5 entradas) é barato.

Protocolo de leitura:
1. `Read .wiki/index.md` (catálogo).
2. Se houver match temático, `Read` da(s) página(s) relevante(s).
3. Se a wiki é silenciosa sobre o tema mas há fonte raw correspondente em `raw/`, leia a raw.

### ESCREVER na wiki (sempre que):

- O usuário compartilhar uma decisão, padrão, gotcha, ou aprendizado **não-óbvio do código**.
- Você descobrir contradição entre fontes, ou superseder uma claim antiga com nova evidência.
- A sessão terminar com material novo (use o fluxo de ingest abaixo).
- O usuário pedir explicitamente: “salva isso na wiki”, “/wiki-ingest”, “documenta esse aprendizado”.

**Nunca escreva** para a wiki coisas trivialmente derivadas do código (estrutura de pasta, tipos exportados, valores de env). Isso vive em `.context/` ou no próprio código.

---

## Convenções de páginas

### Caminhos

- `pages/entities/<nome>.md` — algo concreto (lib, serviço, integração, módulo, pessoa, ferramenta). Ex: `evolution-api.md`, `bullmq.md`, `prisma-v7.md`.
- `pages/concepts/<nome>.md` — padrão abstrato, princípio, gotcha. Ex: `multi-tenancy-by-userid.md`, `nextjs-16-async-params.md`.
- `pages/synthesis/<nome>.md` — sumário cruzado, comparação, tese. Ex: `whatsapp-providers-comparison.md`, `state-of-billing-2026-q2.md`.

### Frontmatter (obrigatório)

```yaml
---
title: <Nome legível>
type: entity | concept | synthesis | decision
created: 2026-05-03
updated: 2026-05-03
tags: [tag1, tag2]
sources:
  - raw/sessions/2026-05-03-introducing-wiki.md
  - raw/articles/llm-wiki-pattern.md
related:
  - pages/concepts/multi-tenancy-by-userid.md
status: stub | draft | stable
---
```

### Corpo

- Frase de abertura define o assunto em uma linha.
- Seções curtas. Bullets > parágrafos longos.
- **Wikilinks `[[texto]]`** para referências internas (compatível com Obsidian); citar paths relativos quando precisar abrir programaticamente.
- Citações ao final: `> Fonte: raw/sessions/<arquivo>.md` ou link externo.

### Nomes de arquivos

- `kebab-case.md`, em inglês, mesmo com conteúdo em português (consistência com convenção do projeto).

---

## Operação 1 — INGEST

Disparada por: hook SessionEnd marcou pending, usuário disse `/wiki-ingest`, ou usuário pediu “salva isso”.

**Passos**:

1. **Identifique a fonte**: arquivo em `raw/sessions/*-PENDING.md`, conversa atual, artigo apontado.
2. **Leia integralmente** a fonte. Extraia:
   - Decisões tomadas e seu “porquê”.
   - Padrões descobertos / gotchas.
   - Termos novos que merecem página entity/concept.
   - Contradições com páginas existentes.
3. **Confirme com o usuário** os pontos principais antes de gravar (no modo manual). No modo automático (proposta inicial em SessionStart), apresente um resumo do que pretende escrever e peça aprovação.
4. **Para cada ponto**:
   - Se já existe página relacionada: `Edit` para atualizar (adicione bullet, atualize frontmatter `updated`, adicione fonte em `sources`).
   - Se é novo: `Write` nova página em `pages/<bucket>/<slug>.md` usando `_TEMPLATE_page.md`.
5. **Atualize `index.md`**: adicione entrada nova ou ajuste resumo de página atualizada.
6. **Append em `log.md`**: `## [YYYY-MM-DD HH:mm] ingest | <título> — <páginas tocadas>`.
7. **Renomeie** `raw/sessions/*-PENDING.md` para `raw/sessions/<timestamp>-<slug>.md` (remove o `-PENDING`).

Uma ingestão típica toca 3–10 páginas. Não economize cross-references.

---

## Operação 2 — QUERY

Disparada por: usuário faz pergunta conceitual / “por que”.

**Passos**:

1. `Read .wiki/index.md`.
2. Identifique 1–4 páginas candidatas; leia-as.
3. Sintetize a resposta com **citações inline** ao(s) path(s) `pages/...` ou `raw/...`.
4. Se a resposta produzir conhecimento novo (uma nova comparação, uma síntese), **proponha filar** como `pages/synthesis/<slug>.md`. Não escreva sem permissão.
5. Append em `log.md`: `## [YYYY-MM-DD HH:mm] query | <pergunta resumida>`.

---

## Operação 3 — LINT

Disparada por: usuário pede `/wiki-lint`, ou periódico (semanal).

**Checklist**:

- [ ] Páginas órfãs (sem inbound link em outra página ou no index).
- [ ] Conceitos mencionados ≥3× em outras páginas mas sem página própria.
- [ ] Frontmatter `updated` mais antigo que `log.md` mostra última edição.
- [ ] Contradições explícitas (claim X em página A vs. claim ¬X em página B).
- [ ] Páginas `status: stub` há mais de 30 dias sem evolução.
- [ ] Links internos quebrados (path não existe).

Reporte como lista de ações sugeridas. **Não corrija silenciosamente** — apresente proposta.

Append em `log.md`: `## [YYYY-MM-DD HH:mm] lint | <N issues found>`.

---

## Fluxo automatizado por sessão

### SessionStart (hook)

`scripts/wiki-status.sh` injeta no contexto:

- Contagem de `*-PENDING.md` em `raw/sessions/`.
- Últimas 3 entradas de `log.md`.
- Total de páginas por bucket.

**Sua ação**: Se houver `PENDING > 0`, antes de tocar a tarefa do usuário, proponha:

> "Há N sessões pendentes na wiki. Quer que eu ingira agora antes de começar a tarefa? (s/n/lista)"

Se `n`, prossiga normalmente — mas mantenha a wiki em mente.

### SessionEnd (hook)

`scripts/session-checkpoint.sh` cria `raw/sessions/<timestamp>-PENDING.md` com metadados mínimos (data, branch, arquivos modificados). O conteúdo será preenchido na próxima ingestão.

### Slash command

`/wiki-ingest [tópico]` força ingestão imediata da conversa atual.
`/wiki-lint` força health-check.

---

## Anti-padrões (NÃO faça)

- ❌ Escrever na wiki conteúdo já presente em `.context/features/`. Em vez disso, linke para `.context/...`.
- ❌ Criar página sem frontmatter completo.
- ❌ Editar `raw/` (é imutável). Erros corrige-se em `pages/`.
- ❌ Criar página com base em uma única menção tangencial — espere o conceito aparecer ≥2× ou o usuário pedir explicitamente.
- ❌ Atualizar páginas silenciosamente. Sempre logar em `log.md`.
- ❌ Ingerir sem ler a fonte completa.
- ❌ Mexer em `.context/` durante uma operação de wiki sem aviso explícito.

---

## Tamanho-alvo das páginas

- entity / concept: 50–300 linhas. Se ultrapassar, **divida**.
- synthesis: pode ser maior, mas idealmente seções com âncoras.
- index: ≤500 linhas; se ultrapassar, criar subíndices por bucket.

---

## Versionamento

A wiki é apenas markdown em git. Mas — segundo preferência do usuário — **NÃO execute git commands**. O usuário versiona via `gh`/manual.
