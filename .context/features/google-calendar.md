# Feature: Integração Google Calendar

> Conexão OAuth por tenant com o Google Calendar (feature **PREMIUM**), para trazer os eventos da agenda do Google para dentro do ConfirmaAí. Entregue em fases: **A (overlay só-leitura) → B (importação seletiva + confirmação opt-in) → C (sync bidirecional)**.

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
| Labels de auditoria | `gcal.connected` / `gcal.disconnected` em `src/lib/audit/labels.ts` | ✅ |
| Tabela `ExternalEvent` | `prisma/schema.prisma` + sync incremental | ⏳ Fase B |

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

## Fluxos relacionados

- [features/scheduler.md](scheduler.md) — o firewall existe por causa dos filtros de `sendConfirmations`/`markNoShows`.
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
3. **Fase B:** modelo `ExternalEvent` + sync incremental (`syncToken`, resumível) + fluxo "Promover" (matching acima) + propagação de cancelamento/reagendamento + cron de retry de revoke pendente (limitação do disconnect). Atualizar este arquivo.
