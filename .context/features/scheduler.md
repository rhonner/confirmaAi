# Feature: Scheduler / Cron Jobs

> Job recorrente disparando: envio de confirmações, envio de lembretes e marcação automática de no-shows.
>
> ⚠️ **Cadência real em produção**: o `vercel.json` agenda `0 3 * * *` (**1×/dia**, limite do plano Vercel Hobby) — não a cada 30 min. Em dev, o `node-cron` roda `*/30 * * * *`. Isso degrada o produto (lembretes com janela de 2h praticamente nunca disparam no momento certo). Mitigação planejada (Sprint 7): disparo externo a cada 15-30 min em `POST /api/cron/run` com `Authorization: Bearer CRON_SECRET` (cron-job.org, UptimeRobot ou crontab da VPS Hetzner) — muda quem chama, não o código.

## Arquivos que compõem a feature

| Camada            | Caminho                                          |
| ----------------- | ------------------------------------------------ |
| Bootstrap         | `instrumentation.ts` (raiz do projeto)           |
| Inicializador     | `src/lib/services/scheduler-init.ts`             |
| Lógica principal  | `src/lib/services/scheduler.ts`                  |
| Wrapper envio     | `src/lib/services/whatsapp.ts`                   |
| Template          | `src/lib/services/message-template.ts`           |
| Modelos Prisma    | `Appointment`, `MessageLog`, `Settings`, `User`  |

## Como roda

- `instrumentation.ts` (Next.js hook) carrega `startScheduler()` apenas em runtime Node:
  ```ts
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./src/lib/services/scheduler-init");
    startScheduler();
  }
  ```
- `startScheduler()` registra `cron.schedule("*/30 * * * *", runSchedulerJobs)` (a cada 30 min, hora cheia e meia).
- `runSchedulerJobs()` processa em sequência: confirmações → lembretes → `markNoShows()` → **`runBillingNotifications()` (Sprint 10 fatia 2.3 — dunning + perto-do-limite)** → `runBillingMaintenance()` → `runWhatsappResilience()` (Sprint 8), e **retorna `SchedulerStats`**. ⚠️ `runBillingNotifications` roda **antes** de `runBillingMaintenance` de propósito: a suspensão (PAST_DUE>7d) zeraria o status PAST_DUE e o email do dia 7 (aviso de suspensão iminente) não sairia. Ver [`billing.md`](billing.md) § Dunning. (`{ confirmationsSent, remindersSent, sendFailures, quotaBlocked, noShowsMarked, truncated, durationMs, whatsappRenotified, whatsappDisconnectedWithPending, evolutionHealth, whatsappConnectedPct, dunningEmailsSent, usageWarningsSent }`). A rota `/api/cron/run` audita `cron.run` com essas stats a cada execução — heartbeat consumido pelo check `cron` de `GET /api/health` (ver [`observability.md`](observability.md)): sem `cron.run` nos últimos 90 min → 503. Em falha do job, o catch da rota chama `captureError({ area: "cron" })`.

### Sprint 8 — resiliência WhatsApp no cron

`runWhatsappResilience()` (em `src/lib/services/whatsapp-alerts.ts`) roda a cada execução do cron:
1. **Health-check Evolution** (`checkEvolutionHealth`, timeout 10s) → `DOWN` audita `evolution.health_failed`.
2. **Métrica** `whatsappConnectedPct` (% de tenants com instância CONNECTED).
3. **Sweep de desconectados**: tenants `DISCONNECTED|FAILED` com `whatsappDisconnectedAt` setado → `shouldRenotifyDisconnected` decide (dedup 24h; com agendamentos futuros renotifica diariamente + audit `whatsapp.disconnected_with_pending`; sem, só reforço na janela 24-48h). Email via `src/lib/email.ts` (dev sem `RESEND_API_KEY` → console).

Detalhes completos em [`whatsapp.md`](whatsapp.md) § Resiliência.

### Sprint 6 — quota de mensagens + hardening de escala

