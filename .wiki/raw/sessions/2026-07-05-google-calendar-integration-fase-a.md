---
type: session
date: 2026-07-05
branch: main
status: ingested
files_touched:
  - prisma/schema.prisma
  - prisma/migrations/20260705023500_add_google_calendar_connection/migration.sql
  - src/lib/services/google/token-crypto.ts
  - src/lib/services/google/revoke.ts
  - src/lib/billing/entitlements.ts
  - src/app/api/account/route.ts
  - src/lib/account/account-purge.ts
  - tests/unit/gcal-token-crypto.test.ts
  - .context/features/google-calendar.md
  - .context/README.md
  - .context/features/lgpd-account.md
---

# Sessão 2026-07-05 — Integração Google Calendar: design + Fase A (backend)

## Objetivo da sessão

Integrar o Google Calendar na agenda (feature de core, ao lado do WhatsApp). Pedido do dono: mapear pontos a validar, principalmente cenários (calendário cheio, vazio, etc.), com critério. Depois, começar a implementar.

## Resultado

- **Design completo** produzido por um workflow de 14 agentes (6 recon no código real, 3 arquiteturas concorrentes, matriz de 47+2 cenários, 5 críticas adversariais). Tudo registrado em `.context/features/google-calendar.md` (não duplicar).
- **Fase A — fundação de backend implementada, revisada (code-review xhigh, 6 fixes) e validada**: `tsc` · `vitest` 287 · `build` · `test:sprints` 128. Working tree **não commitada** — dono vai commitar na branch `v1.0.1` (isolar de prod) via `gh`.
- Entregue: modelo `GoogleCalendarConnection` (1:1 User, tokens cifrados) + enum + migration; `token-crypto.ts` (AES-256-GCM) + `revoke.ts`; actions de entitlement PREMIUM; teardown LGPD no delete de conta + purga.
- **Inacabado (próxima sessão):** rotas OAuth + UI + overlay na agenda (Passo 2), bloqueado até o dono prover credencial Google Cloud + `GCAL_TOKEN_ENC_KEY` e iniciar a verificação OAuth.

## Decisões / aprendizados

- **Decisão-mãe: firewall `ExternalEvent`.** Eventos do Google nunca entram na tabela `Appointment` por sync — senão o scheduler (`sendConfirmations`/`markNoShows`, queries cross-tenant que só olham `Appointment`) mandaria WhatsApp pra número lixo e marcaria NO_SHOW falso. Ver [[external-event-firewall]].
- **Decisão (ponto 1 do dono): evento → paciente é promoção MANUAL com matching por telefone**, nunca auto-criar paciente sem telefone nem deduplicar por e-mail. Por quê: telefone é a identidade de mensagem (`@@unique([userId,phone])`); e-mail não manda WhatsApp e no caso comum o profissional só escreve o nome no título. Detalhe em `.context/features/google-calendar.md`.
- **Decisão: OAuth do Google é fluxo SEPARADO** (auth-code + PKCE, autenticado por `getAuthSession()`), **nunca** um `GoogleProvider` no NextAuth v4 (Credentials-only + JWT puro; não há tabela Account, e `@auth/prisma-adapter` é v5-incompatível).
- **Aprendizado LGPD (achado crítico do red-team):** delete de conta é **soft-delete** → `onDelete:Cascade` a partir de `User` NUNCA dispara → o refresh token do Google sobreviveria pra sempre. Precisa teardown explícito. Ver [[soft-delete-skips-cascade-cleanup]].
- **Aprendizado (code-review xhigh):** um fallback de chave de cifra gateado por "não-produção" protege tokens REAIS com chave conhecida em preview/staging/self-host (NODE_ENV≠production). Fallback de **segredo reversível** deve ser gateado ao **runner de teste**. Ver [[dev-fallback-without-secrets]].

## Gotchas / surpresas

- `prisma migrate dev` (v7.4) **não regenerou** o client automaticamente aqui — `prisma.googleCalendarConnection` só apareceu no tipo após `prisma generate` explícito. Ver [[migrations-not-auto-applied]].
- `PIPESTATUS[0]` não funciona no shell (zsh) — usar `$pipestatus` ou checar exit direto.
- Vitest define `process.env.VITEST` e `NODE_ENV=test`; útil pra gatear fallback de teste sem depender só de NODE_ENV.
- Regra do dono nesta sessão: **não criar Artifacts neste projeto** (design vai pro chat / `.context` / `.wiki`).

## Para ingerir na wiki

- [x] criar `pages/concepts/external-event-firewall.md`
- [x] criar `pages/concepts/soft-delete-skips-cascade-cleanup.md`
- [x] criar `pages/synthesis/google-calendar-integration-state.md`
- [x] atualizar `pages/concepts/dev-fallback-without-secrets.md` (nuance de segredo reversível)
- [x] operacional detalhado → `.context/features/google-calendar.md` (referenciado, não duplicado)

## Conversa relevante

Faseamento acordado: **A (overlay só-leitura) → B (importação seletiva + confirmação opt-in) → C (sync bidirecional)**. PREMIUM (`plans.ts` `hidden:true`) só destrava quando a feature funcionar E2E + verificação OAuth aprovada.
