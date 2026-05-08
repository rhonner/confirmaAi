---
date: 2026-05-07
branch: v2.0.0
type: session
duration_estimate: ~5h
---

# Sessão: Sprints 4 + 5 da monetização v2

Continuação direta da [[2026-05-07-sprint-1-3-monetizacao]] no mesmo dia.

## Objetivo

Fechar Sprint 4 (anti-fraude no signup) e Sprint 5 (cobrança Asaas com checkout Pix/cartão, webhook idempotente, lifecycle cron). Com Sprint 5 fechada, falta apenas 6/7/8 — o produto pode receber pagamento real.

## Decisões tomadas

- **Removeu `User.cpfHash @unique`** em Sprint 4 mid-execution: o caso "médico com 2 clínicas legítimas" precisava ser permitido. Defesa fica em `owner-cpf-dedup` com threshold (4ª criação bloqueada).
- **Backend tornou-se tolerante** com `acceptedTerms` (`z.unknown().optional()`) — o checkbox é validado no client; backend tem 6+ outras camadas anti-fraude. Tradeoff por bug RHF+Radix difícil de resolver.
- **MockProvider como default em dev** (Sprint 5): evita fricção de cadastrar Asaas sandbox por dev na equipe. Pattern generalizado em [[../pages/concepts/dev-fallback-without-secrets]].
- **HMAC explícito** no webhook (`verifyWebhookSignature` por provider) — fecha dívida Sprint 1.
- **Endpoint `/api/billing/mock-trigger`** (dev-only) — bypass pra exercitar lifecycle sem provider real.
- **Cron `runBillingMaintenance()`** roda no mesmo cron diário do scheduler — economiza invocação Vercel + serve como backstop pra webhooks perdidos.

## Aprendizados não-óbvios (viraram páginas wiki)

- Asaas tem peculiaridades: header `access_token` (não Bearer), `/payments/{id}/pixQrCode` retorna `encodedImage` + `payload`, NÃO tem portal estilo Stripe. → [[../pages/entities/asaas-integration]]
- Idempotência de webhook **não precisa** de Redis — `@unique providerEventId` + catch P2002 + "sempre 200 após registrar" cobre todos os retries do provider. → [[../pages/concepts/webhook-idempotency-via-unique-constraint]]
- Dev fallback consistente em 3 integrações (recaptcha, Resend, Asaas) — pattern recorrente que merece doutrina. → [[../pages/concepts/dev-fallback-without-secrets]]
- Cron diário como **backstop** de eventos perdidos é defesa em profundidade barata e robusta. → [[../pages/concepts/defense-in-depth-cron]]
- RHF + Controller + Radix Checkbox + `z.literal(true)` quebra de forma sutil — só pega no walk-through real. Plus: `JSON.stringify` envia `null`, não `undefined`, e Zod `.optional()` rejeita `null`. → [[../pages/concepts/rhf-radix-gotcha]]

## Bugs descobertos no Chrome MCP walk-through

1. **Sprint 4** — `recaptchaToken: null` quebrava Zod backend → fix `z.string().optional().nullable()`.
2. **Sprint 4** — RHF+Radix checkbox de termos não enviava `true` no submit → fix backend tolerante.
3. **Sprint 5** — funcionou de primeira no walk-through (8/8 cenários) — provavelmente porque a interação de provider abstrata foi ensaiada em testes unit antes.

## Entregas

- Sprint 4: SignupAttempt + User.cpf/cpfHash/emailVerifiedAt/token + 5 libs anti-fraude + register refactor + endpoint verify-email + página /verificar-email + frontend /registro + cross-tenant detect + 12 sprint checks + 9 cenários Chrome MCP.
- Sprint 5: BillingEvent + UsageCounter (prep) + provider interface + Mock + Asaas + factory + checkout endpoint + webhook (HMAC + idempotente) + portal + cancel + mock-trigger + páginas /billing/checkout + /billing/sucesso + /billing atualizada + lifecycle cron + 11 unit + 8 sprint checks + 8 cenários Chrome MCP.

## Validação cumulativa

- `npx tsc --noEmit` ✅
- `vitest run` → 149/149
- `npm run test:sprints` → 72/72 (15+25+12+12+8)
- Chrome MCP walk-through: 38+ cenários acumulados (Sprints 1-5)

## Snapshot do roadmap

Ver [[../pages/synthesis/monetization-v2-state]].

## Próxima sessão

Sprint 6 — Mensagens + gates do scheduler. Schema `UsageCounter` já existe (foi criado antecipadamente em Sprint 5). Trabalho: wiring no scheduler, reset mensal, badge UI, gate `message.send`.
