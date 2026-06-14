# Sessão 2026-06-13/14 — Sentry em prod, incidente de migration, Sprint 10 (fatias 1, 2.1, 2.2)

> Sessão longa. Início (Sprint 9 + ativação do Sentry) já ingerido nas entradas de 2026-06-13. Este raw cobre o resto.

## Linha do tempo

1. **Sentry validado em produção** (continuação da ativação): probe temporária `/api/debug-sentry` (gated por token) → resposta `{sentryConfigured:true, flushed:true}` no runtime serverless real → evento visível no Sentry. Provou que o `@sentry/nextjs` entrou no bundle (nft rastreou o import literal). Gotcha de rota: pasta com prefixo `_` é **private folder** do App Router (fora do roteamento) — a 1ª probe em `/api/_debug/...` dava 404; renomeada pra `/api/debug-sentry`. Probe removida depois.

2. **Monitores UptimeRobot** criados (3: /api/health, app, evolution) — gate negativo do admin e página de status pública deliberadamente NÃO criada.

3. **Sprint 10 fatia 1** — `/configuracoes/atividade` (auditoria do próprio user) + `/admin/audit` (allowlist `ADMIN_EMAILS`, gate em layout+API, métricas cross-tenant). Operacional em `.context/features/admin.md`.

4. **🔴 INCIDENTE CRÍTICO** (achado tentando logar/criar conta de teste em prod): login e signup quebrados em produção há ~1 dia. Causa: migration da Sprint 8 (`whatsappDisconnect*`) deployada no código mas **não aplicada no banco**. Ver [[migrations-not-auto-applied]]. Fix: `migrate deploy` manual via URL direct do Neon + prevenção `vercel-build`.

5. **Sprint 10 fatia 2.1** — reset de senha real (era stub que não enviava): token assinado stateless ([[stateless-password-reset-token]]) + `/redefinir-senha`. Validado E2E em prod (email Resend "Delivered").

6. **Sprint 10 fatia 2.2** — emails transacionais (boas-vindas, pagamento confirmado, cancelamento) reusando layout de email. Gotcha: email no webhook precisa de try/catch ISOLADO pra não virar `apply_failed`.

## Aprendizados não-óbvios (viram páginas)

- Vercel não roda migration no build → drift silencioso → [[migrations-not-auto-applied]].
- DDL via pooler do Neon quebra advisory lock do `prisma migrate` → migrate precisa de DIRECT_URL → atualizado em [[neon-pooled-vs-direct-url]].
- Token de reset stateless (HMAC + hash da senha) = single-use sem coluna/migration → [[stateless-password-reset-token]].
- `_pasta` = private folder no App Router (não roteia). Probe de debug não pode usar.

## Estado ao fim

v2 em produção; Sentry capturando; UptimeRobot vigiando; reset de senha + emails transacionais no ar. Sprint 10 em progresso (falta fatia 2.3: perto-do-limite + dunning, e os demais itens da Sprint 10). Prevenção de migration (`vercel-build`) ativa.
