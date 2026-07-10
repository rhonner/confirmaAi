---
title: Estado da integração Google Calendar (2026-07)
type: synthesis
created: 2026-07-05
updated: 2026-07-10
tags: [google-calendar, integrations, roadmap, premium, oauth]
sources:
  - raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
  - raw/sessions/2026-07-05-google-calendar-oauth-ui-fase-a-complete.md
  - raw/sessions/2026-07-10-google-calendar-e2e-verify-prod.md
  - raw/sessions/2026-07-10-1447-gcal-phase-b-promotion.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/soft-delete-skips-cascade-cleanup.md
  - pages/concepts/oauth-scope-check-before-persist.md
  - pages/concepts/oauth-state-cookie-ttl-expiry.md
  - pages/concepts/google-oauth-verification-sensitive-scope.md
  - pages/concepts/idempotent-link-under-race.md
  - pages/concepts/stale-async-response-guard.md
  - pages/synthesis/monetization-v2-state.md
status: draft
---

> Tese: a integração do Google Calendar é uma feature de **core** (ao lado do WhatsApp) e o que **destrava o tier PREMIUM** (`plans.ts` `googleCalendar` flag, hoje `hidden:true`). O risco dominante não é técnico-genérico — é **mandar WhatsApp para pessoas por engano**; por isso a arquitetura inteira gira em torno de manter eventos importados longe do scheduler.

## Tese e forma

Entrega faseada, cada fase independentemente entregável:

- **Fase A — overlay só-leitura**: conexão OAuth por tenant + eventos do Google exibidos na agenda como blocos só-leitura (live-fetch). Zero risco de WhatsApp. Constrói toda a infra (OAuth, cifra de token, gate, teardown).
- **Fase B — promoção manual (✅ implementada 2026-07-10)**: `ExternalEvent` + `POST /convert` + `/event-signals` (prefill) + de-dup do overlay + UI "Promover". Evento vira `Appointment` só por ação manual. **Nuance**: `ExternalEvent` é populado **lazy na promoção** — o sync incremental que *persiste* eventos ficou para **B2** (não iniciado), junto de propagação de cancelamento/reagendamento e cron de retry de revoke.
- **Fase C — sync bidirecional**: push channels + reconciliação + escrita no Google (exige escopo além de `readonly`). Só se pedido.

## Evidências / decisões

- **Firewall `ExternalEvent`** é a decisão que governa tudo. Ver [[external-event-firewall]].
- **OAuth separado do NextAuth**: fluxo auth-code + PKCE autenticado por `getAuthSession()`, nunca `GoogleProvider` (o login é Credentials-only + JWT puro; sem tabela Account). Ver `.context/features/google-calendar.md`.
- **Evento → paciente = promoção manual com matching por telefone** (não auto-criar sem telefone, não deduplicar por e-mail): telefone é a identidade de mensagem; e-mail não manda WhatsApp e raramente existe (profissional escreve o nome no título). Resposta ao "ponto 1" do dono.
- **Teardown LGPD** obrigatório e não-óbvio por causa do soft-delete. Ver [[soft-delete-skips-cascade-cleanup]].
- **Gate de plano**: `gcal.connect/sync/convert` → PREMIUM; `gcal.convert` também no gate `EMAIL_NOT_VERIFIED` (cria paciente/agendamento).

## Estado atual (2026-07-10) — 🚀 EM PRODUÇÃO (dark)

