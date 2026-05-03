# Index — Wiki ConfirmaAí

> Catálogo de todas as páginas da wiki. Atualizado a cada `ingest`.
> Para conhecimento operacional por feature, veja `.context/features/`.

---

## Entities (`pages/entities/`)

Coisas concretas: libs, serviços, integrações, ferramentas.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| _(vazio — ainda não há páginas)_ |  |  |

## Concepts (`pages/concepts/`)

Padrões abstratos, princípios, gotchas reusáveis.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| _(vazio)_ |  |  |

## Synthesis (`pages/synthesis/`)

Sumários cruzados, comparações, teses evolutivas.

| Página | Resumo | Atualizado |
| ------ | ------ | ---------- |
| _(vazio)_ |  |  |

---

## Raw sources

| Bucket | Arquivos | Descrição |
| ------ | -------- | --------- |
| `raw/sessions/` | 0 | Sumários de sessões de trabalho (gerados automaticamente). |
| `raw/articles/` | 0 | Web clips, papers, links externos. |
| `raw/decisions/` | 0 | ADRs e decisões arquiteturais brutas. |

---

## Convenções

- Slugs em `kebab-case`, em inglês.
- Toda página tem frontmatter (ver `_TEMPLATE_page.md`).
- Wikilinks `[[slug]]` para referência interna.
- Cross-refs explícitos para `.context/features/<feature>.md` quando aplicável.
