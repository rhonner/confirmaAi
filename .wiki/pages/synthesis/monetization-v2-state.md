---
title: Estado da monetização v2 — snapshot 2026-06-14 (v2 EM PRODUÇÃO, 9/11 + Sprint 10 em progresso)
type: synthesis
created: 2026-05-07
updated: 2026-06-14
tags: [billing, monetization, snapshot, roadmap]
sources:
  - .context/plans/monetization-v2.md
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
  - raw/sessions/2026-06-14-migration-incident-sprint10.md
related:
  - .context/features/billing.md
  - .context/features/plan-quota.md
  - .context/features/audit.md
  - .context/features/auth.md
  - .context/features/observability.md
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

## Sprints (9/11 fechadas — re-sequenciado 2026-06-10)

> **Re-sequenciamento 2026-06-10**: premissa do fundador "rodar e vender sozinho, sem trocar banco/arquitetura depois". Entraram 3 sprints novas (7, 8, 9); antigas 7/8 viraram 10/11. Análise de invariantes de escala em `monetization-v2.md` §9.4 — conclusão: a stack atual escala sem rewrite; os riscos reais são operacionais e silenciosos (WhatsApp desconectado, cron morto, webhook travado), cada um com sprint própria.

| # | Tema | Status | Notas |
| - | ---- | ------ | ----- |
| 1 | Auditoria + Subscription + hardening | ✅ 2026-05-07 | Append-only PG trigger, rate limit via AuditLog, PII redaction |
| 2 | Quota de pacientes | ✅ 2026-05-07 | `PatientQuotaSlot` ledger, `reserveSlotInTx` Serializable, hash namespacing |
| 3 | UX paywall | ✅ 2026-05-07 | UsageBadge, PaywallModal hard/soft, /billing, /precos |
| 4 | Anti-fraude signup | ✅ 2026-05-07 | reCAPTCHA, email verify (Resend), disposable blocklist, honeypot, cross-tenant CPF dono, SignupAttempt purpose-built |
| 5 | Cobrança Asaas | ✅ 2026-05-07 | BillingProvider interface, Mock+Asaas, webhook idempotente HMAC, lifecycle cron, /billing/checkout completo |
| 6 | Mensagens + gates + hardening escala scheduler | ✅ 2026-06-10 | `usage.ts` lazy-period, gate dedup `QUOTA_BLOCKED`, chunking 200/45s, índices compostos, audit `cron.run`, badge ≥50% |
| 7 | Go-live (deploy produção) | ✅ 2026-06-12 | **V2 EM PRODUÇÃO E VENDENDO** — merge→main, 16/16 envs, smoke E2E completo (WhatsApp confirma + Pix paga e ativa Pro automático). 3 bugs reais corrigidos no caminho (ver abaixo). Marca unificada ConfirmaAí→Clínica Organizada. |
| 8 | Resiliência WhatsApp **[nova]** | ✅ 2026-06-13 | Anti-churn silencioso: detecção CONNECTED→DISCONNECTED (webhook + poll), email + banner, sweep no cron com `shouldRenotifyDisconnected`, health-check Evolution, `whatsappConnectedPct`. `src/lib/email.ts` genérico extraído. 174→ vitest, 87 sprints |
| 9 | Observabilidade **[nova]** | ✅ 2026-06-14 | `GET /api/health` (200/503) — `evaluateHealth` pura. `captureError` + `onRequestError`. **Sentry instalado + ATIVO em prod** (DSN no Vercel; validado via probe → evento real; padrão [[../concepts/optional-dependency-via-dynamic-import]]). **UptimeRobot** com 3 monitores. Op. em `.context/features/observability.md`. |
| 10 | Receita passiva: emails + admin (ex-7) | 🔄 em progresso | **fatia 1 ✅** `/admin/audit` + `/configuracoes/atividade`. **fatia 2.1 ✅** reset de senha real ([[../concepts/stateless-password-reset-token]], validado em prod). **fatia 2.2 ✅** emails transacionais (boas-vindas/pagamento/cancelamento). **Falta**: fatia 2.3 (perto-do-limite + dunning 1/3/7), retention 90d AuditLog, reset conta Free, checkout CPF-null. ⚠️ **Incidente de migration** resolvido no caminho → [[../concepts/migrations-not-auto-applied]]. |
| 11 | LGPD + legal (ex-8) | ⏳ pré-marketing | Termos/privacidade, export, delete account, NF-e, CNPJ no rodapé |

