---
title: Estado da monetização v2 — snapshot 2026-05-07 (pós-Sprint 5)
type: synthesis
created: 2026-05-07
updated: 2026-05-07
tags: [billing, monetization, snapshot, roadmap]
sources:
  - .context/plans/monetization-v2.md
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
related:
  - .context/features/billing.md
  - .context/features/plan-quota.md
  - .context/features/audit.md
  - .context/features/auth.md
status: stable
---

> Foto do roadmap de monetização em **2026-05-07** após Sprint 5. Atualizado a cada sprint fechado.

## Decisões fechadas

- **Preços**: R$ 0 / 65 / 110 (Free / Pro / Premium).
- **Métrica core**: pacientes únicos vitalícios (5 no Free).
- **CPF obrigatório no Free** (anti-fraude).
- **Sem trial pago** — Free vitalício é o trial.
- **Provider**: Asaas — ver [[../entities/asaas-integration]].
- **Bloqueio duro** ao limite (sem overage).
- **MockProvider** em dev, AsaasProvider em prod — pattern em [[../concepts/dev-fallback-without-secrets]].

## Decisões revertidas

- **Cross-tenant detection de CPF de paciente** — descartado (paciente em N clínicas é legítimo). Detecção fica só pro **dono** (`User.cpfHash`).
- **`User.cpfHash @unique`** — removida. Permite caso médico-com-2-clínicas (≤3); 4ª criação bloqueada via threshold em `owner-cpf-dedup`.

## Sprints (5/8 fechadas, 62%)

| # | Tema | Status | Notas |
| - | ---- | ------ | ----- |
| 1 | Auditoria + Subscription + hardening | ✅ 2026-05-07 | Append-only PG trigger, rate limit via AuditLog, PII redaction |
| 2 | Quota de pacientes | ✅ 2026-05-07 | `PatientQuotaSlot` ledger, `reserveSlotInTx` Serializable, hash namespacing |
| 3 | UX paywall | ✅ 2026-05-07 | UsageBadge, PaywallModal hard/soft, /billing, /precos |
| 4 | Anti-fraude signup | ✅ 2026-05-07 | reCAPTCHA, email verify (Resend), disposable blocklist, honeypot, cross-tenant CPF dono, SignupAttempt purpose-built |
| 5 | Cobrança Asaas | ✅ 2026-05-07 | BillingProvider interface, Mock+Asaas, webhook idempotente HMAC, lifecycle cron, /billing/checkout completo |
| 6 | Mensagens + gates scheduler | ⏳ próximo | UsageCounter operacional, gate `message.send`, badge mensagens |
| 7 | UX final + admin | ⏳ | `/configuracoes/atividade`, `/admin/audit`, **retention 90d AuditLog**, emails transacionais |
| 8 | LGPD + legal | ⏳ | Termos/privacidade, export, delete account, NF-e, CNPJ no rodapé |

## Dívidas técnicas (estado atual)

| Dívida | Origem | Status |
| ------ | ------ | ------ |
| Rate limit signup com `SignupAttempt` table | Sprint 1 | ✅ Sprint 4 |
| reCAPTCHA v3 | Sprint 1 | ✅ Sprint 4 |
| Email verification | Sprint 1 | ✅ Sprint 4 |
| Disposable email blocklist | Sprint 1 | ✅ Sprint 4 |
| Cross-tenant CPF do dono | Sprint 1 | ✅ Sprint 4 |
| HMAC webhook gateway | Sprint 1 | ✅ Sprint 5 |
| Retention 90d AuditLog | Sprint 1 | ⏳ Sprint 7 |

## Validação automatizada

- `npm run test:sprints` cobre Sprints 1-5 → **72/72** checks.
- `npm run test` (vitest) → **149/149** unit.
- Chrome MCP walk-through (regra obrigatória DoD): 38+ cenários validados acumulados.

## Patterns que emergiram (wikis)

- [[../concepts/timezone-on-vercel]] — runtime UTC, `TZ` env reservada
- [[../concepts/append-only-via-pg-trigger]] — proteção AuditLog
- [[../concepts/quota-ledger-immortal-slot]] — vagas vitalícias por hash
- [[../concepts/identifier-hash-namespacing]] — `cpf:`/`phone:` prefix
- [[../concepts/rate-limit-via-audit]] — counter sem Redis (Sprint 1; substituído em signup pela Sprint 4)
- [[../concepts/webhook-idempotency-via-unique-constraint]] — `@unique providerEventId` + P2002
- [[../concepts/dev-fallback-without-secrets]] — recaptcha/Resend/Asaas com bypass dev
- [[../concepts/defense-in-depth-cron]] — backstop de webhooks perdidos
- [[../concepts/rhf-radix-gotcha]] — bugs UI só pegáveis em Chrome MCP real
- [[../entities/prisma-v7-extensions]] — `$extends` p/ auditoria automática
- [[../entities/radix-popover-and-dialog]] — programmatic click não dispara
- [[../entities/asaas-integration]] — endpoints, gotchas, config

## Métricas pra acompanhar (futuro)

Quando billing real estiver no ar (pós-Sprint 5 em prod):
- Conversão Free → Pro
- Tempo médio Free → upgrade
- Bloqueios `quota.patient_blocked` por dia (sinal de calibragem do limite de 5)
- Churn por plano
- Taxa de email verify (≤24h tras signup)

> Próxima sprint: **6 (mensagens + gates do scheduler)**. Status atual: pronto pra começar.
