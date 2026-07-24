# Feature: Integração Google Calendar

> Conexão OAuth por tenant com o Google Calendar (feature **PREMIUM**), para trazer os eventos da agenda do Google para dentro do ConfirmaAí. Entregue em fases: **A (overlay só-leitura) → B (importação seletiva + confirmação opt-in) → C (sync app→Google)**.

## Status (2026-07-10 — Fase C: espelhamento app→Google IMPLEMENTADA e validada E2E com credencial real)

- **2026-07-10 (Fase C — mirror app→Google):** um `Appointment` criado/editado/cancelado/excluído no app é **espelhado** como evento no Google Calendar do tenant. **Decisões do dono (as 4 que governam o build):** (1) escreve na **agenda principal** (`primary`) — escopo só `calendar.events`, sem seletor de calendário; (2) **ligado automaticamente ao conectar** (sem toggle opt-in; gate = conexão CONNECTED + escopo de escrita + PREMIUM); (3) **só ações no app (v1)** — webhook (confirmação do paciente) e cron (no-show) NÃO mexem no evento; (4) cancelar/excluir/no-show **apaga** o evento no Google. **Escopo OAuth mudou** `calendar.events.readonly` → `calendar.events` (read/write) — quem já estava conectado vira "só-leitura" e precisa **reconectar** (o card mostra "Reconecte para ativar"). Mirror é **best-effort via `after()`** (pós-resposta, nunca quebra/500 a mutação do Appointment nem lança). **Firewall nos DOIS sentidos:** o evento que NÓS criamos carrega tag `extendedProperties.private.confirmaaiOrigin="app"` → `mapGoogleEvent` o descarta do overlay (não vira bloco promovível) + de-dup por `Appointment.googleEventId` na rota de events + `/convert` rejeita promover evento origem-app; e o mirror **ignora** agendamentos promovidos DO Google (com `ExternalEvent`) — nunca reescreve o evento original do usuário. Id do evento é **determinístico** (`appOriginEventId` = base32hex do appointmentId) → `events.insert` idempotente (409). **Gate verde** (tsc · vitest **357** · build · sprints **143/143** c/ GCAL.12–15). **Code-review adversarial (workflow, 7 dimensões × verificação independente):** 3 achados CONFIRMED corrigidos + 2 falso-positivos descartados; ver § Code-review Fase C. **E2E real (Chrome MCP, wcwecalc, escopo de escrita):** create/cancel/reabrir(ressuscitar)/reagendar+limpar-obs/excluir/renomear-paciente + de-dup do overlay + estados do card — todos conferidos contra a Google Agenda real (§ Validação E2E Fase C). **Mudanças não commitadas** (dono commita via `gh`). ⚠️ Escopo `calendar.events` é AINDA mais sensível → **nova verificação OAuth do Google** é obrigatória antes do GA (planejar junto com a verificação já pendente da Fase A).

## Status (2026-07-10 — Fase B: promoção manual evento→agendamento IMPLEMENTADA e validada E2E)

- **2026-07-10 (Fase B — promoção manual):** implementada a **promoção de um evento do Google a um `Appointment` gerenciado** — a resposta operacional ao "como um evento vira paciente/agendamento". Inclui: modelo `ExternalEvent` (persistido **lazy só na promoção**, NÃO há full-sync ainda), rota `POST /convert` (idempotente, tx Serializable, quota/conflito), rota `POST /event-signals` (extrai nome/telefone/e-mail do evento p/ pré-preencher), de-dup do overlay (evento promovido some), botão "Promover" + diálogo em modo-promoção na agenda, e pré-preenchimento do form de paciente. **Gate verde** (tsc · vitest **345** · build · sprints 139/139 c/ GCAL.8–11). **Dois code-reviews adversariais (workflows)**: (1ª rodada, 7 dimensões) 4 achados → 3 corrigidos (idempotência de corrida, guard de sinais obsoletos, GCAL.9 tautológico) + 1 documentado (double-booking por corrida, classe pré-existente = POST /appointments); (2ª rodada, xhigh, 20 agentes) 1 **falso-positivo** descartado (promover dia-inteiro — sem botão para dia-inteiro) + 3 fixes menores (e-mail agora pré-preenchido; prefixo de agenda sozinho não vira nome do paciente; mensagem de colisão de paciente deduplicada) + 2 limitações menores documentadas (ver § Limitações conhecidas). **E2E real (Chrome MCP, credencial wcwecalc)**: prefill nome+telefone, criação/vínculo de paciente, promoção→PENDING, de-dup no overlay — ver § Fase B abaixo. **Sync contínuo (B2) segue NÃO iniciado.** Mudanças **não commitadas** (dono commita via `gh`).

## Status (2026-07-10 — E2E real ampliado: overlay real + OAUTH-05/06/07)

- **2026-07-10:** com a credencial real, validados via Chrome MCP: **overlay renderizando eventos REAIS** (timed/dia-inteiro/privado→"Ocupado"/intercalação com agendamentos), **OAUTH-06** (revoke externo → NEEDS_RECONSENT → reconnect), **OAUTH-07** (scope-mismatch não corrompe conexão) e **OAUTH-05** (reconnect com refresh novo). Detalhe em § Validação E2E real — rodada 2. Só **OAUTH-08** (troca de conta) segue pendente. Bloqueadores de GA inalterados (Vercel + verificação OAuth).

- **Fase A — fundação de backend: IMPLEMENTADA e validada** (sessão 1). Modelo `GoogleCalendarConnection`, cifra de token AES-256-GCM, gate de entitlement PREMIUM e **teardown LGPD** (revoke + delete no delete de conta e rede de segurança na purga).
- **Fase A — rotas OAuth + UI + overlay: IMPLEMENTADAS e validadas** (sessão 2; tsc · vitest 326 · build · test:sprints 135 · walk-through Playwright 23/23 com credencial FAKE — ver § Validação manual no browser; code-review xhigh de 35 agentes com 15 achados endereçados — ver § Code-review). Fluxo completo: `oauth.ts` (PKCE S256 + state em cookie httpOnly), rotas `connect/callback/disconnect/status/events`, card em /configuracoes, overlay read-only na agenda. **Commitado + pushado em `bc3b1e5` (branch `v1.0.1`).**
- **✅ CREDENCIAL REAL PROVISIONADA + E2E VALIDADO (2026-07-06, Chrome MCP)** — ver § Provisionamento da credencial e § Validação E2E real. Projeto Google Cloud `confirmaai-501623` (conta wcwecalc@gmail.com), Client ID `839155064339-e4omad0qu488jjpgnfhrj8ksr6mofpj3.apps.googleusercontent.com`, 3 env vars no `.env`. Consent real passou → `{connected:true}`.
- **PENDENTE (ainda bloqueia GA da feature):** (1) setar as 3 vars no **Vercel** + adicionar redirect URI de prod no cliente OAuth (precisa do domínio de prod); (2) **verificação OAuth do Google** (escopo `calendar.events.readonly` é sensível; dias/semanas) → só então destravar PREMIUM (`plans.ts` `hidden:false`). Até a verificação: modo "Testando" (cap 100 test users, refresh token expira em 7 dias).
- **Fases B e C: NÃO iniciadas** (design registrado abaixo). **Sync app→Google (criar agendamento no ConfirmaAí e replicar no Google) é Fase C (bidirecional), por design não existe na Fase A** (que é read-only Google→ConfirmaAí).

## Decisão que governa tudo: firewall `ExternalEvent`

Os três pontos do scheduler que mandam WhatsApp ou marcam falta — `sendConfirmations`, `sendReminders`, `markNoShows` (`src/lib/services/scheduler.ts`) — consultam **somente** a tabela `Appointment`. Se um evento do Google entrar ali como `PENDING`, ele herda todo o maquinário automático: vira alvo de confirmação (para número lixo/errado) e é varrido para `NO_SHOW`, corrompendo a métrica de faltas que é o produto.

**Regra inegociável:** eventos do Google **nunca** entram na tabela `Appointment` por sincronização. Na Fase A são apenas exibidos (live-fetch, sem persistência). Na Fase B são persistidos numa tabela separada e **somente-leitura** (`ExternalEvent`, ainda não criada) que o scheduler fisicamente não enxerga. Um evento só vira `Appointment` — e só então pode receber WhatsApp — via **promoção manual explícita** (ver abaixo).

## Como um evento vira paciente/agendamento (resposta ao ponto 1 do dono, 2026-07-04)

**Pergunta:** "marquei um paciente na terça no Google — vou ter um evento sem paciente, ou um paciente auto-criado sem telefone? dá pra usar os convidados e deduplicar por e-mail?"

**Decisão — NÃO auto-criar paciente. O evento entra como bloco só-leitura sem paciente.** Ele aparece na agenda como contexto; não cria `Patient`, não consome vaga de quota, não dispara WhatsApp.

Por quê não auto-criar um paciente sem telefone:
- `Patient.phone` é **obrigatório**; um `phone=""` colide em `@@unique([userId, phone])` → só existe **um** paciente sem telefone por tenant, e o hash de telefone vazio colide em `reserveSlotInTx` (`SlotConflictError`).
- Criar paciente **queima vaga vitalícia** (FREE=5, nunca liberada) e, no FREE, ainda exige CPF.
- **Decisivo:** um paciente sem telefone **nunca** pode receber confirmação por WhatsApp — que é o produto inteiro. Paciente sem telefone é pior que inútil aqui.

