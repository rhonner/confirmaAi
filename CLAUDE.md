# ConfirmaAí - Sistema de Controle de Faltas + Confirmação Automática

## Sobre o Projeto

SaaS para clínicas, psicólogos, dentistas, estética e salões que resolve o problema de **faltas e no-shows** em agendamentos. O sistema envia confirmações automáticas via WhatsApp, rastreia taxas de faltas e ajuda profissionais a reduzirem prejuízos.

**Modelo de negócio**: R$97/mês por estabelecimento.

## Arquitetura

### Stack Tecnológica

**Backend:**
- **Runtime**: Node.js com TypeScript
- **Framework**: Fastify (performance superior ao Express)
- **ORM**: Prisma
- **Banco de dados**: PostgreSQL (Supabase)
- **Cache/Filas**: Redis (BullMQ para jobs agendados)
- **Auth**: JWT + refresh tokens
- **Validação**: Zod

**Frontend:**
- **Framework**: Next.js 14+ (App Router)
- **Linguagem**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand (global) + React Query/TanStack Query (server state)
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts (para dashboard de métricas)

**Infraestrutura:**
- **Deploy Backend**: Railway ou Render
- **Deploy Frontend**: Vercel
- **WhatsApp API**: Evolution API (multi-tenant, self-hosted; each User has its own instance, scanned via QR code in /configuracoes)
- **Cron/Scheduler**: BullMQ com Redis

### Estrutura de Pastas

```
saas1/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # Login, registro, JWT
│   │   │   ├── patients/       # CRUD de pacientes/clientes
│   │   │   ├── appointments/   # CRUD de agendamentos
│   │   │   ├── confirmations/  # Lógica de confirmação automática
│   │   │   ├── notifications/  # Integração WhatsApp
│   │   │   ├── dashboard/      # Métricas e relatórios
│   │   │   └── billing/        # Assinaturas e pagamentos
│   │   ├── shared/
│   │   │   ├── database/       # Prisma client, migrations
│   │   │   ├── middleware/     # Auth, rate limit, error handler
│   │   │   ├── utils/          # Helpers compartilhados
│   │   │   └── config/         # Env vars, constants
│   │   ├── jobs/               # Workers BullMQ (scheduler)
│   │   │   ├── sendConfirmation.job.ts
│   │   │   ├── sendReminder.job.ts
│   │   │   └── markNoShow.job.ts
│   │   └── server.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   │   ├── (auth)/         # Login, registro
│   │   │   ├── (dashboard)/    # Dashboard principal
│   │   │   ├── patients/       # Gestão de pacientes
│   │   │   ├── appointments/   # Agenda
│   │   │   ├── reports/        # Relatórios de faltas
│   │   │   └── settings/       # Configurações
│   │   ├── components/
│   │   │   ├── ui/             # shadcn/ui components
│   │   │   ├── forms/          # Formulários reutilizáveis
│   │   │   ├── charts/         # Componentes de gráfico
│   │   │   └── layout/         # Header, sidebar, etc.
│   │   ├── hooks/              # Custom hooks
│   │   ├── lib/                # Utils, API client, types
│   │   ├── stores/             # Zustand stores
│   │   └── styles/             # Tailwind config, globals
│   ├── public/
│   ├── package.json
│   └── tsconfig.json
├── .claude/
│   └── agents/
├── CLAUDE.md
└── README.md
```

## Modelo de Dados (Entidades Principais)

```
Tenant (Estabelecimento)
├── id, name, type (clinica|psicologo|dentista|estetica|salao)
├── phone, email, address
├── subscription_status, plan
└── settings (horário funcionamento, antecedência confirmação, etc.)

User (Profissional/Admin)
├── id, tenant_id, name, email, password_hash
├── role (admin|professional)
└── phone

Patient (Paciente/Cliente)
├── id, tenant_id, name, phone (WhatsApp), email
├── notes, created_at
└── no_show_count, total_appointments

Appointment (Agendamento)
├── id, tenant_id, patient_id, professional_id
├── date, start_time, end_time
├── status (scheduled|confirmed|cancelled|no_show|completed)
├── confirmation_sent_at, confirmed_at
└── notes, price

Notification (Log de Notificações)
├── id, appointment_id, type (confirmation|reminder|cancellation)
├── channel (whatsapp|sms|email)
├── status (pending|sent|delivered|read|failed)
├── sent_at, delivered_at
└── message_content
```

