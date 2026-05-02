# Flow: Confirmação Automática (E2E)

> Fluxo principal do sistema. Cruza Appointments, Settings, Scheduler, WhatsApp/Evolution e Webhook.

## Diagrama de estados do `Appointment.status`

```
                     PENDING (default)
                        │
        ┌───────────────┼─────────────────┐
        ▼               ▼                 ▼
   CONFIRMED       CANCELED           NO_SHOW
   (resposta "1")  (resposta "2"      (cron, dateTime
                    ou DELETE pelo     já passou e
                    profissional)      ainda PENDING)

        Edição manual (UI):
        PENDING ←→ CONFIRMED ←→ NOT_CONFIRMED ←→ CANCELED
```

## Linha do tempo (caso feliz)

```
T-24h            T-6h            T-0       T+30min (próximo cron)
  │               │               │             │
  │               │               │             │
  ▼               ▼               ▼             ▼
sendConfirma-   sendReminders   horário do    se ainda PENDING:
tions envia     envia (se       agendamento   markNoShows →
"1 ou 2"        ainda PENDING)                NO_SHOW
                                              
[Paciente responde "1" a qualquer momento]
  → webhook: status=CONFIRMED, confirmedAt=now
  → próximos crons NÃO encontram (status != PENDING)

[Paciente responde "2"]
  → webhook: status=CANCELED
  → próximos crons NÃO encontram
```

> Os **24h** e **6h** são padrão (`Settings.confirmationHoursBefore=24`, `reminderHoursBefore=6`) e configuráveis por usuário.

## Sequência detalhada

### 1. Profissional cria agendamento (`POST /api/appointments`)
- Validação Zod (`createAppointmentSchema`).
- Verifica que `patientId` pertence ao mesmo `userId`.
- Verifica que `dateTime > now`.
- Verifica conflitos (`findConflictingAppointment`).
- Cria com `status=PENDING`, `confirmationSentAt=null`, `reminderSentAt=null`.
→ ver `features/appointments.md`.

### 2. Cron a cada 30 min (`runSchedulerJobs`)
- `sendConfirmations`: filtra `confirmationSentAt=null AND status=PENDING AND user.whatsappStatus=CONNECTED`. Calcula `sendTime = dateTime - confirmationHoursBefore`. Se `sendTime <= now <= dateTime`, envia.
- `sendReminders`: análogo com `confirmationSentAt != null AND reminderSentAt=null AND status=PENDING`.
- `markNoShows`: `dateTime < now AND status=PENDING` → `NO_SHOW`.
→ ver `features/scheduler.md`.

### 3. Envio WhatsApp (`sendWhatsAppMessage`)
- Renderiza template (`message-template.ts`).
- Chama `sendText(instanceName, phone, message)` da Evolution.
- Em sucesso: marca `confirmationSentAt`/`reminderSentAt` + cria `MessageLog`.
→ ver `features/whatsapp.md`.

### 4. Paciente responde no WhatsApp
- Evolution dispara webhook `messages.upsert` para `/api/webhook/evolution/<instanceName>`.
- Resolve `User` pelo `instanceName`.
- Parse da resposta (`webhook-parser.ts` — "1/sim" ou "2/não").
- Match do `Appointment` por (`userId`, `patient.phone`, `status=PENDING`, `confirmationSentAt!=null`, `dateTime>=now`).
- Atualiza `status` e `confirmedAt`. Anexa resposta ao `MessageLog`.
→ ver `features/webhook-evolution.md`.

### 5. Dashboard reflete imediatamente
- `useDashboard()` (TanStack Query) é invalidada após mutações de appointment.
- Webhook **não invalida** caches do frontend (não tem como). UI atualiza no próximo refetch (foco da janela ou navegação).

## Pontos críticos do fluxo

- **WhatsApp desconectado**: o filtro `user.whatsappStatus=CONNECTED` impede envios. O agendamento permanece `PENDING` e vai virar `NO_SHOW` se passar do horário sem reconexão.
- **Settings ausentes**: `if (!settings) continue` no scheduler. Settings default é criado no signup, então não deveria ocorrer.
- **`reminderHoursBefore < confirmationHoursBefore`** é validado no Zod (`updateSettingsSchema.refine`) — sem isso, lembrete poderia "sair antes" da confirmação.
- **Single-instance assumption**: ver `features/scheduler.md` § "Pontos sensíveis".
- **Resposta tardia**: se chegar após `markNoShows`, o filtro `dateTime>=now` no webhook impede confirmar. Comportamento intencional (paciente não pode "confirmar" agendamento já no passado).
- **Cross-tenant**: filtro `userId` no match do webhook é essencial. Mesmo telefone pode estar em pacientes de tenants diferentes.