Por quê **e-mail não é a chave de unicidade certa**:
- A identidade de paciente neste sistema é o **telefone** (`@@unique([userId, phone])`) / CPF. `email` é anulável e **não-único** hoje.
- No caso comum, o profissional escreve o **nome** no título do evento e **não** convida o paciente como convidado do Google → não há e-mail para casar.
- E-mail não te dá um telefone para mandar WhatsApp.

**Alternativa escolhida — promoção manual com pré-preenchimento + matching (Fase B):**
1. Extrair sinais do evento: e-mails/nomes dos convidados e **parse do título/descrição** por telefone e nome (profissionais escrevem "Consulta João 11 99999-8888").
2. Abrir o diálogo "Promover a agendamento" **pré-preenchido** com nome/telefone/e-mail desses sinais.
3. **Casar com paciente existente primeiro** — por telefone canônico, depois CPF, depois e-mail — e **vincular** ao existente se achar (sem vaga nova, sem duplicata). É o "único" que o dono quer, mas ancorado no telefone (identidade de mensagem), com e-mail só como pista secundária.
4. Só **criar** paciente novo se não houver match, exigindo telefone válido ali (roda o `reserveSlotInTx` existente 1×; FREE ainda exige CPF).
5. Sem telefone obtível, o evento **fica só-leitura** na agenda (útil pra planejar) mas **não** vira agendamento gerenciado por WhatsApp. Honesto: sem telefone, sem confirmação.

## Arquivos que compõem a feature

| Camada | Caminho | Status |
| ------ | ------- | ------ |
| Modelo Prisma | `GoogleCalendarConnection` + enum `GoogleConnectionStatus` em `prisma/schema.prisma` | ✅ |
| Migration | `prisma/migrations/20260705023500_add_google_calendar_connection/` | ✅ |
| Cifra de token | `src/lib/services/google/token-crypto.ts` (AES-256-GCM) + `tests/unit/gcal-token-crypto.test.ts` | ✅ |
| Revoke do grant | `src/lib/services/google/revoke.ts` | ✅ |
| Gate de plano | `src/lib/billing/entitlements.ts` → actions `gcal.connect` / `gcal.sync` / `gcal.convert` | ✅ |
| Teardown LGPD | `src/app/api/account/route.ts` (revoke+delete imediato) + `src/lib/account/account-purge.ts` (rede de segurança) | ✅ |
| Rotas OAuth + API | `src/app/api/integrations/google-calendar/{connect,callback,disconnect,status,events}/route.ts` | ✅ |
| Cliente OAuth (PKCE) | `src/lib/services/google/oauth.ts` + `tests/unit/gcal-oauth.test.ts` (20) | ✅ |
| Cliente Calendar (live-fetch) | `src/lib/services/google/calendar.ts` + `tests/unit/gcal-calendar.test.ts` (11) | ✅ |
| Hooks | `useGoogleCalendar{Status,Connect,Disconnect,Events}` em `src/hooks/use-api.ts` | ✅ |
| UI de conexão | `src/components/settings/google-calendar-connection.tsx` (card em /configuracoes) | ✅ |
| Overlay na agenda | `GoogleEventBlock` em `src/app/(dashboard)/agenda/page.tsx` (blocos azuis tracejados, intercalados por horário, dia-inteiro pinado) | ✅ |
| Checks de regressão | `GCAL.1–7` em `scripts/test-sprints.ts` (gate, cifra, modelo 1:1, firewall, teardown) | ✅ |
| Labels de auditoria | `gcal.connected` / `gcal.disconnected` / `gcal.promoted` em `src/lib/audit/labels.ts` | ✅ |
| Tabela `ExternalEvent` | `prisma/schema.prisma` + migration `20260710170250_add_external_event` (populada **lazy na promoção**; sync incremental é B2) | ✅ (promoção) |
| Rota de promoção | `POST /api/integrations/google-calendar/convert/route.ts` (idempotente, tx Serializable, quota+conflito) | ✅ Fase B |
| Rota de sinais (prefill) | `POST /api/integrations/google-calendar/event-signals/route.ts` (gate `gcal.sync`) | ✅ Fase B |
| Extração de sinais (pura) | `src/lib/services/google/promote-signals.ts` + testes em `tests/unit/gcal-convert.test.ts` | ✅ Fase B |
| events.get (1 evento, prefill) | `fetchGoogleEventById` + `mapGoogleEventDetail` em `src/lib/services/google/calendar.ts` | ✅ Fase B |
| De-dup do overlay | filtro `!promotedIds.has(e.id)` em `.../events/route.ts` (esconde promovidos) | ✅ Fase B |
| Hooks | `useGoogleEventSignals` / `useGoogleCalendarConvert` em `src/hooks/use-api.ts` | ✅ Fase B |
| UI de promoção | botão "Promover" no `GoogleEventBlock` + diálogo modo-promoção em `agenda/page.tsx`; `defaultValues` no `patient-form-dialog.tsx` | ✅ Fase B |
| Checks de regressão B | `GCAL.8–11` em `scripts/test-sprints.ts` (link+idempotência, de-dup, firewall B, cascade) | ✅ Fase B |
| Colunas de espelho | `Appointment.googleEventId` + `googleCalendarId` em `prisma/schema.prisma` + migration `20260710195220_add_appointment_google_event` | ✅ Fase C |
| Escopo de escrita | `CALENDAR_EVENTS_SCOPE` + `hasWriteScope` em `oauth.ts` (REQUESTED_SCOPES agora pede `calendar.events`); `hasCalendarScope` aceita readonly OU write | ✅ Fase C |
| Helpers de escrita | `createGoogleEvent`/`patchGoogleEvent`/`deleteGoogleEvent` + `performGoogleWrite` + `buildEventResource` + `appOriginEventId` + `isAppOriginRaw` em `calendar.ts` (NÃO tocam `Appointment` — firewall GCAL.7) | ✅ Fase C |
| Orquestração do mirror | `src/lib/services/google/mirror.ts` (`syncAppointmentCreate/Update/Delete` + `syncPatientRename` + `mirroringEnabled` gate + persiste `googleEventId`; ignora promovidos c/ `ExternalEvent`) | ✅ Fase C |
| Tag anti-loop | `extendedProperties.private.confirmaaiOrigin="app"` no evento; `mapGoogleEvent`/`mapGoogleEventDetail` descartam origem-app; máscara de campos inclui `extendedProperties` | ✅ Fase C |
| Hooks nas rotas | `after()` em `appointments/route.ts` (POST), `appointments/[id]/route.ts` (PUT/DELETE — lê `googleEventId` antes do hard-delete), `patients/[id]/route.ts` (PUT, rename) | ✅ Fase C |
| Entitlement | action `gcal.push` em `entitlements.ts` (mesmo gate PREMIUM; FORA do email-verify); label `gcal.pushed` | ✅ Fase C |
| De-dup 2 sentidos | `events/route.ts` filtra `ExternalEvent` (Fase B) **e** `Appointment.googleEventId` (Fase C); `convert/route.ts` rejeita evento origem-app | ✅ Fase C |
| UI (status DTO + card) | `status/route.ts` expõe `mirrorActive`/`needsWriteReconsent`; card mostra "espelhados" ou "Reconecte para ativar" | ✅ Fase C |
| Legal | `content.ts` §8 + §2 reescritos p/ leitura+escrita (afirmação de Uso Limitado mantida) | ✅ Fase C |
| Helper de dev | `scripts/gcal-list-raw.ts` (READ-ONLY: lista eventos origem-app na Google Agenda via token, p/ validar create/patch/delete server-to-server) | ✅ Fase C |
| Checks de regressão C | `GCAL.12–15` em `scripts/test-sprints.ts` (gate push, escopo, firewall 2 sentidos, wiring do mirror) | ✅ Fase C |

## Modelo `GoogleCalendarConnection` (1:1 com User)

Campos: `userId @unique`, `googleAccountEmail?`, `refreshTokenEnc`, `accessTokenEnc?`, `accessTokenExpiresAt?`, `scopes` (escopos **concedidos**, space-joined), `calendarId @default("primary")`, `status` (`CONNECTED | NEEDS_RECONSENT | REVOKED`), `lastError?`, `connectedAt`, `revokedAt?`. `onDelete: Cascade` a partir de `User`.

- **NÃO está em `AUDITED_MODELS`** (`src/lib/audit/prisma-extension.ts`). É deliberado: o `redact()` do audit só limpa chaves de topo (não JSON aninhado), então tokens/PII nunca podem cair no `AuditLog`. Ao criar `ExternalEvent`, mantê-lo fora do audit também (guarda e-mails/títulos de terceiros).
- Tokens guardados **cifrados** (`token-crypto.ts`), nunca em claro. Refresh token é um grant vivo à agenda de uma pessoa.

## Cifra de token (`token-crypto.ts`)

