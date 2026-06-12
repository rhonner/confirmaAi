---
title: Dev fallback sem chaves externas
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [pattern, dev-experience, integrations, secrets]
sources:
  - raw/sessions/2026-05-07-sprint-4-5-monetizacao.md
related:
  - .context/features/auth.md
  - .context/features/billing.md
status: stable
---

> Pattern aplicado em **3 integrações** (reCAPTCHA, Resend/email-verification, Asaas/billing) para que dev local funcione **zero-fricção** sem cadastrar chaves em sandboxes externos. **Falha hard em produção** se a chave estiver ausente — sem silent skip.

## Problema

Integrações externas (Google reCAPTCHA, Resend, Asaas) exigem chave/secret. Pra cada dev na equipe se cadastrar, gerar token, configurar `.env` é fricção que paralisa onboarding e CI.

Mas: silenciar a integração em dev por default cria risco de chegar em prod sem chave configurada e nada funcionar.

## Solução

Cada integração checa env + `NODE_ENV` e:

- **Sem chave + `NODE_ENV != production`** → fallback funcional (`{ ok: true, mode: "DEV_BYPASS" }` ou log no console). Loga warning.
- **Sem chave + `NODE_ENV === "production"`** → falha hard (`{ ok: false, reason: "MISCONFIGURED" }` ou throw). Caller decide o tratamento.

## Exemplos no código

**`src/lib/anti-fraud/recaptcha.ts`:**
```ts
const secret = process.env.RECAPTCHA_SECRET_KEY;
if (!secret) {
  if (isProd) return { ok: false, reason: "MISCONFIGURED" };
  console.warn("[recaptcha] RECAPTCHA_SECRET_KEY ausente — bypass em dev");
  return { ok: true, score: 1, mode: "DEV_BYPASS" };
}
```

**`src/lib/anti-fraud/email-verification.ts`** (sendVerificationEmail):
```ts
if (!apiKey) {
  if (process.env.NODE_ENV === "production") return { ok: false, reason: "MISCONFIGURED" };
  console.info(`[email-verification] link para ${input.to}: ${link}`);
  return { ok: true, mode: "DEV_LOGGED" };
}
```

**`src/lib/billing/factory.ts`** (escolha de provider):
```ts
if (target === "ASAAS") return new AsaasProvider();
if (target === "MOCK") return new MockProvider();
// Default por NODE_ENV
return process.env.NODE_ENV === "production" ? new AsaasProvider() : new MockProvider();
```

`MockProvider` simula QR Pix fake + HMAC com pepper local — não requer Asaas sandbox.

## Garantias

- ✅ Dev clona o repo + `npm run dev` + tudo funciona (signup completo, checkout completo, lifecycle completo).
- ✅ Endpoint dev-only `/api/billing/mock-trigger` (NODE_ENV != production) dispara webhook fake assinado pra exercitar todo o ciclo.
- ✅ Email verify em dev: link aparece no console do server.
- ✅ Em prod, ausência de chave é erro explícito — não passa despercebido.

## Quando NÃO aplicar

- Integrações que **modificam** estado externo de verdade (ex: enviar SMS pra número real, debitar cartão). Aí mesmo em dev usa sandbox real porque o efeito colateral importa.
- Integrações que afetam métricas/auditoria reais. Mock pode mascarar bugs do mapeamento provider → domain.

## Trade-offs

- **Custo**: branch extra `if (!key && !prod)` em cada lugar. Vale.
- **Risco**: mock pode divergir do real. Mitigado escrevendo o mock contra o **mesmo schema** de eventos/payloads do provider real (ver `MockProvider.parseEvent` espelhando Asaas-shape).
- **Detecção de regressão prod**: typecheck + run script de health-check em deploy garante que `MISCONFIGURED` não passa.

## Wikilinks

- [[../entities/asaas-integration]]
- [[../synthesis/monetization-v2-state]]

> Fontes: `src/lib/anti-fraud/recaptcha.ts`, `email-verification.ts`, `src/lib/billing/factory.ts`, `mock.ts`.