## 🚦 Bloqueadores de marketing (ordem de ataque)

> Produto funciona ponta a ponta. Estes travam **aquisição**, não uso:

1. **🔴 Safe Browsing flag** — Chrome mostra tela vermelha de phishing em alguns perfis (Enhanced Safe Browsing). Search Console **verificado** (DNS TXT) e **sem issue listado** → é heurística de tempo real, não blacklist central. Mitigação aplicada: marca unificada (sinal nome≠domínio eliminado). Próximo: monitorar Search Console → "Request review" se virar listagem. Em perfil padrão o site abre normal.
2. **🟠 Marca dupla** — ✅ RESOLVIDO 2026-06-12 (ConfirmaAí→Clínica Organizada no código).

## 🐛 Bugs reais achados no go-live (todos antes do 1º cliente)

| Bug | Como pego | Fix | Doc |
| --- | --------- | --- | --- |
| Resposta WhatsApp ignorada (JID sem 9º dígito) | smoke test, número real antigo | `brPhoneCandidates` | [[../concepts/whatsapp-ninth-digit-jid]] |
| Cliente paga e fica FREE (externalReference em `payment`) | teste de pagamento Pix real | `planTierFromPayload` (3 fontes) | [[../concepts/asaas-external-reference-in-payment]] |
| Chave Pix ausente → QR `invalid_action` | 1º checkout real | cadastrar chave aleatória no Asaas (onboarding) | — |
| Checkout retry duplica assinatura no gateway | 2º checkout | 📋 backlog Sprint 10 | — |
| Checkout com `User.cpf` null (grandfathered) rejeita assinatura | conta pré-Sprint 4 | 📋 backlog Sprint 10 | — |

> Lição transversal: **integração externa só revela o shape/edge real com tráfego real**. Mock/sandbox passavam; produção com Pix de R$ 3 pagou 5 bugs.

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

- `npm run test:sprints` cobre Sprints 1-6 → **79/79** checks.
- `npm run test` (vitest) → **164/164** unit (em 2026-06-12, após fixes do go-live).
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
- [[../concepts/lazy-period-usage-counter]] — quota de mensagens sem job de reset (Sprint 6)
- [[../concepts/neon-pooled-vs-direct-url]] — pooled no runtime, direta nas migrations
- [[../concepts/vercel-hobby-cron-workaround]] — crontab da VPS dispara o scheduler 30/30min
- [[../concepts/claude-chrome-sensitive-domains]] — "Permission denied" é prompt aprovável, não bloqueio duro
- [[../concepts/asaas-external-reference-in-payment]] — externalReference vem em `payment`, não `subscription`
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

## 📍 Estado ao fim de 2026-06-12 (snapshot de descanso)

**V2 está no ar e vendendo de verdade** (`clinicaorganizada.com`). Fluxo completo validado com dinheiro real: signup → WhatsApp confirma → Pix paga → Pro ativa automático.

**Próxima sessão — ordem sugerida:**
1. **Limpeza Asaas** (5 min): cancelar 3 assinaturas de teste pra não cobrar em ~30d — `sub_yd62rxxzokuelolp` (testepagto), a da testepagto2, e a órfã `sub_3m1b00oia8grmdp2`. Credenciais de teste no `.env` local.
2. **Monitorar Safe Browsing**: conferir no Chrome se a tela vermelha sumiu pós-unificação de marca; se persistir, "Request review" no Search Console (já verificado).
3. **Sprint 8 — Resiliência WhatsApp** (anti-churn silencioso): minha recomendação forte ANTES de ligar marketing. Não depende de nada externo, dá pra começar a codar direto.
4. Backlog de bugs (Sprint 10): checkout retry duplica assinatura; checkout com `User.cpf` null (grandfathered).

**Contas de teste de produção** (no `.env` local): `rhonner.matheus+testepagto@gmail.com` e `+testepagto2@gmail.com`, senha `TesteClinica2026!`, ambas PRO ativas. Seed dev segue `rhonner.matheus@gmail.com / 123456`.
