---
title: Override de entitlement (beta/cortesia) desacoplado do estado de cobrança
type: concept
created: 2026-06-26
updated: 2026-06-26
tags: [billing, entitlements, admin, beta, plano-efetivo, override]
sources:
  - raw/sessions/2026-06-26-beta-override.md
related:
  - pages/synthesis/monetization-v2-state.md
  - pages/concepts/lazy-period-usage-counter.md
  - .context/features/billing.md
status: stable
---

> Para dar acesso pago "de graça" (beta tester / cortesia) de forma **reversível e sem efeito na cobrança**: resolva o **plano efetivo** em *read-time* a partir de uma flag, SEM mutar os campos de estado de cobrança (`plan`/`status`/`providerSubscriptionId`).

## O padrão

- Flag de cortesia: `Subscription.adminOverrideUntil` (Date?). Ativa = no futuro.
- Helper único `effectivePlanTier(sub)` (`src/lib/billing/plans.ts`): override ativo → `PREMIUM`, senão `sub.plan`.
- **Entitlements/limites/UI leem o plano EFETIVO**; **cobrança lê o plano REAL**.
- Ligar/desligar = setar/limpar `adminOverrideUntil`. Reverte na hora, sem reconciliar nada.

## Por que desacoplar do estado de cobrança

Se você "desse premium" mudando `plan`/`status` para PRO/PREMIUM/ACTIVE, o tenant viraria **indistinguível de um pagante**: o webhook do Asaas, o dunning e a suspensão passariam a tratá-lo como cliente pago, e voltar atrás exigiria saber qual era o estado original. Mantendo o override como uma **camada de leitura** por cima do estado real, a cobrança continua intocada e o liga/desliga é trivial.

## As 2 armadilhas (aprendidas na implementação)

1. **Aplicar o plano efetivo em TODOS os gates, ou o override vaza/fica parcial.** No ConfirmaAí eram **4**: `entitlements.check` (slots/features), `quota.reserveSlotInTx` (gate atômico de paciente), `usage.getCurrentUsage`/`incrementMessagesSent` (cota de mensagens) e `GET /api/billing/subscription` (badge/paywall/limites da UI). Esquecer um (ex.: a cota de mensagens) faz o beta tester ainda bater no limite do plano real.
2. **O que pertence ao estado REAL deve continuar no plano real**, não no efetivo: `canResetFreeAccount` (reset de conta Free), o **dunning** (não mandar "pagamento em atraso" pra quem tem cortesia → filtrar contas com override) e a suspensão. Senão o tenant recebe comunicação contraditória ou perde uma feature de FREE.

## Detalhe do ConfirmaAí

- Toggle: painel `/admin/audit` (seção "Empresas — acesso beta", `POST /api/admin/override`) + script `scripts/set-beta-override.ts`. Constante `BETA_OVERRIDE_UNTIL` (2099-12-31).
- Os campos `adminOverrideUntil`/`adminOverrideReason` já existiam no schema desde a 1ª migration de Subscription — só faltava o read-time. **Zero migration.**
- Gotcha de UX: ligar/desligar pelo admin não invalida o cache `["subscription"]` do navegador do **tenant** afetado (backend sempre correto; ele vê no próximo refetch).

## Cross-refs

- `.context/features/billing.md` § "Override admin / beta tester" — operacional.
- `.context/features/admin.md` — endpoints `/api/admin/override` e `/api/admin/accounts`.
- [[lazy-period-usage-counter]] — o `messagesIncluded` do counter re-sincroniza no próximo read, então o cap volta ao real ao desligar o override.

> Fonte: raw/sessions/2026-06-26-beta-override.md
