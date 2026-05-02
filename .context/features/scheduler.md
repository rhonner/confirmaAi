# Feature: Scheduler / Cron Jobs

> Job recorrente que roda **a cada 30 minutos** disparando: envio de confirmações, envio de lembretes e marcação automática de no-shows.

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
- `runSchedulerJobs()` chama em sequência: `sendConfirmations()` → `sendReminders()` → `markNoShows()`.

> **Implicação**: roda em todo processo Node de Next.js. Em deploy multi-instance (ex: Vercel serverless), pode multi-disparar — considerar mover para job worker dedicado em produção. Em dev/single-process funciona.

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
- **WhatsApp obrigatório**: filtros incluem `user.whatsappStatus = CONNECTED`. Se desconectar no meio, mensagens param até reconectar.
- **Sem retry**: se `sendWhatsAppMessage` retornar `false`, **não** marca `confirmationSentAt`. Próxima execução tenta de novo, indefinidamente, até `dateTime` passar e `markNoShows` tirar do filtro.
- **Sem `MessageLog` em falha**: hoje só logamos sucesso. Para auditar falhas, criar log com `status: FAILED` no branch de erro.
- **Locale**: `formatAppointmentDate` usa `date-fns/locale/ptBR` → "segunda-feira, 5 de maio". `formatAppointmentTime` → "HH:mm".
- **Settings ausentes**: o loop faz `if (!settings) continue` — pula silenciosamente. Em registro normal, settings é criado no signup, então isso só ocorre em dados manualmente inseridos.

## Como estender

- **Novo job** (ex: notificar profissional sobre no-shows do dia): criar função em `scheduler.ts`, adicionar em `runSchedulerJobs()`.
- **Mudar frequência**: editar a cron expression em `scheduler-init.ts`. Ex: `"*/15 * * * *"` para 15 min.
- **Mensagens em ondas** (ex: 2 lembretes diferentes): adicionar campos `reminder2HoursBefore`/`reminder2Message` em `Settings`, criar `sendReminders2` análogo, com filtro `reminderSentAt: { not: null }, reminder2SentAt: null`.
- **Migrar para BullMQ**: instalar `bullmq` + Redis, substituir `cron.schedule` por enfileiramento. Já está nas dependências `package.json`? **Não** — `node-cron` é o atual. Adicionar em `dependencies` se for migrar.
