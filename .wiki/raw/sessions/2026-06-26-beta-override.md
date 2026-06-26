---
type: session
date: 2026-06-26
branch: main
status: ingested
files_touched:
  - src/lib/billing/plans.ts
  - src/lib/billing/entitlements.ts
  - src/lib/billing/quota.ts
  - src/lib/billing/usage.ts
  - src/app/api/billing/subscription/route.ts
  - src/lib/services/billing-notifications.ts
  - src/app/api/admin/override/route.ts
  - src/app/api/admin/accounts/route.ts
  - src/app/admin/audit/page.tsx
  - src/hooks/use-api.ts
  - scripts/set-beta-override.ts
---

# Sessão 2026-06-26 — Flag de beta tester (premium cortesia, reversível, sem afetar cobrança)

## Objetivo

Dar acesso PREMIUM grátis a contas escolhidas (beta testers), liga/desliga, sem afetar a cobrança.

## Resultado

- `Subscription.adminOverrideUntil`/`adminOverrideReason` já existiam no schema (e `entitlements.checkStatus` já bypassava status). Faltava o plano EFETIVO virar PREMIUM.
- Novo `effectivePlanTier(sub)` (em `plans.ts`): override ativo → PREMIUM, senão `sub.plan`. Aplicado nos 4 gates: `entitlements.check`, `quota.reserveSlotInTx`, `usage.getCurrentUsage`/`incrementMessagesSent`, `GET /api/billing/subscription`.
- Override NUNCA toca `plan`/`status`/`providerSubscriptionId` → cobrança intacta (webhook + crons usam campos reais). `canResetFreeAccount` usa plano REAL. Dunning exclui contas com override ativo.
- Toggle: painel admin `/admin/audit` (seção "Empresas — acesso beta", `GET /api/admin/accounts` + `POST /api/admin/override`) + script `scripts/set-beta-override.ts`. Constante `BETA_OVERRIDE_UNTIL`. Audita `admin.override_set/cleared` (actorType ADMIN).
- Verificado: tsc · vitest 258 · build · test:sprints 125 (check 11.37) · Chrome MCP (toggle on/off no painel) · revisão adversarial (zero crítico; W1 dunning + S1 const aplicados).

## Decisões / aprendizados

- Decisão: override eleva ENTITLEMENT (plano efetivo), não o estado de cobrança — Por quê: reversível na hora e nunca confunde cron/webhook/Asaas; um beta tester nunca vira "pagante".
- Aprendizado: ao introduzir um "plano efetivo", aplicá-lo em TODOS os gates (eram 4) ou o override vaza/parcial; e manter o que é do estado REAL (reset, dunning, suspensão) no plano real. Ver [[entitlement-override-decoupled-from-billing]].
- Decisão: não renomear coluna nem migration — os campos já existiam; só faltava o read-time.

## Para ingerir na wiki

- [x] criar `pages/concepts/entitlement-override-decoupled-from-billing.md`