- **AES-256-GCM**, blob versionado `g1.` + base64(`iv(12) || authTag(16) || ciphertext`). O prefixo de versão permite rotação de chave (estender `keyForVersion`).
- Chave via env `GCAL_TOKEN_ENC_KEY` (32 bytes; hex de 64 chars **ou** base64). **Chave obrigatória fora do runner de teste**: o fallback determinístico existe **só sob vitest** (`process.env.VITEST`/`NODE_ENV==="test"`); em dev, preview, staging e produção a ausência é **erro fatal** (não protege token real com chave conhecida derivada de constante — endereça achado do code-review xhigh 2026-07-05). Import do módulo é lazy (não lê env), então build e rotas sem conexão não quebram sem a var.
- `encryptToken` / `decryptToken`. Adulteração (auth tag GCM) → lança. Coberto por 8 testes unitários.

## Regras de negócio (gating + LGPD)

- **Feature exclusiva do PREMIUM** (`plans.ts` → `features.googleCalendar`; PREMIUM = `hidden:true` até isto funcionar E2E). Gate server-side via `check(userId, "gcal.connect"|"gcal.sync"|"gcal.convert")` → `PLAN_REQUIRED`/`upgrade:"PREMIUM"` fora do PREMIUM. Nunca confiar em gate só no client.
- **Cron re-checa `gcal.sync` por tenant a cada rodada** (evita sync grátis após downgrade/expirar override admin). O cron não passa por `getAuthSession`, então precisa re-checar explicitamente.
- **Teardown LGPD (achado CRÍTICO — implementado):** `DELETE /api/account` é **soft-delete** (a linha `User` nunca some) e `runAccountPurge` só apaga pacientes → `onDelete:Cascade` **nunca dispararia** para os tokens do Google. Por isso o delete revoga o grant + apaga a conexão. Após o **hardening do code-review xhigh (2026-07-05)** o fluxo é:
  1. O teardown roda **DEPOIS do commit** do soft-delete (revoke é irreversível — não pode preceder uma tx que pode dar rollback) e **isolado em try/catch** (falha aqui, inclusive tabela ausente, nunca quebra a exclusão).
  2. Revoke best-effort (timeout 5s). **Sucesso → apaga a conexão.** **Falha → MANTÉM a conexão** (senão o grant fica vivo sem token p/ retry) e emite `captureError` como sinal.
  3. `runAccountPurge` (30d) faz **revoke-then-delete** de qualquer conexão sobrevivente (garante revogação de grants que falharam no delete) e apaga o token de qualquer forma (aos 30d o token TEM que sumir do banco).
  - O trilho de consentimento (`termsAcceptedAt` etc.) é preservado como prova jurídica; o **token** é credencial viva, revogado e destruído.

## Guardas transversais (implementar em cada fase; do red-team adversarial)

- **Ordem/sub-budget no cron:** trabalho do GCal roda **por último** em `runSchedulerJobs`, com sub-budget próprio e cap por execução; filtrar `deletedAt:null` + entitlement. Senão starva os envios de confirmação (valor central) ou estoura os 60s e mata a purga LGPD.
- **Reagendamento de confirmado:** resetar só `confirmationSentAt` **não reenvia** (filtro exige `status=PENDING`, e confirmado é `CONFIRMED`). Transição explícita: `status→PENDING` + zerar `confirmationSentAt/reminderSentAt/confirmedAt` juntos, atrás de ação "reconfirmar", deduplicada contra `MessageLog`.
- **Cancelamento no Google de evento promovido:** transicionar o `Appointment` para `CANCELED` (não deixar `PENDING` → `markNoShows` faria `NO_SHOW` falso).
- **Lock de refresh de token:** sem singleton em processo no serverless, refreshes concorrentes correm; usar lock em DB por conexão (Fase B/C).
- **Full sync inicial dirigido por requisição** (callback + pull on-load), não pelo cron diário (1000+ eventos = dias de agenda vazia no cron).
- **Promoção atômica/idempotente** em `ExternalEvent.appointmentId @unique`; `reserveSlotInTx` 1×; colisão de telefone → vincular ao existente.
- **Verificação OAuth do Google:** `calendar.events` é escopo sensível → precisa de verificação para "In production". Em "Testing": cap 100 usuários + refresh token expira em 7 dias. Começar a verificação cedo; só destravar PREMIUM (`VISIBLE_PLAN_TIERS`) com a feature E2E + verificada.

## Cenários a validar (matriz completa — 47 + 2 do red-team)

Agrupados; **críticos** exigem validação obrigatória antes de GA. Passos detalhados foram levantados no design de 2026-07-04 (workflow de 14 agentes).

- **Conexão/OAuth (8):** OAUTH-01 gate PREMIUM server-side · OAUTH-02 1º connect persiste refresh cifrado **[crítico]** · 03 state/PKCE anti-CSRF · 04 sem refresh_token (prompt=consent) · 05 refresh + rotação de token · 06 revoke externo → NEEDS_RECONSENT · 07 escopo concedido ≠ pedido · 08 troca de conta Google.
- **Volume de sync (5):** vazio · dezenas **[crítico: não podem virar Appointment]** · milhares (resumível) · **histórico passado → NUNCA vira NO_SHOW [crítico]** · muito-futuros/recorrentes sem fim (timeMax).
- **Formato do evento (12):** cronometrado · dia-inteiro (âncora 09:00 SP, end exclusivo) · multi-dia (clamp 480) · recorrente (singleEvents) · exceção de série · cancelado (soft) · bloco sem convidado · convidado sem telefone · privado/confidencial (não vazar) · tentativo/recusado · OOO/focus/aniversário (filtrar) · calendário secundário/compartilhado.
- **Sync contínuo (6):** criar · editar convertido (etag) · **reagendar após confirmar [alto]** · mover/apagar · syncToken 410 → full resync · watch channel expira.
- **Integridade cross-sistema (5):** dedup nativo×Google · quota no convert · downgrade de plano · GCal sem WhatsApp · **inserir na tabela Appointment é proibido por design [crítico]**.
- **Timezone/DST (3):** offset não-BR (instante absoluto) · dia-inteiro (drift 3h) · recorrente cruzando DST.
- **Falha/abuso (8):** 403/429 backoff · 500 parcial (não commitar syncToken) · payload malformado · **delete de conta com token vivo [crítico — implementado]** · rotação/ausência da chave de cifra · corrida push×cron (lock DB) · webhook forjado (sempre 200) · status "Testing" do OAuth.
- **Red-team extra (2):** ciclo de vida do "Desconectar" (revoke+stop, preservar convertidos) · mesma conta Google em 2 tenants (revoke só na última conexão local).

## Dependências externas

1. ✅ **Projeto no Google Cloud Console** — `ConfirmaAi` (`confirmaai-501623`) na conta **wcwecalc@gmail.com** (2026-07-06). Consent screen Externo, modo Testando; credencial "Aplicativo da Web" `ConfirmaAi Web`.
2. ⏳ **Env vars** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GCAL_TOKEN_ENC_KEY` no `.env` de dev (`.env` é gitignored — secrets nunca no repo). `GOOGLE_OAUTH_REDIRECT_URI` explícito (por causa da porta 3001, ver § Provisionamento). **Vercel (produção, projeto `saas1`, 2026-07-10): ✅ 4/4 vars completos.** `GOOGLE_CLIENT_ID` + `GOOGLE_OAUTH_REDIRECT_URI` (=`https://clinicaorganizada.com/api/integrations/google-calendar/callback`) adicionados via CLI pelo assistente; `GOOGLE_CLIENT_SECRET` + `GCAL_TOKEN_ENC_KEY` (nova, prod-only) adicionados pelo dono via `... | vercel env add` (o classificador de credencial bloqueia o assistente de materializar secret). Confirmado com `vercel env ls production`. **`GCAL_TOKEN_ENC_KEY` de prod é independente da de dev** (bancos separados; higiene de chave).
   - ✅ **Redirect de prod adicionado ao cliente OAuth** `ConfirmaAi Web` (`https://clinicaorganizada.com/api/integrations/google-calendar/callback`) em 2026-07-10 (agora 3 redirects: localhost:3000, :3001, prod). Prod serve na raiz `clinicaorganizada.com` (www→raiz).
3. ✅ **Escopo** `https://www.googleapis.com/auth/calendar.events.readonly` registrado (confidencial) + test users `wcwecalc@`, `rhonner.matheus@`.
4. ⏳ **Verificação OAuth** do Google (escopo sensível) — **ainda não iniciada**; leva dias/semanas. Sem ela: modo Testando (cap 100 users, refresh expira em 7d). Bloqueia GA.

## Provisionamento da credencial (2026-07-06) — o que aprendemos

Setup feito via Chrome MCP na conta WeCalc. Gotchas não-óbvios do Google Cloud atual:

