# Feature: Confirmação por Link

> O paciente confirma/cancela o agendamento por um **link** (não mais "responda 1/2").
> Clicar abre uma **página** com os dados + botões; a ação é um POST. Quem não confirmar
> até o **deadline** é **auto-cancelado**. Feature 2026-07-19 (feedback do dono / Paonetone
> "confirmação clara"). Cruza [appointments](appointments.md), [scheduler](scheduler.md),
> [settings](settings.md) e o [flow de confirmação](../flows/confirmation-flow.md).

## Decisões de produto (do dono)
- **Só o link** na mensagem (sai o "Responda 1 para CONFIRMAR ou 2 para CANCELAR"). O parser 1/2
  do webhook **continua funcionando como fallback silencioso** (não é anunciado).
- **Página com botão** (não confirma direto no GET) — evita que o **pré-carregamento de link do
  WhatsApp/scanner** dispare a ação sozinho. GET = só leitura; POST = muta.
- **Estado terminal trava**: confirmou → não dá pra cancelar pelo link (e vice-versa). Enforce por
  `status !== "PENDING"`.
- **Deadline com auto-cancelamento**: link vale até `dateTime - reminderHoursBefore` (T-6h padrão).
  No deadline, quem recebeu o link e ainda está PENDING é **CANCELADO** automaticamente. O antigo
  lembrete (nudge) deixou de existir — virou o auto-cancelamento.

## Arquivos
| Camada                | Caminho                                                   |
| --------------------- | --------------------------------------------------------- |
| Token (HMAC stateless)| `src/lib/services/confirmation-token.ts`                  |
| Página pública (GET)  | `src/app/confirmar/[token]/page.tsx`                      |
| Ação pública (POST)   | `src/app/api/confirmar/[token]/route.ts`                  |
| Botões (client)       | `src/components/confirmation/confirm-actions.tsx`         |
| Link na mensagem      | `withConfirmationLink` em `src/lib/services/message-template.ts` |
| Envio + auto-cancel   | `src/lib/services/scheduler.ts` (`autoCancelUnconfirmed`) |
| Rótulos de status     | `src/lib/appointment-status.ts` (NOVO, fonte única)       |
| Auditoria             | `appointment.auto_canceled` em `src/lib/audit/labels.ts`  |

## Token (`confirmation-token.ts`)
- **HMAC-SHA256 stateless** (mesmo padrão do reset de senha). Chave = `NEXTAUTH_SECRET + "confirm-link"`.
  Corpo base64url = `appointmentId.exp` (exp = deadline em ms). `verifyConfirmationToken` é **puro** (sem DB):
  valida assinatura (timingSafeEqual) ANTES da expiração, devolve `{ appointmentId, exp }`.
- **Uso único NÃO é do token** — é do ESTADO do agendamento (`status !== PENDING` → trava). Sem tabela nova.

## Segurança (crítico)
- A **mutação só acontece no POST** (`/api/confirmar/[token]`). A página (`page.tsx`) é Server Component
  **read-only** (só `findUnique`) — o preview de link não dispara nada. ⚠️ **Regressão a evitar**: nunca
  mutar no GET nem virar Server Action que rode no load.
- Rota POST: verifica token → carrega appointment → age **só se `status === PENDING` e `dateTime > now`**.
  Token inválido/adulterado → 400; expirado → 410; não-PENDING → devolve status (sem mutar); passou do
  horário → 409.
- Página não indexável (`robots: { index: false }`). Token inválido → mensagem neutra (não vaza dados).

## Deadline + auto-cancelamento (`scheduler.ts`)
- **Deadline efetivo** (`effectiveDeadlineMs`, exportada + testada em `tests/unit/scheduler-deadline.test.ts`):
  `min(dateTime, max(dateTime - reminderHoursBefore, sentAt + GRACE))`, GRACE = **2h**. ⚠️ **Achado crítico
  do code-review**: sem o piso de GRACE, um agendamento cuja confirmação é enviada TARDE (última hora, backlog
  do cron, reconexão do WhatsApp) — dentro de `reminderHoursBefore` do horário — teria o link **já expirado**
  e seria auto-cancelado no mesmo run. O piso garante que o paciente sempre tem ≥2h (ou até o horário) p/
  confirmar. `sentAt` = `now` no envio, `confirmationSentAt` no auto-cancel → o `exp` do token e o deadline do
  auto-cancel derivam da MESMA fórmula.