- **Fase A EM PRODUÇÃO**: dono mergeou `v1.0.1` → `main` (PR #2, `f10b4dc`); deploy prod `saas1-i4closbyv` **Ready**, migration `add_google_calendar_connection` aplicada, smoke check OK (`/api/health` `{status:ok}`). **Backend do GCal vivo em prod, porém DARK** — PREMIUM `hidden:true` → invisível ao usuário final.
- **Validado E2E com credencial REAL** (Chrome MCP, conta wcwecalc): overlay com eventos reais (timed/dia-inteiro/privado→"Ocupado"/intercalação), **OAUTH-05/06/07**, e o invariante "**não existe meio-conectado**" ([[oauth-scope-check-before-persist]]). Só **OAUTH-08** (troca de conta) segue pendente (falhou por timeout de state — [[oauth-state-cookie-ttl-expiry]]). Gate: `tsc` · vitest **326** · build · sprints **135**.
- **Melhoria de UX**: erro do callback OAuth virou alerta persistente no card + "Tentar novamente" (não só toast). Code-review xhigh, 4 fixes.
- **Config de prod pronta**: Vercel 4/4 env vars + redirect de prod no cliente OAuth; app OAuth **renomeado "ConfirmaAí" → "Clínica Organizada"** (consistência marca↔domínio); política de privacidade ganhou seção "Integração com o Google Calendar" (Uso Limitado).
- **Aprendizado-chave do OAuth Google** (mantido): revogar um refresh token derruba o grant inteiro do par conta+app — na reconexão, só revogar o token antigo se a conta MUDOU.
- **Bloqueio restante para GA (dono):** (1) **verificação OAuth** do Google — maior item ([[google-oauth-verification-sensitive-scope]]); a prep está feita (branding/URLs/nome/política); falta preencher o controlador na política (nome + **CPF** — CNPJ não é exigido — + DPO) e submeter; (2) `plans.ts hidden:false` só após a verificação + E2E em prod.

## Fase B — promoção manual (2026-07-10, implementada + validada E2E, não commitada)

- **O que faz**: transforma um bloco Google do overlay em `Appointment` gerenciado ("Promover"), com matching de paciente (telefone→CPF→patientId) e **pré-preenchimento** (nome do título; telefone/e-mail via `/event-signals` fazendo `events.get` real). Ao promover, o evento **sai do overlay** (de-dup por `ExternalEvent` linkado) e o dia mostra o agendamento — que agora recebe o maquinário normal (confirmação WhatsApp, no-show). O firewall vale aqui: o scheduler nunca lê `ExternalEvent`. Ver [[external-event-firewall]].
- **Detalhe operacional completo**: `.context/features/google-calendar.md` § Fase B.
- **Code-review adversarial** (workflow 7 dimensões × verificação, 11 agentes): firewall/multi-tenancy/quota/privacidade **limpos**; 4 achados menores → 3 fixes ([[idempotent-link-under-race]], [[stale-async-response-guard]], teste tautológico [[regression-test-assert-the-predicate]]) + 1 documentado (conflito checado fora da tx; Serializable não protege double-booking — mesma classe do `POST /appointments`).
- **Gate**: tsc · vitest **343** · build · sprints **139/139** (GCAL.8–11).
- **E2E real** (Chrome MCP, wcwecalc): prefill nome+telefone confirmado com evento "Consulta Ana Paula 11 97777-1234" → "Ana Paula" + (11) 97777-1234; promover → PENDING; de-dup no overlay (persiste após reload); evento intacto no Google. **Responde à pergunta antiga**: o parsing de telefone no título é confiável para *pré-preencher* (o usuário sempre confirma/edita; `isValidPhone` é o filtro real, a regex só localiza).

## Contradições / lacunas

- `CLAUDE.md` raiz descreve stack aspiracional (Fastify etc.) — irrelevante aqui; a verdade é Next.js monolito.
- Timezone: agrupamento por dia na agenda usa fuso do browser (classe pré-existente); import de eventos deve normalizar para `America/Sao_Paulo`/instante UTC.

## Próximas perguntas

- Verificação OAuth: prep feita (branding/nome/política); falta o dono preencher o controlador (CPF) e submeter. Quanto tempo o review do Google leva na prática?
- ~~Fase B: parsing de telefone confiável para pré-preencher?~~ **Resolvido**: sim, como sugestão editável (E2E acima). A pergunta viva agora é **B2**: quando/se fazer o sync contínuo que persiste `ExternalEvent` + propaga cancelamento/reagendamento do Google.
- Vale o guard `VERCEL_ENV` no `vercel-build` pra parar de sujar o PR com preview vermelho? (hoje: não — [[vercel-preview-build-no-db-creds]])

## Cross-refs

- `.context/features/google-calendar.md` — operacional + matriz de 47+2 cenários.
- [[external-event-firewall]], [[soft-delete-skips-cascade-cleanup]], [[../concepts/dev-fallback-without-secrets]]
- [[oauth-scope-check-before-persist]], [[oauth-state-cookie-ttl-expiry]], [[google-oauth-verification-sensitive-scope]], [[vercel-preview-build-no-db-creds]] — aprendizados da sessão 2026-07-10 (E2E/prod/config).
- [[idempotent-link-under-race]], [[stale-async-response-guard]], [[regression-test-assert-the-predicate]] — aprendizados da Fase B (promoção).
- [[monetization-v2-state]] — PREMIUM no contexto de planos.

## Fontes

- raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