- **MFA obrigatório**: desde 24/02/2026 o Google Cloud bloqueia acesso ao console sem verificação em duas etapas — o dono precisou ativar a MFA na conta antes de criar qualquer projeto.
- **Client secret não é mais visível após a criação**: o Console só mostra os 4 últimos chars (`****xxxx`). O valor completo só aparece **uma vez** — no diálogo "Cliente OAuth criado" (botão "Baixar JSON") **ou** ao clicar "+ Add secret" (gera um novo, exibido 1×; máx 2 secrets por cliente). Se fechar o diálogo sem capturar, o secret é irrecuperável → adicionar um novo.
- **Fluxo do consent tem 2 telas**: (1) login/e-mail, (2) "Selecione o que o app pode acessar" com **checkbox do escopo do calendário DESMARCADO por padrão** — tem que marcar senão o app não recebe `calendar.events.readonly` (e o callback trata como scope-mismatch).
- **App name na consent screen** = "ConfirmaAí" (aparece como "Prosseguir para ConfirmaAí"). `id_token` do token endpoint traz o e-mail da conta (usado como rótulo no card).
- **Porta 3000 pode estar ocupada** (no dev do dono, por Docker/supabase de outro projeto) → Next sobe em **3001**. Nesse caso: `NEXTAUTH_URL`/`NEXT_PUBLIC_APP_URL`/`GOOGLE_OAUTH_REDIRECT_URI` no `.env` devem apontar p/ 3001 **e** o cliente OAuth precisa do redirect `http://localhost:3001/...callback` autorizado. Ambos (3000 e 3001) estão autorizados no cliente.

## Validação E2E real (2026-07-06 — Chrome MCP, dev em localhost:3001, credencial REAL)

Login no app como usuário PREMIUM (seed via `toggle-admin-plan.ts PREMIUM`), consent real com a conta Google **wcwecalc@gmail.com** (test user). Confirmado:

- **OAUTH-01** gate: card "Google Agenda" visível só com credencial no servidor + plano PREMIUM.
- **OAUTH-02 [crítico]**: consent real → callback trocou code+verifier por tokens (log: `callback ... 303 in 3.7s`) → toast "Google Agenda conectada" → card "Conectado — wcwecalc@gmail.com". Refresh token persistido cifrado.
- **OAUTH-03**: authUrl com `code_challenge_method=S256`, `state`, `prompt=consent`, `access_type=offline`, escopo readonly.
- **OAUTH-05**: `GET /events` refez o access token a partir do refresh e chamou o Google (log: 200 em ~1.3s, round-trip real) → resposta `{ data: { connected: true, events: [] } }` (**sem `degraded`**; `events` vazio porque o calendário da wcwecalc não tinha eventos na semana — resultado válido).
- **OAUTH-07**: escopo concedido no callback = `calendar.events.readonly openid email`.

**O que SÓ falta validar com credencial real:** overlay renderizando eventos REAIS (calendário estava vazio na semana testada); revoke externo → NEEDS_RECONSENT (OAUTH-06); troca de conta (OAUTH-08); e o modo Testing (refresh expira em 7d). **→ Overlay real, OAUTH-06/05/07 validados em 2026-07-10 (ver seção abaixo); só OAUTH-08 segue pendente.**

## Validação E2E real — rodada 2 (2026-07-10 — Chrome MCP, dev em localhost:3001, credencial REAL, conta wcwecalc)

Fechou os gaps que a rodada de 2026-07-06 não pôde cobrir (calendário estava vazio). Perfil Chrome = WeCalc; **aprendizado crítico**: a conta ativa u/0 é `rhonner.matheus@gmail.com` — a conexão do app é com `wcwecalc@gmail.com` (u/2); confirmar SEMPRE pela conta, não pelo nome de exibição ("Rhonner Matheus" também é o display de uma conta ≠ da conectada).

