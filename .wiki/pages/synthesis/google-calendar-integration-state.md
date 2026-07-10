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
  - raw/sessions/2026-07-10-1900-gcal-phase-c-mirror.md
  - .context/features/google-calendar.md
related:
  - pages/concepts/external-event-firewall.md
  - pages/concepts/soft-delete-skips-cascade-cleanup.md
  - pages/concepts/oauth-scope-check-before-persist.md
  - pages/concepts/oauth-state-cookie-ttl-expiry.md
  - pages/concepts/google-oauth-verification-sensitive-scope.md
  - pages/concepts/idempotent-link-under-race.md
  - pages/concepts/stale-async-response-guard.md
  - pages/concepts/revive-cancelled-event-on-id-reuse.md
  - pages/concepts/patch-merge-clear-requires-explicit-empty.md
  - pages/synthesis/monetization-v2-state.md
status: draft
---

> Tese: a integração do Google Calendar é uma feature de **core** (ao lado do WhatsApp) e o que **destrava o tier PREMIUM** (`plans.ts` `googleCalendar` flag, hoje `hidden:true`). O risco dominante não é técnico-genérico — é **mandar WhatsApp para pessoas por engano**; por isso a arquitetura inteira gira em torno de manter eventos importados longe do scheduler.

## Tese e forma

Entrega faseada, cada fase independentemente entregável:

- **Fase A — overlay só-leitura**: conexão OAuth por tenant + eventos do Google exibidos na agenda como blocos só-leitura (live-fetch). Zero risco de WhatsApp. Constrói toda a infra (OAuth, cifra de token, gate, teardown).
- **Fase B — promoção manual (✅ implementada 2026-07-10)**: `ExternalEvent` + `POST /convert` + `/event-signals` (prefill) + de-dup do overlay + UI "Promover". Evento vira `Appointment` só por ação manual. **Nuance**: `ExternalEvent` é populado **lazy na promoção** — o sync incremental que *persiste* eventos ficou para **B2** (não iniciado), junto de propagação de cancelamento/reagendamento e cron de retry de revoke.
- **Fase C — sync app→Google (✅ implementada + validada E2E 2026-07-10)**: `Appointment` criado/editado/cancelado/excluído no ConfirmaAí é espelhado como evento no Google. Escopo de **escrita** (`calendar.events`) → conectados legados reconectam; `mirror.ts` via `after()` best-effort; **de-dup nos dois sentidos**; escrita nunca quebra a mutação. Ver § Fase C abaixo. ⛳ GA depende de **nova verificação OAuth** do escopo de escrita.

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
- **Dois code-reviews adversariais** (workflows): 1ª rodada (7 dimensões × verificação) — firewall/multi-tenancy/quota/privacidade **limpos**; 4 achados → 3 fixes ([[idempotent-link-under-race]], [[stale-async-response-guard]], teste tautológico [[regression-test-assert-the-predicate]]) + 1 documentado (conflito fora da tx; Serializable não protege double-booking — mesma classe do `POST /appointments`). 2ª rodada (xhigh, 20 agentes, antes do commit) — 1 **falso-positivo** descartado (promover evento de dia-inteiro: não há botão para dia-inteiro; verificadores discordaram, resolvido lendo o código) + 3 fixes menores (e-mail agora pré-preenchido; título só-prefixo não vira nome; msg de colisão deduplicada) + 2 limitações documentadas.
- **Gate**: tsc · vitest **345** · build · sprints **139/139** (GCAL.8–11). ⚠️ rodar `test:sprints` isolado (contenção no DB local se concorrente com o vitest de integração).
- **E2E real** (Chrome MCP, wcwecalc): prefill nome+telefone confirmado com evento "Consulta Ana Paula 11 97777-1234" → "Ana Paula" + (11) 97777-1234; promover → PENDING; de-dup no overlay (persiste após reload); evento intacto no Google. **Responde à pergunta antiga**: o parsing de telefone no título é confiável para *pré-preencher* (o usuário sempre confirma/edita; `isValidPhone` é o filtro real, a regex só localiza).

## Fase C — sync app→Google / mirror (2026-07-10, implementada + validada E2E com credencial REAL, não commitada)