## Fluxo Principal

1. Profissional cadastra paciente (nome + WhatsApp)
2. Profissional cria agendamento
3. **24h antes**: Sistema envia confirmação automática via WhatsApp
4. Paciente responde "Sim" ou "Não"
5. Se não responde em 2h → envia lembrete
6. Sistema marca como "confirmado" ou "não confirmado"
7. Dashboard mostra taxa de faltas do mês + métricas

## Convenções de Código

### Geral
- **Idioma do código**: Inglês (variáveis, funções, classes)
- **Idioma da UI**: Português (BR)
- **TypeScript strict mode** sempre habilitado
- Usar `type` ao invés de `interface` (exceto quando extend é necessário)
- Nomes de arquivo: `kebab-case` (ex: `send-confirmation.job.ts`)
- Componentes React: `PascalCase` (ex: `AppointmentCard.tsx`)

### Backend
- Cada módulo segue a estrutura: `controller → service → repository`
- Rotas prefixadas com `/api/v1/`
- Erros padronizados com códigos HTTP corretos
- Validação de input em todas as rotas com Zod schemas
- Logs estruturados com pino (integrado ao Fastify)
- Testes com Vitest

### Frontend
- Componentes em `/components` são reutilizáveis e sem lógica de negócio
- Páginas em `/app` contêm a composição e lógica
- Server Components por padrão, Client Components só quando necessário (`"use client"`)
- Formulários sempre com React Hook Form + Zod
- API calls via TanStack Query (mutations e queries)
- Testes com Vitest + Testing Library

### Git
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Branch naming: `feat/nome-feature`, `fix/nome-bug`
- PRs com descrição clara do que foi feito

## Comandos Úteis

```bash
# Backend
cd backend && npm run dev          # Dev server
cd backend && npm run build        # Build
cd backend && npm run test         # Testes
cd backend && npx prisma migrate dev   # Migrations
cd backend && npx prisma studio    # DB GUI

# Frontend
cd frontend && npm run dev         # Dev server (porta 3000)
cd frontend && npm run build       # Build
cd frontend && npm run test        # Testes
cd frontend && npm run lint        # Lint
```

## Variáveis de Ambiente

### Backend (.env)
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=
JWT_REFRESH_SECRET=
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
PORT=3333
NODE_ENV=development
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3333/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Regras para os Agents

### backend-architect
- Sempre usar Fastify (não Express)
- Prisma como ORM (não TypeORM, não Drizzle)
- Validação com Zod em todas as rotas
- BullMQ para jobs agendados (confirmações, lembretes)
- Estrutura modular: cada feature em seu próprio módulo
- Multi-tenant: todas as queries filtradas por `tenant_id`

### frontend-developer
- Next.js App Router (não Pages Router)
- shadcn/ui como base de componentes
- TanStack Query para data fetching
- Zustand para state global mínimo
- React Hook Form para todos os formulários
- Mobile-first, responsivo sempre

### ui-designer
- Design system baseado em shadcn/ui
- Paleta profissional e clean (saúde/bem-estar)
- Priorizar usabilidade sobre beleza
- Dashboard com métricas claras e acionáveis
- Fluxos simples: máximo 3 cliques para ações principais

### code-reviewer
- Verificar multi-tenancy (vazamento de dados entre tenants)
- Verificar validação de inputs
- Verificar tratamento de erros
- Verificar segurança (SQL injection, XSS)
- Verificar performance de queries (N+1, índices)