- `sendConfirmations` (T‑`confirmationHoursBefore`): monta a mensagem com o LINK via `withConfirmationLink`.
  Token `exp = effectiveDeadlineMs(dateTime, reminderHoursBefore, now)`.
- `autoCancelUnconfirmed` (substitui o antigo `sendReminders`): varre `confirmationSentAt != null,
  status = PENDING, dateTime > now`; para cada um cujo `now >= effectiveDeadlineMs(dateTime, rHB,
  confirmationSentAt)` seta `status = CANCELED` + audit `appointment.auto_canceled`. **NÃO envia mensagem de
  cortesia** (decisão pós-review): furava a cota + não gerava `MessageLog` + `await` serial de 8s
  estrangulava a vazão. O paciente já foi avisado do prazo na msg de confirmação.
- **`appBaseUrl()`**: em produção, **lança** se `NEXT_PUBLIC_APP_URL`/`EVOLUTION_WEBHOOK_BASE_URL` faltarem
  (senão o link viraria `localhost` → ninguém confirma → cancelamento em massa). Falha alto: o envio aborta,
  `confirmationSentAt` não é setado, nada é auto-cancelado.
- `SchedulerStats.remindersSent` → `autoCanceled`. `markNoShows` continua (pega PENDING que passou sem janela
  de confirmação, ex.: last-minute com deadline = dateTime, ou WhatsApp desconectado).
- ⚠️ **Débito conhecido (deferido, code-review #3):** o `exp` do token é "assado" com o `reminderHoursBefore`
  do momento do envio; o auto-cancel relê o valor VIVO. Se o dono **mudar** `reminderHoursBefore` depois de um
  link já enviado, o expiry do link e o deadline do auto-cancel podem divergir (janela em que o link diz
  "expirado" mas o agendamento ainda está aberto, ou vice-versa). Edge raro; fix definitivo = **gravar o
  deadline no Appointment** (coluna nova + migration). Não feito p/ evitar migration nesta rodada.

## Validação
- Unit: `confirmation-token.test.ts` (7). Sprints: **CONF.1–5** + **MSG.5** atualizado (`test-sprints.ts`).
- **E2E no Chrome (2026-07-19)**: `/confirmar/<token>` mostra clínica+data+paciente+2 botões (GET read-only);
  Confirmar → "Presença confirmada! ✅"; reload → "Agendamento já confirmado" (trava terminal). Dado revertido.

## Settings-UI (RESOLVIDO 2026-07-19, findings #2/#6 do code-review)
- O editor de **"Template de lembrete"** (`reminderMessage`) foi **removido** de `configuracoes/page.tsx`
  (o lembrete não é mais enviado). O campo `reminderMessage` **continua no schema/DB** (sem migration) — só
  saiu do form; a rota de settings é all-optional, então o valor no banco fica intocado.
- `reminderHoursBefore` foi **relabelado**: "Cancelar automaticamente se não confirmar (horas antes)" com
  help explicando o auto-cancelamento + o piso de 2h. O card virou "Confirmação e prazo".
- A preview/nota já descrevem o LINK. E2E (`configuracoes.spec.ts`/`full-crud.spec.ts`) atualizados p/ não
  referenciar o editor de lembrete removido.

## Como estender
- **Encurtar o link**: hoje é `${NEXT_PUBLIC_APP_URL}/confirmar/<token>` (longo, funciona no WhatsApp). Um
  encurtador seria infra extra.
- **Reabrir (cancelar depois de confirmar)**: hoje é terminal. Permitir exigiria afrouxar o guard `status !==
  PENDING` e um novo estado.
- **Motivo do cancelamento**: distinguir auto vs paciente vs profissional exigiria um campo novo (`canceledReason`).
