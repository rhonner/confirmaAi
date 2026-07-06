---
title: Estado da integração Google Calendar (2026-07)
type: synthesis
created: 2026-07-05
updated: 2026-07-05
tags: [google-calendar, integrations, roadmap, premium, oauth]
sources:
  - raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
  - raw/sessions/2026-07-05-google-calendar-oauth-ui-fase-a-complete.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/soft-delete-skips-cascade-cleanup.md
  - pages/synthesis/monetization-v2-state.md
status: draft
---

> Tese: a integração do Google Calendar é uma feature de **core** (ao lado do WhatsApp) e o que **destrava o tier PREMIUM** (`plans.ts` `googleCalendar` flag, hoje `hidden:true`). O risco dominante não é técnico-genérico — é **mandar WhatsApp para pessoas por engano**; por isso a arquitetura inteira gira em torno de manter eventos importados longe do scheduler.

## Tese e forma

Entrega faseada, cada fase independentemente entregável:

- **Fase A — overlay só-leitura**: conexão OAuth por tenant + eventos do Google exibidos na agenda como blocos só-leitura (live-fetch). Zero risco de WhatsApp. Constrói toda a infra (OAuth, cifra de token, gate, teardown).
- **Fase B — importação seletiva + confirmação opt-in**: eventos persistem numa tabela separada `ExternalEvent`; viram `Appointment` só por **promoção manual**.
- **Fase C — sync bidirecional**: push channels + reconciliação. Só se pedido.

## Evidências / decisões

- **Firewall `ExternalEvent`** é a decisão que governa tudo. Ver [[external-event-firewall]].
- **OAuth separado do NextAuth**: fluxo auth-code + PKCE autenticado por `getAuthSession()`, nunca `GoogleProvider` (o login é Credentials-only + JWT puro; sem tabela Account). Ver `.context/features/google-calendar.md`.
- **Evento → paciente = promoção manual com matching por telefone** (não auto-criar sem telefone, não deduplicar por e-mail): telefone é a identidade de mensagem; e-mail não manda WhatsApp e raramente existe (profissional escreve o nome no título). Resposta ao "ponto 1" do dono.
- **Teardown LGPD** obrigatório e não-óbvio por causa do soft-delete. Ver [[soft-delete-skips-cascade-cleanup]].
- **Gate de plano**: `gcal.connect/sync/convert` → PREMIUM; `gcal.convert` também no gate `EMAIL_NOT_VERIFIED` (cria paciente/agendamento).

## Estado atual (2026-07-05, fim do dia)

- **Fase A COMPLETA em código** (2 sessões no mesmo dia): backend (modelo + cifra + gate + teardown LGPD) **e** rotas OAuth PKCE + card em /configuracoes + overlay read-only na agenda. Gate: `tsc` · vitest **318** · build · sprints **135** · walk-through Playwright 21/21 com credencial fake. Não commitado — dono commita na branch `v1.0.1`.
- **Aprendizado-chave do OAuth Google**: revogar um refresh token derruba o grant inteiro do par conta+app — na reconexão, só revogar o token antigo se a conta Google MUDOU. Ver raw da sessão 2.
- **Bloqueio para GA (dono):** credenciais reais do Google Cloud (`GOOGLE_CLIENT_ID/SECRET`), `GCAL_TOKEN_ENC_KEY` em dev+Vercel, e a **verificação OAuth** do Google (escopo `calendar.events.readonly` é sensível; leva dias/semanas). Depois: validar matriz OAUTH-01..08 com consent real. PREMIUM só destrava com a feature E2E + verificada.

## Contradições / lacunas

- `CLAUDE.md` raiz descreve stack aspiracional (Fastify etc.) — irrelevante aqui; a verdade é Next.js monolito.
- Timezone: agrupamento por dia na agenda usa fuso do browser (classe pré-existente); import de eventos deve normalizar para `America/Sao_Paulo`/instante UTC.

## Próximas perguntas

- Verificação OAuth do Google já foi iniciada? (gate de GA)
- Fase B: parsing de telefone no título/descrição do evento é confiável o suficiente para pré-preencher a promoção?

## Cross-refs

- `.context/features/google-calendar.md` — operacional + matriz de 47+2 cenários.
- [[external-event-firewall]], [[soft-delete-skips-cascade-cleanup]], [[../concepts/dev-fallback-without-secrets]]
- [[monetization-v2-state]] — PREMIUM no contexto de planos.

## Fontes

- raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
