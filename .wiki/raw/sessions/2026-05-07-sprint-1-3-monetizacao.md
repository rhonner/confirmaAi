---
date: 2026-05-07
branch: v2.0.0
type: session
duration_estimate: ~6h
---

# Sessão: Sprints 1-3 da monetização v2 + UX paywall

## Objetivo

Construir a fundação de monetização do ConfirmaAí: auditoria, model de Subscription, quota de pacientes vitalícios, UX de paywall, e estabelecer regras de Definition of Done.

## Decisões tomadas

- Pivô do modelo de cobrança: de "mensagens/mês" pra "pacientes únicos vitalícios" (5 no Free).
- Preços fechados: R$ 0 / 65 / 110 (Free / Pro / Premium).
- CPF obrigatório no Free (anti-fraude por reuso massivo).
- Sem trial pago — Free vitalício é o trial.
- Provider de pagamento: Asaas (Sprint 5).
- Bloqueio duro ao limite (sem overage no MVP).
- **Decisão revertida**: cross-tenant CPF detection de paciente é descartada — paciente em N clínicas é legítimo.

## Aprendizados não-óbvios (viraram páginas wiki)

- Vercel runtime é UTC; `format()` puro vaza horário errado em produção. `TZ` é env reservada (não dá pra fixar). → [[../pages/concepts/timezone-on-vercel]]
- Append-only no Postgres com trigger + GUC bypass pra retention. → [[../pages/concepts/append-only-via-pg-trigger]]
- Quota vitalícia exige ledger separado de Patient (deletar não libera). → [[../pages/concepts/quota-ledger-immortal-slot]]
- Hash sem namespace colide entre CPF de 11 dígitos e phone de 11 dígitos. → [[../pages/concepts/identifier-hash-namespacing]]
- Rate limit pode rodar em queries sobre AuditLog se ele já existe pra outra finalidade. → [[../pages/concepts/rate-limit-via-audit]]
- `prisma.$extends({ query })` permite auditoria automática mas tem cuidados (recursão, ALS, tx). → [[../pages/entities/prisma-v7-extensions]]
- Radix Popover não responde a `.click()` programático; Radix Dialog permite variant "hard" via `onOpenChange` interceptor. → [[../pages/entities/radix-popover-and-dialog]]

## Entregas

- Sprint 1: AuditLog + Subscription, Prisma extension, route wrappers, append-only trigger, rate limit, PII redaction.
- Sprint 2: PatientQuotaSlot, CPF validator, identifier hashing namespaced, gates em rotas de Patient, /api/billing/subscription.
- Sprint 3: useUsage hook, UsageBadge, PaywallModal hard/soft, PlanCard, QuotaBanner, /billing, /precos, refactor pacientes/page.tsx, E2E Playwright, validação Chrome MCP completa.

## Validação cumulativa

- `npx tsc --noEmit` ✅
- `vitest run` → 131/131
- `npm run test:sprints` → 52/52 (15+25+12)
- `npx playwright test quota-paywall` → 4/4
- Chrome MCP walk-through (manual) → 13 cenários ✅

## Regra estabelecida

Toda mudança que toque UI exige walk-through real no Chrome MCP antes de declarar pronto. Documentado em `.context/README.md` ("Definição de feito") e em memory feedback `feedback_test_each_sprint.md`.

## Snapshot do roadmap

Ver [[../pages/synthesis/monetization-v2-state]].

## Próxima sessão

Sprint 4 — anti-fraude signup: SignupAttempt table, reCAPTCHA, email verify (Resend), disposable blocklist, cross-tenant CPF do dono.