- **Overlay com eventos REAIS [fecha o gap principal]:** criados 4 eventos de teste no Google Calendar da wcwecalc. Confirmado na `/agenda` do app: (1) **timed** "09:30–10:30" com badge "Google"; (2) **dia-inteiro** pinado no topo com label "Dia inteiro"; (3) **privado** (`visibility=particular`) renderizado com título **"Ocupado"** (redação de PII confirmada com dado real); (4) **intercalação por horário com agendamentos reais** — evento Google 11:00–12:00 apareceu entre os agendamentos das 09:00 e 14:30 no mesmo dia, sem menu de ações nem pill de status (firewall visual). Dia só-Google não cai no empty state. `GET /events` = 200 (round-trip real ao Google).
- **OAUTH-06 [crítico] — revoke externo → NEEDS_RECONSENT:** dono removeu o acesso do app em myaccount.google.com (Apps vinculados → ConfirmaAí → "Excluir tudo"; lista caiu de 8→7 apps, "acesso à conta" 1→0). Próximo `/events` (com access token cacheado ainda válido) → Google 401 → retry 1× → refresh → `invalid_grant` → DB `NEEDS_RECONSENT` + `lastError="invalid_grant no refresh"`, **token mantido**, `revokedAt` nulo. `/events` seguiu 200 (degradou em silêncio, nunca 5xx). UI: banner âmbar na agenda ("conexão expirou — reconecte em Configurações"), blocos Google somem, **agendamentos intactos**; card "Reconexão necessária" + botões Reconectar/Desconectar. Exercita 401-retry **e** persistência de reconsent.
- **OAUTH-07 [bônus, credencial real] — scope-mismatch não corrompe conexão saudável:** na 1ª tentativa de reconnect o dono **não marcou o checkbox do escopo do calendário** → Google concedeu só `email openid` → callback detectou mismatch → `?gcal_error=scope` e, por ser a **mesma conta com conexão existente**, **NÃO revogou** o grant nem alterou a linha NEEDS_RECONSENT (comportamento do fix #2 do code-review confirmado ao vivo).
- **OAUTH-05 [bônus] — reconnect completo:** 2ª tentativa com o escopo concedido → callback trocou code+PKCE por tokens → `?gcal=connected` → DB `CONNECTED`, escopos com `calendar.events.readonly`, `connectedAt` renovado, refresh token novo (relógio de 7d do Testing reiniciado → expira ~2026-07-17), access token fresco. Overlay real voltou a renderizar.

**Gotcha de GA reconfirmado ao vivo:** a tela "O Google não verificou este app" aparece em TODO consent enquanto o app não passar pela **verificação OAuth** — inclusive em produção. Sem verificação aprovada, todo cliente pagante vê o aviso de app não-verificado. É bloqueador duro de GA do PREMIUM.

**Só falta com credencial real:** OAUTH-08 (troca de conta Google — reconectar com conta ≠ da conectada; exige 2 rodadas de consent e troca qual conta fica ligada). Tentado em 2026-07-10 mas falhou por **timeout do state** (consent > 10 min por causa das telas do Google + tempo humano); o branch same-account (não revoga) já está coberto pelas reconexões de hoje.

## Melhoria de UX: erro de consent persistente no card (2026-07-10)

Feedback do dono ao vivo: quando a pessoa conclui o login **sem marcar o checkbox** do escopo, o erro só aparecia como **toast efêmero** — ela ficava sem saber o que houve nem como refazer. Implementado em `google-calendar-connection.tsx`:

- O desfecho de erro do callback (`?gcal_error=<motivo>`) agora vira **estado persistente** (`callbackError`) além do toast: um **alerta inline dentro do card** ("Não foi possível conectar" + mensagem específica) com um botão **"Tentar novamente"** (reinicia o `connect`) e um "×" para dispensar.
- Mensagens de `scope` e `state` reescritas para acionáveis: `scope` orienta marcar a caixa "Ver eventos em todas as suas agendas"; `state` explica que a sessão de segurança expira em ~10 min e pede rapidez.
- **Aprendizado (state cookie TTL):** o cookie de state/PKCE tem TTL de 600s; consentimentos reais lentos (aviso de app não-verificado + hesitação) podem estourar isso → `gcal_error=state`. A nova UX cobre esse caso; se virar fricção recorrente em produção, avaliar subir o TTL.
- **Code-review xhigh (2026-07-10, 18 agentes) — 4 fixes aplicados:** (1) alerta agora é **limpo ao desconectar com sucesso** (não fica "Não foi possível conectar" ao lado de "não conectada"); (2) `handleConnect` **não limpa o erro otimisticamente** (retry que falha mantém a mensagem — o sucesso limpa via redirect+effect); (3) **botão de refazer não é mais duplicado** (só o "Tentar novamente" do alerta quando há erro; o "Conectar" de baixo some); (4) mensagens `scope`/`state` **reescritas** sem citar o label PT-BR fixo do checkbox do Google (funciona com a conta Google em qualquer idioma). Aceito por design: alerta suprimido para `plan`/`session` quando o card fica oculto (não-premium sem card = PREMIUM oculto; sessão morta → login). Gate re-rodado verde.

### Invariante confirmado ao vivo — NÃO existe "meio conectado" (2026-07-10)

Pergunta do dono: "se eu conectar do zero e não marcar o checkbox, fico meio conectado?" **Não.** Validado E2E com credencial real: connect do zero (sem linha) + escopo sem calendário → o callback (`callback/route.ts:82-87`) **verifica o escopo ANTES de qualquer upsert**, revoga o grant recém-criado (higiene, pois não há conexão existente) e retorna `?gcal_error=scope` **sem gravar linha** → o app fica **DISCONNECTED** (não num limbo) + o novo alerta inline. Se já existisse conexão saudável da MESMA conta, ela ficaria **intacta** (o scope-mismatch não a toca). Gate após a mudança de UI: tsc · vitest 326 · build · sprints 135/135 (verde).

> Helpers de dev novos (gitignore não os cobre; são scripts de teste): `scripts/check-gcal-state.ts` (lê estado da conexão), `scripts/gcal-set-status.ts` (força status sem tocar token), `scripts/gcal-delete-connection.ts` (apaga a linha → DISCONNECTED).

## Fluxo OAuth implementado (Fase A, sessão 2)

- **`POST /connect`** — `getAuthSession()` + gate `gcal.connect` (402 paywall) + `isGoogleOAuthConfigured()` (503 sem credencial; inclui `GCAL_TOKEN_ENC_KEY` no check — sem ela o callback quebraria no encrypt). Gera `state` + par PKCE (S256), planta em **cookies httpOnly** (`gcal_oauth_state`/`gcal_oauth_verifier`, `SameSite=Lax`, path restrito a `/api/integrations/google-calendar`, TTL 600s) e devolve `{ authUrl }` — o client navega via `window.location.href`. URL pede `access_type=offline` + `prompt=consent` (garante refresh_token) + escopos `openid email calendar.events.readonly`.
- **`GET /callback`** — sempre redireciona para `/configuracoes?gcal=connected` ou `?gcal_error=<denied|state|plan|scope|no_refresh|session|internal>` limpando os cookies. Valida `state` (comparação constant-time), re-checa o gate, troca code+verifier por tokens, **verifica escopo concedido** (OAUTH-07: faltou a agenda → revoga o grant recém-criado e erro), **exige refresh_token** (OAUTH-04). **Troca de conta Google** (red-team): revoga o grant antigo SÓ se o e-mail mudou — revogar refresh token derruba o grant inteiro do par conta+app, então nunca revogar quando é a mesma conta reconectando. Upsert cifrado + audit `gcal.connected` (e-mail mascarado). E-mail extraído do id_token sem verificar assinatura (veio direto do token endpoint do Google via TLS — só rótulo de UI).
- **`POST /disconnect`** — revoke best-effort: **sucesso → apaga a linha** (token some do banco); **falha → marca `REVOKED` e MANTÉM o token cifrado** para retry futuro (UI trata REVOKED como desconectado; resposta `revoked:false` → toast orienta revogar em myaccount.google.com/permissions). ⚠️ Limitação conhecida: se o revoke falha e o usuário nunca reconecta nem deleta a conta, não há retry automático (a purga 30d só cobre contas deletadas) — cron de retry fica para a Fase B. Idempotente sem conexão.
- **`GET /status`** — `{ configured, allowed, status, googleAccountEmail, connectedAt }`; não sonda o Google (NEEDS_RECONSENT é persistido pelo fetch de eventos). REVOKED → reporta DISCONNECTED.
- **`GET /events?startDate&endDate`** — gate `gcal.sync`, Zod (yyyy-MM-dd, máx 62 dias), datas = **dia local America/Sao_Paulo** (mesma convenção de `GET /api/appointments`, blocos alinham na mesma grade). Live-fetch com refresh automático de access token (buffer 60s, rotação persistida), retry 1× em 401, `invalid_grant` → persiste NEEDS_RECONSENT. Resposta nunca é 5xx por falha do Google: `{ connected, needsReconsent?, degraded?, truncated?, events }` — overlay degrada em silêncio. Filtros no mapeamento: cancelados fora, `eventType` só default/fromGmail (OOO/focus/aniversário/workingLocation fora), `visibility` private/confidential → título "Ocupado", cap 250 eventos (`truncated`).
- **Card na UI** (`google-calendar-connection.tsx`): INVISÍVEL sem credencial no servidor ou sem plano+sem conexão (PREMIUM é oculto da venda — não anunciar o que não pode comprar); com conexão remanescente pós-downgrade o card fica visível para desconectar. Lê `?gcal=`/`?gcal_error=` no mount (toast + limpa URL via replaceState).
- **Overlay na agenda**: só busca eventos quando `allowed && CONNECTED`. Bloco `GoogleEventBlock` tracejado azul, badge "Google", sem NENHUMA ação (link abre no Google). Dia-inteiro pinado no topo (end exclusivo expandido por dia); timed intercalado por horário com os agendamentos; dias só-Google não caem no empty state.

## Validação manual no browser (2026-07-05 — Playwright headless, dev server + credencial FAKE)

> Chrome MCP indisponível na sessão (job em background); walk-through feito com Playwright/Chromium headless contra `npm run dev` + `GOOGLE_CLIENT_ID` fake + `GCAL_TOKEN_ENC_KEY` gerada. Screenshots como evidência. **23/23 PASS** (re-rodado após os fixes do code-review):
>
> 1. PRO: card oculto em /configuracoes; `status` → `allowed:false`; `POST connect` → 402 `PLAN_REQUIRED/PREMIUM`; `GET events` → 402.
> 2. PREMIUM (via `toggle-admin-plan.ts`): card visível; connect devolve URL `accounts.google.com` com `code_challenge_method=S256`, `state`, `prompt=consent`, `access_type=offline`, escopo readonly; cookies httpOnly com path restrito e TTL 600s; clique navega ao consent; callback com state forjado → 303 `?gcal_error=state`; events valida formato e range >62d (400).
> 3. Conectado (linha semeada com token fake cifrado): card mostra e-mail; /agenda dispara live-fetch → refresh contra o Google falha (client fake) → `degraded:true` sem quebrar a página.
> 4. NEEDS_RECONSENT: card "Reconexão necessária" + botão Reconectar.
> 5. Desconectar: revoke real (token fake → 400 = idempotente) → linha apagada → card volta a desconectado.
> 6. Overlay (respostas da NOSSA API mockadas no browser): blocos timed intercalados por horário entre agendamentos, dia-inteiro pinado "Dia inteiro", título privado "Ocupado", badge "Google", sem ações de status/WhatsApp.
>
> **O que SÓ a credencial real valida (pendente):** consent de verdade persistindo refresh cifrado (OAUTH-02), refresh/rotação real (OAUTH-05), revoke externo → NEEDS_RECONSENT (OAUTH-06), troca de conta (OAUTH-08), eventos reais no overlay, e o modo "Testing" do OAuth (cap 100 users, refresh expira em 7d).

## Code-review xhigh da sessão 2 (2026-07-05) — 15 achados CONFIRMED, todos endereçados

Workflow de 35 agentes (finders por ângulo + verificação adversarial independente). Fixes aplicados e revalidados (gate + walk-through 23/23):

1. **State OAuth vinculado ao userId** (HMAC c/ `NEXTAUTH_SECRET` no cookie, `packStateCookie`/`verifyStateCookie`): sem isso, em browser compartilhado o usuário B completaria o consent abandonado de A e receberia a agenda de A (cross-tenant leak).
2. **Scope-mismatch não revoga grant saudável**: revogar o token novo derrubaria o grant inteiro do par conta+app — agora só revoga se NÃO existe conexão ou é conta diferente.
3. **403 transitório ≠ revogação**: `is403Transient` classifica `rateLimitExceeded`/`quotaExceeded` etc. como UPSTREAM (degraded), não NEEDS_RECONSENT — throttle do Google não força re-OAuth da base.
4. **Eventos overnight**: agrupamento expande eventos timed por TODOS os dias que intersectam (plantão dom 23h→seg 9h aparece na segunda; antes sumia e convidava double-booking).
5. **Disconnect honesto com blob ilegível**: decrypt falhou → apaga a linha mas responde `revoked:false` (toast orienta myaccount.google.com); não mente que revogou.
6. **Card nunca some com conexão viva**: visível sempre que `status !== DISCONNECTED`, mesmo sem credencial no servidor ou sem plano — desconectar (LGPD) não depende de config/plano; botão Desconectar também em NEEDS_RECONSENT (tenant rebaixado não fica preso).
7. **Decrypt de refresh token ilegível → NEEDS_RECONSENT** (permanente, pede reconexão), não "degraded" eterno; access token ilegível → cai no refresh.
8. **`markNeedsReconsent` best-effort** (P2025 de disconnect concorrente não quebra o contrato "nunca lança" do fetch).
9. **Avisos fora do grid**: degraded/`truncated`/needsReconsent aparecem também no empty state; needsReconsent invalida o `gcal-status` cacheado e linka p/ Configurações.
10. **Filtro ativo esconde o overlay** (eventos Google não têm status/paciente — não mascarar o "nenhum resultado do filtro").
11. **Datas não-calendário (2026-13-40) → 400** (NaN burlava os guards de range na rota de events).

**Classe pré-existente documentada (sem mudança):** o agrupamento por dia no client usa o fuso do BROWSER (igual aos appointments) enquanto a janela de busca é America/Sao_Paulo — browser fora de SP desloca eventos de beira de meia-noite. Consistente com o resto da agenda; fix é app-wide (fora do escopo).

## Fase B — Promoção manual (evento → agendamento) [2026-07-10]

Implementa a decisão de design "como um evento vira paciente/agendamento" (§ acima): **promoção manual explícita**, com matching e pré-preenchimento. É a única forma de um evento do Google virar `Appointment` — coerente com o firewall.

### Modelo `ExternalEvent` (populado LAZY na promoção — não há full-sync)

`ExternalEvent` (migration `20260710170250_add_external_event`): `id`, `userId`, `googleEventId`, `calendarId`, snapshot (`title`, `startsAt`, `endsAt?`, `allDay`, `googleStatus?`), `appointmentId? @unique`, timestamps.
- `@@unique([userId, googleEventId])` → **idempotência**: um evento não é promovido 2×.
- `appointmentId @unique` + `onDelete: Cascade` (a partir de `Appointment`) → **apagar o agendamento libera o evento** para reaparecer no overlay e ser promovido de novo (validado em GCAL.11).
- `onDelete: Cascade` a partir de `User`. **NÃO** está em `AUDITED_MODELS` (guarda título/horário de terceiros).
- **Só é escrito na promoção** (não há sync incremental que popule a tabela — isso é B2). O comentário no schema deixa isso explícito.

### Firewall estendido à Fase B (invariante duro)

O `scheduler.ts` **nunca** menciona `ExternalEvent` (GCAL.10 falha se mencionar). Um evento do Google só vira alvo de WhatsApp/no-show **depois** de virar `Appointment` via promoção — que é justamente o comportamento desejado (o profissional escolheu gerenciá-lo). A tabela `ExternalEvent` em si é invisível ao scheduler.

### Onde o usuário dispara a promoção (UI) — atualizado 2026-07-24

| Visão  | Como promover                                                                 |
| ------ | ----------------------------------------------------------------------------- |
| Semana | botão **"Promover"** no bloco; clicar no CORPO do bloco abre o evento no Google |
| Dia    | **clicar no evento** na grade (`day-grid.tsx`)                                  |
| Mês    | **clicar no chip** do evento (`month-view.tsx`)                                 |

Nas grades (Dia/Mês) não cabe um botão, então o **clique** é a ação: promove quando dá, e
quando não dá **abre o evento no Google**. A decisão está só em `handleGoogleEventClick`
(`agenda/page.tsx`) + a regra `canPromoteGoogleEvent` (dia inteiro e "Ocupado" não promovem —
o primeiro porque a duração encaixaria em ≤ 8h; o segundo porque não há nada para
pré-preencher). Antes dessa mudança o clique nas grades **não fazia nada** e o evento parecia
morto (feedback do dono). Detalhes de interação em
[`agenda-day-grid.md`](agenda-day-grid.md) § "Clique num evento do Google".

⚠️ **Evento no passado**: o diálogo abre normalmente (com o aviso "este horário já passou") e
o `POST /convert` recusa com "Não é possível promover um evento no passado" — o usuário pode
ajustar a data/hora no próprio diálogo. Comportamento pré-existente do botão da Semana, não
regressão do clique.

### `POST /convert` (`convert/route.ts`)

Gate `gcal.convert` (PREMIUM+e-mail) → resolve paciente → cria `Appointment` PENDING → grava `ExternalEvent` linkado. Pontos sensíveis endereçados:
- **Idempotência sequencial**: antes de tudo, se já existe `ExternalEvent` com `appointmentId`, devolve o agendamento existente (`alreadyPromoted:true`) sem criar nada.
- **Resolução de paciente**: `patientId` explícito → senão match por **telefone** (`userId_phone` unique) → **CPF** (`userId_cpfHash`) → senão cria novo (exige `patient` com telefone válido; passa por `checkEntitlement("patient.create")` + `reserveSlotInTx` 1×, espelhando `POST /api/patients`).
- **Rejeita passado** (`when < now`) → senão `markNoShows` marcaria NO_SHOW falso.
- ~~**Conflito de horário**~~: o guard `findConflictingAppointment` foi **removido em 2026-07-24** (sobreposição é permitida, mesma regra do `POST /appointments`). Com isso a limitação de corrida documentada abaixo — dois `/convert` simultâneos criando agendamentos sobrepostos — **deixa de ser risco**: esse resultado agora é válido.
- **Tx Serializable**: cria paciente (se preciso) + `Appointment` + `ExternalEvent` atomicamente. Usa `create` (não `upsert`) no `ExternalEvent` para não orfanar sob corrida.
- **Corrida (idempotência concorrente)**: no catch, para **qualquer P2002/P2034**, primeiro re-checa `alreadyPromotedResponse()` e devolve o agendamento do vencedor; só então cai nas mensagens de conflito de paciente. (Fix do review — antes, o perdedor que recriava o mesmo paciente via P2002 recebia "paciente já existe" para um evento que acabara de ser promovido.)
- **Audit** `gcal.promoted` (metadata: googleEventId, patientId, created, reused).
- ⚠️ O **frontend** só usa o caminho `patientId` (cria o paciente antes via `PatientFormDialog` e vincula); o caminho `patient:{...}` interno do convert existe para a API mas não é exercido pela UI hoje.

### `POST /event-signals` + prefill (`event-signals/route.ts`, `promote-signals.ts`)

- Gate de **leitura** (`gcal.sync`). Lê UM evento (`fetchGoogleEventById` → `events.get` com `description`+`attendees`, mesmo tratamento de token/401/403/invalid_grant do fetch de lista) e devolve **sinais parseados** (nome/telefone/e-mail candidatos) + `isPrivate`. **Nunca devolve a descrição crua** (evita vazar mais que o necessário); privado → sem sinais de nome.
- `promote-signals.ts` (puro, testado): `extractPhone` (regex localiza candidatos BR; `isValidPhone` é o filtro real → canônico `+55...`), `parseEventSignals` (nome = título sem telefone e sem prefixo de agenda "Consulta/Sessão/…"; e-mail do 1º convidado ou do texto, minúsculo). Evento privado (`"Ocupado"`) → sem sugestão de nome.
- **UI**: ao clicar "Promover", o diálogo abre em modo-promoção com data/hora do evento e duração encaixada em `DURATION_OPTIONS`; o nome é pré-preenchido **na hora** pelo título do overlay, e **enriquecido de forma assíncrona** (telefone/e-mail) quando `/event-signals` responde. Guard: a resposta assíncrona só aplica os defaults se o evento ainda for o ativo (evita vazar sinais de um evento abandonado para outro fluxo — fix do review).

### De-dup do overlay (`events/route.ts`)

Após o live-fetch, a rota consulta `ExternalEvent` do tenant (`googleEventId in [...]`, `appointmentId != null`) e **filtra** os promovidos (`events.filter((e) => !promotedIds.has(e.id))`). Assim o dia mostra o `Appointment` gerenciado, não o bloco Google duplicado. GCAL.9 assere o **predicado de exclusão** (não só a query).

### Code-review adversarial (2026-07-10, workflow 7 dimensões × verificação independente)

4 achados CONFIRMED, 0 refutados. As dimensões de **firewall/de-dup, multi-tenancy, quota/matching e privacidade/sinais não acharam nada** (isolamento por `userId`, firewall e redação de PII limpos). Fixes:
1. **[corrigido] Corrida de idempotência** (`convert:282`): P2002 de paciente era avaliado antes do check de já-promovido → agora `alreadyPromotedResponse()` roda primeiro p/ P2002/P2034.
2. **[corrigido] Sinais obsoletos** (`agenda:464`): `onSuccess` do `event-signals` repovoava `newPatientDefaults` mesmo após trocar/fechar o evento → guard por `promoteEventRef.current?.id === event.id`.
3. **[corrigido] GCAL.9 tautológico**: grep de `externalEvent.findMany` não pegava um filtro invertido → agora assere `!promotedIds.has`.
4. **[documentado] Double-booking por corrida** (`convert:177`): conflito checado fora da tx (a tx Serializable não protege) — **classe pré-existente idêntica ao `POST /appointments`**; endurecer exige constraint de exclusão no DB (mudança app-wide). Comentário no código deixa a limitação explícita.

### Validação E2E real (2026-07-10 — Chrome MCP, dev :3001, credencial wcwecalc)

Usuário-seed PREMIUM, conexão CONNECTED. Confirmado com eventos REAIS do Google:
- **Botão "Promover"** aparece em bloco Google cronometrado; diálogo modo-promoção com data (11/07), hora (17:30) e duração (evento 60min → "1 hora") pré-preenchidos.
- **Prefill de nome**: evento "teste2" → nome "teste2"; "Consulta Ana Paula 11 97777-1234" → **nome "Ana Paula"** (prefixo "Consulta" removido) **+ telefone (11) 97777-1234** (via `/event-signals` fazendo `events.get` real).
- **Criar novo paciente** (form pré-preenchido) → **auto-seleção** no form de promoção → "Promover" → toast "Evento promovido a agendamento".
- **DB conferido**: `ExternalEvent(title="teste2", appointmentId=…)` → `Appointment status=PENDING, 2026-07-11T20:30:00Z (=17:30 BRT), dur=60, patient teste2`. TZ correto.
- **De-dup**: após promover, o bloco Google "teste2" **some do overlay** e persiste sumido após reload completo (é o `ExternalEvent` linkado que esconde). O agendamento gerenciado (Pendente, com menu de ações) aparece no lugar.
- **Firewall confirmado ao vivo**: o evento "teste2" **continua existindo no Google** (a promoção não escreve/apaga nada lá — escopo readonly). Dados de teste revertidos ao fim (paciente/agendamento/ExternalEvent apagados via script).
- **Coberto por unit+código (não re-E2E)**: idempotência de re-promoção (GCAL.8 + `alreadyPromotedResponse`); privado "Ocupado" sem botão "Promover" (`canPromote={title !== "Ocupado"}` + confirmação de overlay da rodada 2).

### Limitações conhecidas menores (do 2º code-review xhigh, aceitas)

- **Evento não-privado literalmente intitulado "Ocupado"**: o gate do botão é `canPromote={title !== "Ocupado"}` — como `"Ocupado"` é também o título redigido de eventos privados, um evento público que o usuário nomeie exatamente "Ocupado" não mostra "Promover". Edge raríssimo; corrigir exigiria carregar `isPrivate` no DTO do overlay (hoje só no DTO detalhado). Aceito.
- **Telefone só na descrição + abrir "Novo Paciente" antes do enrich assíncrono**: o prefill de nome é síncrono (título); telefone/e-mail que só existam na **descrição** chegam via `/event-signals` (assíncrono). O `PatientFormDialog` reseta os campos só na **abertura** (para não sobrescrever o que o usuário digita) — se ele abrir o form de criação **antes** da resposta chegar (~janela de 1 request), o telefone da descrição não aparece e precisa ser digitado. O caminho comum (telefone no título) é síncrono e não sofre disso. Aceito.
- **Falso-positivo descartado no review**: "promover evento de dia inteiro cria agendamento à meia-noite/120min" — **não procede**: eventos de dia inteiro são renderizados no bloco pinado SEM `canPromote`/`onPromote` (só eventos cronometrados têm "Promover"), então `handleOpenPromote` nunca é chamado para dia-inteiro.

### O que a Fase B **NÃO** faz (fica para B2 / Fase C)

- **Sync incremental** (`syncToken`, resumível) — `ExternalEvent` hoje só é populado na promoção, não há pull periódico que persista eventos.
- **Propagação de cancelamento/reagendamento do Google** para o `Appointment` promovido (snapshot fixo no momento da promoção; cancelar/mover no Google NÃO reflete no app).
- **Cron de retry de revoke pendente** (limitação do disconnect, documentada na Fase A).
- Escrita no Google (Fase C, bidirecional) — escopo é `readonly`.

## Fase C — sync app→Google (espelhamento) [2026-07-10]

Responde ao pedido do dono ("crio agendamento no app e não cria no Google" — antes a integração era mão-única Google→app). Agora um `Appointment` nativo é **espelhado** como evento no Google Calendar do tenant.

### As 4 decisões do dono (governam o build)

1. **Calendário = `primary`** (agenda principal). Escopo só `calendar.events` (o mais leve). SEM seletor de calendário (um picker exigiria `calendar.readonly` extra p/ `calendarList.list` → mais consentimento/verificação).
2. **Ligado automaticamente ao conectar** — não há toggle opt-in. Gate: conexão `CONNECTED` + escopo de escrita (`hasWriteScope`) + `gcal.push` (PREMIUM). Grant legado só-leitura → mirror faz **no-op** até reconectar (card avisa).
3. **Só ações no app (v1)** — os hooks estão só nas rotas de `Appointment` (POST/PUT/DELETE) e `Patient` (PUT rename). A confirmação do paciente por WhatsApp (webhook) e o no-show automático (cron) **NÃO** atualizam o evento no Google no v1 (evita chamadas ao Google no ack do webhook e no orçamento de 45s do cron). Fica p/ B2.
4. **Cancelar/excluir/no-show → apaga** o evento no Google (`events.delete`).

### Arquitetura (por que `mirror.ts` separado de `calendar.ts`)

O check **GCAL.7** proíbe `calendar.ts` de referenciar `Appointment` (firewall). Então:
- **`calendar.ts`** ganhou os PRIMITIVOS de escrita (`createGoogleEvent`/`patchGoogleEvent`/`deleteGoogleEvent` via `performGoogleWrite`) que só falam com a API do Google + `GoogleCalendarConnection` (token). Reaproveitam `ensureAccessToken` + retry-401 + classificação-403 (transitório vs permissão) + `INVALID_GRANT`→NEEDS_RECONSENT + **nunca-lança** (mesmo contrato dos fetchers).
- **`mirror.ts`** (novo) ORQUESTRA: lê o `Appointment`, decide insert/patch/delete, persiste `googleEventId`, faz o gate de plano (`gcal.push`), e **ignora agendamentos promovidos DO Google** (`externalEvent != null`) — nunca reescreve o evento original do usuário. É chamado via **`after()`** das rotas (pós-resposta): best-effort, nunca quebra a mutação nem lança.

### Firewall nos DOIS sentidos (invariante duro)

- **app→Google não vira loop:** o evento que criamos carrega `extendedProperties.private.confirmaaiOrigin="app"`. `mapGoogleEvent`/`mapGoogleEventDetail` retornam `null` p/ eventos com essa tag → some do overlay (não vira bloco "Promover"). Backstop: a rota `events` também filtra por `Appointment.googleEventId`; e `/convert` rejeita promover um evento cujo id bate em algum `Appointment.googleEventId` do tenant.
- **Google→app continua manual:** o mirror pula qualquer `Appointment` com `ExternalEvent` (promovido). O scheduler segue sem enxergar nada (GCAL.7/10).

### Idempotência + máquina de estados

- **Id determinístico** `appOriginEventId(appointmentId) = "cai" + sha256hex(id)` (base32hex válido no Google). `events.insert` reenviado bate no mesmo id → 409, tratado como sucesso idempotente.
- **CREATE:** insert + persiste `googleEventId`. **UPDATE:** se `CANCELED/NO_SHOW` → delete + limpa `googleEventId`; senão se tem `googleEventId` → patch; senão (backfill/reabertura) → create. **DELETE:** lê `googleEventId` ANTES do hard-delete → delete. `NOT_CONFIRMED` NÃO apaga (o horário ainda existe).
- **`status:"confirmed"` explícito** no `buildEventResource`: no insert é default (inócuo), mas num patch **RESSUSCITA** um evento que ficou `cancelled` (reabertura de agendamento) — ver fix #1.

### Code-review adversarial Fase C (workflow, 7 dimensões × verificação independente)

Dimensões firewall/best-effort/multi-tenancy/token-403 **limpas**. 3 achados CONFIRMED corrigidos + 2 falso-positivos descartados (403 com corpo não-JSON → mesma classe pré-existente aceita do read-path; guard do convert por id em vez de tag → suficiente pois o overlay já dropa por tag):

1. **[corrigido] Reabertura de cancelado deixava o evento invisível** (`calendar.ts` createGoogleEvent 409): cancelar apaga o evento (tombstone) e limpa `googleEventId`; reabrir fazia insert do mesmo id determinístico → 409 tratado como sucesso cego → evento ficava `cancelled` p/ sempre. **Fix:** no 409, em vez de sucesso cego, faz `events.patch` com `status:"confirmed"` (ressuscita o tombstone; inócuo se já vivo). [[revive-cancelled-event-on-id-reuse]]
2. **[corrigido] Limpar observações não limpava a description no Google** (`buildEventResource`): a chave `description` era omitida quando vazia, mas `events.patch` tem merge semantics (omitir ≠ limpar). **Fix:** sempre envia `description: input.description ?? ""`. [[patch-merge-clear-requires-explicit-empty]]
3. **[corrigido] Renomear paciente não atualizava o título dos eventos espelho** (`patients/[id]/route.ts`): o mirror só disparava pelas rotas de Appointment. **Fix:** `after()` na rota de paciente quando o nome muda → `syncPatientRename` re-patcha os eventos futuros, ativos, nativos (não-promovidos) do paciente.

### Validação E2E Fase C (2026-07-10 — Chrome MCP, dev :3001, credencial real wcwecalc, escopo de ESCRITA)

Reconexão com o escopo `calendar.events` (dono deu o consent) → card "Seus agendamentos são espelhados automaticamente". Verificado com a Google Agenda REAL (via `scripts/gcal-list-raw.ts`, server-to-server, filtrando `privateExtendedProperty=confirmaaiOrigin=app`):
- **CREATE** (form da agenda, Maria Santos 11/07 15:00 60min + obs) → evento `confirmed`, summary "Maria Santos", `start=2026-07-11T15:00:00-03:00` (TZ correto), `description="Retorno pos-operatorio"`, tag + id determinístico batendo com `Appointment.googleEventId`.
- **CANCELAR** (status→Cancelado) → evento vira `cancelled` (some da agenda), `Appointment.googleEventId` limpo.
- **REABRIR** (status→Confirmado) [fix #1] → evento **ressuscitado** para `confirmed`, `googleEventId` re-persistido.
- **REAGENDAR + LIMPAR OBS** (diálogo Editar, 16:30 + obs vazia) [fix #2] → evento movido p/ `16:30-03:00`, `description=null` (limpo de verdade).
- **EXCLUIR** (hard delete) → `Appointment` sumiu do DB; evento apagado (`cancelled`) — id lido antes do delete.
- **RENOMEAR PACIENTE** ("Maria Santos"→"Maria Santos Silva") [fix #3] → summary do evento futuro atualizado; tombstone antigo intacto.
- **DE-DUP / firewall ao vivo:** o espelho "Maria Santos" NUNCA apareceu como bloco Google promovível (só o agendamento gerenciado); o evento de terceiro "tetes" seguiu com "Promover" normal.
- **Card:** estado conectado-só-leitura ("Reconecte para ativar") → após reconsent → "espelhados automaticamente". Dados de teste revertidos (agendamentos apagados, paciente renomeado de volta).

### Diagnóstico / gotchas de suporte (Fase C) — "achei que não espelhou"

Dois comportamentos CORRETOS que parecem bug (validados ao vivo com o dono em 2026-07-10):

1. **No-op silencioso em conexão só-leitura (legado):** quem conectou na Fase A/B tem grant só `calendar.events.readonly`. O mirror faz `mirroringEnabled → false` (sem `hasWriteScope`) e **não escreve nada** — de propósito, não é erro. O card sinaliza ("Reconecte para ativar"), mas agendamentos **criados antes** do reconsent de escrita ficam com `googleEventId = null` e **não recebem backfill automático**. Backfill é **preguiçoso**: só ao **editar** o agendamento (o ramo de update sem `googleEventId` faz `createGoogleEvent`). Não há job de backfill em massa (é B2). → Se "só alguns espelharam", quase sempre a linha divisória é o timestamp do reconsent de escrita.
2. **O evento vai pra agenda da CONTA CONECTADA, não da conta de login:** o espelho é escrito no `primary` da conta Google **conectada** (ex: `wcwecalc@gmail.com`), que pode ser diferente da conta com que o profissional loga no app E da conta Google **padrão/ativa** do navegador. Abrir `calendar.google.com` na conta padrão mostra "nada" — o evento está na agenda da conta conectada. É a causa nº1 de falso "não espelhou". Ver [[claude-chrome-per-profile-extension]] (confirmar pela conta logada, não pelo nome). **Ferramenta de diagnóstico:** `scripts/gcal-list-raw.ts` lista os eventos origem-app direto na API pela `privateExtendedProperty=confirmaaiOrigin=app` (com `showDeleted` vê tombstones) — prova server-to-server se o evento existe, independente de qual conta/agenda o humano está olhando.

### O que a Fase C NÃO faz (fica para B2 / adiante)

- Espelhar transições NÃO feitas na tela: confirmação do paciente por WhatsApp (webhook) e no-show do cron não refletem no evento (v1 = só ações no app).
- Sentido Google→app contínuo (sync incremental / `syncToken`) — segue Fase B2.
- Backfill em massa dos agendamentos antigos (só re-espelha o que for tocado; edição de um agendamento antigo faz backfill preguiçoso via create).
- Reconciliação de edições feitas nos DOIS lados / watch channels.

## Espelho de Horário Bloqueado (TimeBlock) — 2026-07-24

A feature [Horário bloqueado](time-blocks.md) reusa as primitivas de escrita da Fase C:
`mirror.ts` ganhou `syncTimeBlockCreate/Update/Delete` (+ `blockEventInput`), chamadas via
`after()` nas rotas `/api/time-blocks`. Um bloqueio vira um evento no Google **sem convidados**
(summary = `title` do bloqueio), com o mesmo id determinístico (`appOriginEventId(blockId)`) +
tag `confirmaaiOrigin="app"` → **nunca reaparece no overlay** (`mapGoogleEvent` dropa origem-app).
Mesmo gate `mirroringEnabled` (CONNECTED + `hasWriteScope` + `gcal.push`). Sem colisão de id com
`Appointment` (cuids distintos → hashes distintos). ⚠️ **Não validado E2E com credencial Google
real** (conta de teste não conectada); o código reusa caminhos já validados. Check TB.3.

## Fluxos relacionados

- [features/scheduler.md](scheduler.md) — o firewall existe por causa dos filtros de `sendConfirmations`/`markNoShows`.
- [features/time-blocks.md](time-blocks.md) — o espelho do bloqueio reusa `mirror.ts`/`calendar.ts`.
- [features/appointments.md](appointments.md) — promoção cria um `Appointment` pelo caminho normal.
- [features/plan-quota.md](plan-quota.md) — convert consome vaga via `reserveSlotInTx`.
- [features/lgpd-account.md](lgpd-account.md) — teardown de token no delete/purga.
- [features/whatsapp.md](whatsapp.md) — padrão de "conectar serviço externo por tenant" espelhado.

## Como estender / próximos passos

1. **Dono (bloqueia GA):** (a) **✅ credenciais reais provisionadas**; (b) **✅ Vercel: 4/4 vars em produção** (`GOOGLE_CLIENT_ID`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_CLIENT_SECRET`, `GCAL_TOKEN_ENC_KEY`); (c) **✅ redirect de prod no cliente OAuth adicionado**; (d) **⏳ verificação OAuth** (escopo sensível; dias/semanas) — **maior bloqueador restante**. **CNPJ NÃO é exigido pelo Google** (nem pela LGPD-PF: o campo legal aceita CPF). Prep feita em 2026-07-10:
   - **consent screen (Branding):** página inicial `clinicaorganizada.com`, política `/privacidade`, termos `/termos`, domínio autorizado, e-mails de contato — salvos.
   - **(d2) nome do app ✅ renomeado** "ConfirmaAí" → **"Clínica Organizada"** (consistência com domínio/marca; consent agora diz "Clínica Organizada").
   - **(d1) política de privacidade:** adicionada a **seção 8 "Integração com o Google Calendar"** em `src/lib/legal/content.ts` (uso read-only, tokens cifrados, sem venda/compartilhamento, **afirmação de Uso Limitado / Google API Services User Data Policy**, revogação) + menção nos Termos + `LEGAL_VERSION` bumpado p/ `2026-07-10` (sem gate de reconsent — `LEGAL_VERSION` só carimba signup novo). **FALTA do dono:** preencher os 3 placeholders (`CONTROLLER_NAME`, `CONTROLLER_DOC`=**CPF** basta, `DPO_EMAIL`) — CPF o próprio dono digita (assistente não insere documento). Revisão de advogado recomendada (não é requisito do Google).
   - **(d3) logo** quadrado 120×120 (≤1MB) — recomendado p/ brand verification (dono fornece).
   - **(d4) vídeo demo** (YouTube) — escopo é **sensível (não restrito)**, então vídeo normalmente NÃO é obrigatório; Google pode pedir no review.
   - App segue em **"Testando"** (2/100) — **NÃO publiquei/submeti** (aguarda d1 placeholders). Depois: Publicar app (Testing→Production) + Central de verificação (justificativa: overlay read-only da própria agenda, sem escrita).
   (e) **✅ merge `v1.0.1` → main + deploy de produção FEITO (2026-07-10)** — deploy `saas1-i4closbyv` Ready; migration `add_google_calendar_connection` aplicada em prod; smoke check OK (`/api/health` `{status:ok, database:ok}`, `/login` 200). **O backend do GCal está VIVO em produção, porém DARK** (PREMIUM `hidden:true` → invisível ao usuário). (f) destravar PREMIUM (`plans.ts hidden:false`) só após (d)+(e)+E2E em prod.
2. **Com credencial real:** validar E2E no Chrome MCP a matriz OAUTH-01..08 (consent real, refresh, revoke externo, troca de conta) + eventos reais no overlay → só então destravar PREMIUM (`plans.ts` `hidden:false`).
3. **Fase B — promoção manual: ✅ FEITA (2026-07-10)** — `ExternalEvent` + `POST /convert` + `/event-signals` + de-dup + UI "Promover" + prefill. Validada E2E (ver § Fase B). **Não commitada** (dono via `gh`).
4. **Fase B2 (sync contínuo) — pendente:** sync incremental (`syncToken`, resumível, dirigido por requisição) que **persista** `ExternalEvent` sem promoção + propagação de cancelamento/reagendamento do Google para o `Appointment` promovido (cancelar no Google → `Appointment` CANCELED; reagendar → transição explícita, não só zerar `confirmationSentAt`) + cron de retry de revoke pendente + lock de refresh de token em DB. Ver § Guardas transversais.
5. **Fase C — sync app→Google: ✅ FEITA (2026-07-10)** — decisões (primary/auto-on/só-app/delete-on-cancel), escopo `calendar.events`, `mirror.ts`, tag anti-loop, de-dup 2 sentidos, 3 fixes de review, E2E real. Ver § Fase C acima. **Não commitada** (dono via `gh`).
6. **⛳ PRÓXIMO — verificação OAuth do escopo de ESCRITA (bloqueia GA):** o escopo agora é `calendar.events` (read/write), **mais sensível** que o `.readonly` da Fase A. A verificação do Google (já pendente da Fase A) precisa ser feita para ESTE escopo — planejar/submeter para `calendar.events`. Sem verificação: modo "Testando" (cap 100 users, refresh expira em 7d, aviso de app não-verificado em todo consent). Só destravar PREMIUM (`plans.ts hidden:false`) depois de: verificação aprovada + E2E em produção + placeholders legais preenchidos (controlador/CPF/DPO). A troca de escopo também exige que **todos os conectados reconectem** (o card já cobre isso com "Reconecte para ativar").
7. **Fase B2 / reconciliação (adiante):** espelhar transições não-UI (webhook confirmação → patch; cron no-show → delete no Google) com sub-orçamento; sync incremental Google→app (`syncToken`); backfill em massa; watch/push channels; lock de refresh de token em DB. WhatsApp/no-show seguem dirigidos só pelo `Appointment`.
