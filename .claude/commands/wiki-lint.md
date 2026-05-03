---
description: Roda health-check da wiki — contradições, órfãs, links quebrados, conceitos sem página
allowed-tools: Read, Grep, Glob, Bash
---

Execute a operação de **LINT** definida em `.wiki/AGENTS.md` (Operação 3).

Checklist:

- [ ] Páginas órfãs (em `.wiki/pages/**` sem inbound link no `index.md` nem em outras páginas).
- [ ] Conceitos mencionados ≥3× em outras páginas mas sem página própria em `pages/concepts/`.
- [ ] Frontmatter `updated:` mais antigo do que a última edição registrada em `log.md`.
- [ ] Contradições explícitas entre páginas (claim X em A vs. ¬X em B).
- [ ] Páginas `status: stub` há mais de 30 dias sem evolução.
- [ ] Wikilinks `[[...]]` apontando para slugs inexistentes.
- [ ] Cross-refs `.context/features/...` quebrados (path não existe).

Reporte como **lista de ações sugeridas** (não corrija silenciosamente). Para cada issue: severidade (info/warn/error), página afetada, ação proposta.

Append em `.wiki/log.md`: `## [YYYY-MM-DD HH:mm] lint | <N issues — sev breakdown>`.
