---
type: session
date: 2026-06-14 20:54
branch: main
status: ingested
files_touched:
  - .wiki/index.md
  - .wiki/log.md
  - .wiki/pages/concepts/neon-pooled-vs-direct-url.md
  - .wiki/pages/synthesis/monetization-v2-state.md
  - .wiki/pages/concepts/migrations-not-auto-applied.md
  - .wiki/pages/concepts/stateless-password-reset-token.md
  - .wiki/raw/sessions/2026-06-14-migration-incident-sprint10.md
---

# Sessão 2026-06-14-2054 — Checkpoint Sprint 10 + incidente de migration

## Objetivo da sessão

Stub de SessionEnd que ficou `-PENDING`. O conteúdo desta janela (incidente de
migration não-aplicada no deploy + avanços da Sprint 10) **já havia sido ingerido**
na mesma data pela sessão `2026-06-14-migration-incident-sprint10.md`.

## Resultado

Resolvido na ingestão de 2026-06-24 sem duplicar conteúdo: os aprendizados já vivem
nas páginas abaixo. Stub renomeado (removido o `-PENDING`) apenas para limpar a fila.

## Decisões / aprendizados (já capturados)

- [[migrations-not-auto-applied]] — Vercel `build` não roda migration → drift → login/signup quebram invisíveis; fix `vercel-build: migrate deploy && next build`.
- [[neon-pooled-vs-direct-url]] — pooled no runtime, direta nas migrations.
- [[stateless-password-reset-token]] — reset single-use via HMAC.
- [[monetization-v2-state]] — snapshot vivo atualizado.

> Fonte primária do conteúdo: `raw/sessions/2026-06-14-migration-incident-sprint10.md`.