- **O que faz**: criar/editar/reagendar/cancelar/excluir um `Appointment` NATIVO no app espelha o evento correspondente no Google Calendar do tenant. Responde à queixa do dono ("crio no app e não aparece no Google"). Detalhe operacional completo em `.context/features/google-calendar.md` § Fase C.
- **4 decisões do dono** (governam o build): escreve na **agenda principal** (`primary`) → escopo só `calendar.events`, sem seletor; **ligado automaticamente ao conectar** (sem toggle); **só ações no app (v1)** — webhook/cron não mexem no evento (fica p/ B2); cancelar/excluir/no-show **apaga** no Google.
- **Arquitetura**: primitivos de escrita ficam em `calendar.ts` (não tocam `Appointment` — mantém o check de firewall GCAL.7); a ORQUESTRAÇÃO (lê o agendamento, decide insert/patch/delete, persiste `googleEventId`, gate de plano, pula promovidos) vive em `mirror.ts`, chamado via **`after()`** das rotas → best-effort pós-resposta, **nunca quebra/500 a mutação nem lança**. Id do evento é **determinístico** (`appOriginEventId`) → `events.insert` idempotente.
- **Firewall estendido aos DOIS sentidos**: o evento origem-app é dropado do overlay pela tag `confirmaaiOrigin=app` (+ de-dup por `Appointment.googleEventId` + `/convert` rejeita origem-app); o mirror ignora agendamentos promovidos DO Google (`ExternalEvent`) para não reescrever o evento original do usuário. Ver [[external-event-firewall]].
- **Escopo mudou** `calendar.events.readonly` → `calendar.events` (write): `hasCalendarScope` passou a aceitar os dois (leitura satisfeita por qualquer um → callback não rejeita à toa); `hasWriteScope` exige o de escrita. Conectados legados só-leitura fazem **no-op** no mirror e o card mostra "Reconecte para ativar".
- **Code-review adversarial** (workflow, 7 dimensões × verificação independente, 13 agentes): dims firewall/best-effort/multi-tenancy/token-403 **limpas**; **3 fixes** — [[revive-cancelled-event-on-id-reuse]] (409 na reabertura não é sucesso cego → patch `status:"confirmed"` ressuscita o tombstone), [[patch-merge-clear-requires-explicit-empty]] (limpar observação exige `description:""`, senão o merge do patch mantém a antiga), e renomear paciente dispara `syncPatientRename` (o mirror antes só disparava pelas rotas de Appointment); **2 falso-positivos** descartados (403 com corpo não-JSON → mesma classe pré-existente aceita do read-path; guard do convert por id em vez de tag → suficiente pois o overlay já dropa por tag).
- **Gate**: tsc · vitest **357** · build · sprints **143/143** (GCAL.12–15). ⚠️ rodar `test:sprints` isolado.
- **E2E real** (Chrome MCP, wcwecalc, **escopo de ESCRITA** — dono deu o consent): reconexão → card "espelhados automaticamente"; **create** (form) → evento confirmed, TZ correto, summary/desc/tag/id batendo; **cancelar** → evento apagado (tombstone), `googleEventId` limpo; **reabrir** → evento **ressuscitado**; **reagendar+limpar-obs** → movido + `description` limpa; **excluir** → evento removido; **renomear paciente** → summary atualizado; **de-dup ao vivo** → o espelho nunca apareceu como bloco "Promover". Conferido server-to-server via `scripts/gcal-list-raw.ts` (lista eventos origem-app pela `privateExtendedProperty`). Dados de teste revertidos.
- **Aprendizado de verificação E2E**: para checar o lado Google de forma confiável, um script que usa o token da conexão + `events.list?privateExtendedProperty=confirmaaiOrigin=app&showDeleted=true` bate direto na API (vê inclusive tombstones cancelados) — mais robusto que raspar `calendar.google.com`.

## Contradições / lacunas

- `CLAUDE.md` raiz descreve stack aspiracional (Fastify etc.) — irrelevante aqui; a verdade é Next.js monolito.
- Timezone: agrupamento por dia na agenda usa fuso do browser (classe pré-existente); import de eventos deve normalizar para `America/Sao_Paulo`/instante UTC.

## Próximas perguntas

- **Verificação OAuth do escopo de ESCRITA** (agora o bloqueador nº1): a Fase C trocou p/ `calendar.events` (write), **mais sensível** que o `.readonly`. A verificação (já pendente da Fase A) tem que cobrir ESTE escopo — o review do Google para escopo sensível de escrita pode ser mais rigoroso. Falta o dono preencher o controlador (CPF) na política e submeter.
- ~~Fase C: como espelhar sem virar loop / sem quebrar a criação?~~ **Resolvido** (E2E acima): tag origem-app + de-dup 2 sentidos + `after()` best-effort.
- **B2** (vivo): sync contínuo Google→app que persiste `ExternalEvent` + propaga cancelamento/reagendamento; e espelhar as transições NÃO-UI da Fase C (confirmação por WhatsApp via webhook → patch; no-show do cron → delete) com sub-orçamento no cron.
- Vale o guard `VERCEL_ENV` no `vercel-build` pra parar de sujar o PR com preview vermelho? (hoje: não — [[vercel-preview-build-no-db-creds]])

## Cross-refs

- `.context/features/google-calendar.md` — operacional + matriz de 47+2 cenários.
- [[external-event-firewall]], [[soft-delete-skips-cascade-cleanup]], [[../concepts/dev-fallback-without-secrets]]
- [[oauth-scope-check-before-persist]], [[oauth-state-cookie-ttl-expiry]], [[google-oauth-verification-sensitive-scope]], [[vercel-preview-build-no-db-creds]] — aprendizados da sessão 2026-07-10 (E2E/prod/config).
- [[idempotent-link-under-race]], [[stale-async-response-guard]], [[regression-test-assert-the-predicate]] — aprendizados da Fase B (promoção).
- [[revive-cancelled-event-on-id-reuse]], [[patch-merge-clear-requires-explicit-empty]] — aprendizados da Fase C (mirror app→Google).
- [[monetization-v2-state]] — PREMIUM no contexto de planos.

## Fontes

- raw/sessions/2026-07-05-google-calendar-integration-fase-a.md