- **Gate de quota** (`src/lib/billing/usage.ts`): antes de cada envio, o scheduler consulta as mensagens restantes do tenant no período (cache por execução em `Map<userId, remaining>`). Sem saldo → **não envia**, cria `MessageLog { status: QUOTA_BLOCKED }` + audit `quota.message_blocked` — **deduplicado** por (appointment, type), senão viraria spam a cada run. O appointment fica `PENDING`: se o tenant fizer upgrade antes do horário, o próximo run envia normalmente.
- **Incremento**: envio com sucesso chama `incrementMessagesSent(userId)` (increment atômico em `UsageCounter`, linha keyed por `@@unique([userId, periodStart])`).
- **Período**: ciclo de cobrança para pago com `currentPeriodEnd` futuro; senão (FREE ou webhook de renovação perdido) mês calendário UTC. Não existe job de "reset" — a virada de período é a criação lazy de uma nova linha.
- **Chunking + time-budget**: varredura em lotes de 200 (`BATCH_SIZE`), ordenada por `dateTime asc` (prioriza horários próximos), com deadline de 45s (`TIME_BUDGET_MS` — a rota tem `maxDuration = 60`). Estourou → `stats.truncated = true` e o próximo run continua de onde parou (enviados saem do filtro sozinhos; pulados vão pra `skippedIds` só dentro do run).
- **Índices**: `Appointment(status, confirmationSentAt)` e `Appointment(status, dateTime)` — as queries do scheduler são cross-tenant e viravam scan global (migration `20260610213959`).
- **Helper de dev**: `npx tsx scripts/set-message-usage.ts <email> <n>` força o contador do período corrente (reverter pra 0 após testes).

> **Dev (local)**: o `instrumentation.ts` mantém o processo node ativo e o `node-cron` dispara a cada 30 min. Funciona desde que `npm run dev` esteja rodando.
>
> **Produção (Vercel)**: o `node-cron` NÃO dispara (Vercel é serverless — instâncias morrem entre requests). O agendador roda via **Vercel Cron Jobs** definido em `vercel.json`, que faz `GET /api/cron/run` a cada 30 min. O endpoint exige header `Authorization: Bearer ${CRON_SECRET}` (Vercel injeta automaticamente; chamadas externas retornam 401). Internamente chama o mesmo `runSchedulerJobs()`.

## `sendConfirmations`

Envia mensagem de confirmação para agendamentos que ainda não foram notificados.

- Filtro Prisma:
  ```
  confirmationSentAt: null
  status: "PENDING"
  user.whatsappStatus: "CONNECTED"
  ```
- Para cada appointment, lê `settings.confirmationHoursBefore` e calcula `sendTime = dateTime - hoursBefore`.
- **Pula** se `now < sendTime` (cedo demais) ou `now > dateTime` (já passou).
- Renderiza `settings.confirmationMessage` com `{nome, data, hora, clinica}`.
- **Anexa a instrução de resposta (2026-07-11)**: envolve o template em `withResponseInstruction(...)` (`message-template.ts`) antes do `formatMessage`, adicionando ao final a linha canônica `Responda 1 para CONFIRMAR ou 2 para CANCELAR.` (derivada do `webhook-parser.ts`). O template guardado é só o corpo; a instrução é dona do sistema. Corrige o bug do usuário instruir número errado. Ver `features/settings.md`.
- Envia via `sendWhatsAppMessage(user.evolutionInstanceName, patient.phone, message)`.
- Em sucesso: `appointment.update({ confirmationSentAt: now })` + cria `MessageLog { type: CONFIRMATION, status: SENT }`.

## `sendReminders`

Envia mensagem de lembrete para quem já recebeu confirmação mas ainda não respondeu.

- Filtro:
  ```
  confirmationSentAt: { not: null }
  reminderSentAt: null
  status: "PENDING"        // se já confirmou/cancelou, não cai aqui
  user.whatsappStatus: "CONNECTED"
  ```
- Mesmo cálculo de `sendTime` usando `settings.reminderHoursBefore` (deve ser **menor** que `confirmationHoursBefore` por validação).
- Mesma lógica de envio + `MessageLog { type: REMINDER, status: SENT }`.

## `markNoShows`

Marca como `NO_SHOW` qualquer agendamento ainda `PENDING` cuja `dateTime` já passou.

