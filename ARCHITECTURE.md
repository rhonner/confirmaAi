# ARCHITECTURE.md - ConfirmaAí

## Visão Geral

Monolito Next.js 16 (App Router) com API routes, Prisma ORM, PostgreSQL, e integração WhatsApp via Evolution API.

> Documento histórico de arquitetura (escrito em 2026-02). A fonte de verdade operacional é [`.context/README.md`](.context/README.md) — em caso de divergência, vale o `.context/`.

## Diagrama de Módulos

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App                       │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  Pages (SSR)  │  │  API Routes  │  │  Scheduler │ │
│  │  /dashboard   │  │  /api/...    │  │  (cron)    │ │
│  │  /agenda      │  │              │  │            │ │
│  │  /pacientes   │  │              │  │            │ │
│  │  /config      │  │              │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│         └────────┬────────┘                │        │
│                  │                         │        │
│          ┌───────▼────────┐       ┌────────▼──────┐ │
│          │  Prisma ORM    │       │ Evolution API │ │
│          │  (Services)    │       │ (WhatsApp)    │ │
│          └───────┬────────┘       └───────────────┘ │
│                  │                                  │
└──────────────────┼──────────────────────────────────┘
                   │
           ┌───────▼────────┐
           │   PostgreSQL   │
           └────────────────┘
```

## Schema do Banco de Dados

```
User (dono da clínica)
├── id: String (cuid)
├── name: String
├── email: String (unique)
├── password: String (hashed)
├── clinicName: String
├── avgAppointmentValue: Float (default 0)
├── createdAt: DateTime
├── updatedAt: DateTime
├── patients: Patient[]
├── appointments: Appointment[]
└── settings: Settings?

Patient (paciente/cliente)
├── id: String (cuid)
├── name: String
├── phone: String (formato BR: +5511999999999)
├── email: String? (opcional)
├── notes: String? (opcional)
├── userId: String (FK → User)
├── createdAt: DateTime
├── updatedAt: DateTime
└── appointments: Appointment[]

Appointment (agendamento)
├── id: String (cuid)
├── dateTime: DateTime
├── status: AppointmentStatus (PENDING | CONFIRMED | NOT_CONFIRMED | CANCELED | NO_SHOW)
├── patientId: String (FK → Patient)
├── userId: String (FK → User)
├── confirmationSentAt: DateTime?
├── reminderSentAt: DateTime?
├── confirmedAt: DateTime?
├── notes: String?
├── createdAt: DateTime
├── updatedAt: DateTime
└── messageLogs: MessageLog[]

MessageLog (log de mensagens)
├── id: String (cuid)
├── appointmentId: String (FK → Appointment)
├── type: MessageType (CONFIRMATION | REMINDER)
├── sentAt: DateTime
├── response: String?
├── respondedAt: DateTime?
├── status: MessageStatus (SENT | DELIVERED | READ | FAILED)
├── createdAt: DateTime
└── appointment: Appointment

Settings (configurações por usuário)
├── id: String (cuid)
├── userId: String (unique, FK → User)
├── confirmationHoursBefore: Int (default 24)
├── reminderHoursBefore: Int (default 6)
├── confirmationMessage: String (template com variáveis)
├── reminderMessage: String (template com variáveis)
├── createdAt: DateTime
├── updatedAt: DateTime
└── user: User
```

## Fluxo da Confirmação Automática

```
1. Scheduler roda a cada 30 min (node-cron)
   │
   ├─→ Busca agendamentos nas próximas 24h SEM confirmação enviada
   │   └─→ Envia mensagem via Evolution API
   │       └─→ Marca confirmationSentAt + cria MessageLog
   │
   ├─→ Busca agendamentos nas próximas 6h SEM confirmação + COM confirmação enviada
   │   └─→ Envia lembrete via Evolution API
   │       └─→ Marca reminderSentAt + cria MessageLog
   │
   └─→ Busca agendamentos passados com status PENDING
       └─→ Marca como NO_SHOW

2. Webhook recebe resposta do WhatsApp (POST /api/webhook/whatsapp)
   │
   ├─→ "1" / "sim" / "confirmo" / "ok" → status = CONFIRMED
   └─→ "2" / "não" / "cancelo" / "cancelar" → status = CANCELED
       └─→ Atualiza MessageLog com resposta
```

## API Endpoints

```
Auth:
  POST /api/auth/[...nextauth]  - NextAuth handlers (login, register)

Patients:
  GET    /api/patients           - Lista pacientes do usuário
  POST   /api/patients           - Cria paciente
  PUT    /api/patients/[id]      - Atualiza paciente
  DELETE /api/patients/[id]      - Remove paciente

Appointments:
  GET    /api/appointments       - Lista agendamentos (filtros: date, status)
  POST   /api/appointments       - Cria agendamento
  PUT    /api/appointments/[id]  - Atualiza agendamento
  DELETE /api/appointments/[id]  - Remove agendamento

Dashboard:
  GET    /api/dashboard          - Métricas (taxa faltas, total, prejuízo)

Settings:
  GET    /api/settings           - Configurações do usuário
  PUT    /api/settings           - Atualiza configurações

Webhook:
  POST   /api/webhook/whatsapp   - Recebe respostas do WhatsApp
```

## Decisões Técnicas

1. **Next.js monolito**: API routes + frontend no mesmo deploy. Simplifica infra para MVP.
2. **NextAuth**: Provider credentials para MVP. Fácil de adicionar OAuth depois.
3. **Prisma**: Type-safe, migrations automáticas, boa DX.
4. **node-cron**: Scheduler embutido no processo Next.js. Para produção, migrar para BullMQ + Redis.
5. **Evolution API**: Self-hosted, sem custo por mensagem. Alternativa: Z-API.
6. **shadcn/ui**: Componentes acessíveis, customizáveis, sem lock-in.

## Variáveis de Template de Mensagem

- `{nome}` → Nome do paciente
- `{data}` → Data formatada (ex: "segunda-feira, 17 de fevereiro")
- `{hora}` → Hora formatada (ex: "14:30")
- `{clinica}` → Nome da clínica