```ts
prisma.appointment.updateMany({
  where: { dateTime: { lt: now }, status: "PENDING" },
  data: { status: "NO_SHOW" },
})
```

> Não filtra por `userId` (atualização global). Tudo bem porque o critério `status=PENDING` + `dateTime<now` é universal — não há vazamento de dados, só atualização.

## Pontos sensíveis

- **Single-instance**: rodar em múltiplos processos pode causar mensagens duplicadas. O `update` de `confirmationSentAt` é o mecanismo de idempotência, mas há janela de race entre o `findMany` e o `update`. Em produção real, usar um worker dedicado (BullMQ ou cron externo) e/ou lock distribuído.
- **WhatsApp obrigatório**: filtros incluem `user.whatsappStatus = CONNECTED`. Se desconectar no meio, mensagens param até reconectar — **mas desde a Sprint 8 isso não é mais silencioso**: o tenant recebe email imediato + reforços e vê banner vermelho no dashboard (ver `whatsapp.md` § Resiliência).
- **Sem retry**: se `sendWhatsAppMessage` retornar `false`, **não** marca `confirmationSentAt`. Próxima execução tenta de novo, indefinidamente, até `dateTime` passar e `markNoShows` tirar do filtro.
- **Auditoria** (Sprint 1): cada `sendConfirmations`/`sendReminders` emite `audit({ action: "message.sent", ... })` no branch de sucesso e `"message.send_failed"` no branch de falha. Contexto vem do `runWithAuditContext({ actorType: "SYSTEM", actorId: "cron" })` setado em `/api/cron/run`. `MessageLog` continua sendo a tabela de domínio (só sucesso); `AuditLog` cobre falhas também.
- **Locale & timezone**: `formatAppointmentDate`/`formatAppointmentTime` usam `formatInTimeZone(..., "America/Sao_Paulo", ...)` (date-fns-tz) com locale ptBR. **Não** usar `format()` puro: o runtime do Vercel é UTC e o `Appointment.dateTime` é um instante UTC, então `format()` rendiza 3h adiantado (14h → "17:00"). `TZ` é env reservada no Vercel, por isso o fix é em código, não em env var.
- **Settings ausentes**: o loop faz `if (!settings) continue` — pula silenciosamente. Em registro normal, settings é criado no signup, então isso só ocorre em dados manualmente inseridos.

## Validação manual no browser (Sprint 6)

Confirmado em 2026-06-10 via Chrome MCP (seed user, dev server):

1. ✅ PRO com `set-message-usage 600` → header mostra pill **"600/1000 msgs"** âmbar ao lado do badge "Pro".
2. ✅ `set-message-usage 1000` → pill vira **vermelho** "1000/1000 msgs".
3. ✅ `set-message-usage 30` (3%) → pill **some** (regra: só aparece ≥ 50%).
4. ✅ `toggle-admin-plan FREE` + 30/50 (60%) → dois pills coexistem: "30/50 msgs" âmbar + "5/5 pacientes" vermelho.
5. ✅ Popover do pill de pacientes (FREE) mostra "Mensagens no mês: **30** de **50**" + CTA upgrade.
6. ✅ Estado revertido ao fim: PRO + 0/1000.

Lógica de gate/increment/período coberta por `npm run test:sprints` (checks 6.1-6.7) e `tests/unit/usage-period.test.ts`.

## Como estender

- **Novo job** (ex: notificar profissional sobre no-shows do dia): criar função em `scheduler.ts`, adicionar em `runSchedulerJobs()`.
- **Mudar frequência**: editar a cron expression em `scheduler-init.ts`. Ex: `"*/15 * * * *"` para 15 min.
- **Mensagens em ondas** (ex: 2 lembretes diferentes): adicionar campos `reminder2HoursBefore`/`reminder2Message` em `Settings`, criar `sendReminders2` análogo, com filtro `reminderSentAt: { not: null }, reminder2SentAt: null`.
- **Migrar para BullMQ**: instalar `bullmq` + Redis, substituir `cron.schedule` por enfileiramento. Já está nas dependências `package.json`? **Não** — `node-cron` é o atual. Adicionar em `dependencies` se for migrar.
