# ConfirmaAí - Sistema de Controle de Faltas + Confirmação Automática

> ## ⚡ Orquestrador de contexto — LEIA ANTES DE QUALQUER TAREFA
>
> Antes de desenvolver, alterar ou debugar qualquer coisa, **leia [`.context/README.md`](.context/README.md)**.
> É o índice mestre de todas as features registradas (em `.context/features/`) e fluxos cruzados (em `.context/flows/`).
>
> Regra do orquestrador:
> - Toda nova funcionalidade DEVE ser registrada em `.context/features/<nome>.md` (use `_TEMPLATE.md`).
> - Alterações estruturais em features existentes DEVEM atualizar o `.md` correspondente.
> - Em caso de conflito entre `CLAUDE.md` e `.context/`, o `.context/` é a fonte de verdade operacional.
>
> ⚠️ **As seções _Stack Tecnológica_, _Estrutura de Pastas_ e _Modelo de Dados_ abaixo são ASPIRACIONAIS e não refletem o código** (não há Fastify, Redis/BullMQ, `backend/`+`frontend/`, nem `tenant_id`). Realidade: monolito **Next.js 16**, **node-cron**, multi-tenancy por **`userId`**, rotas em `src/app/api` sem `/v1`. Detalhes na seção "⚠️ REALIDADE DO CÓDIGO" abaixo e em [`.context/README.md`](.context/README.md). Use essas três seções só para princípios (multi-tenancy, validação Zod, modular por feature) — as demais (_Fluxo Principal_, _Convenções de Código_, _Comandos Úteis_, _Variáveis de Ambiente_, _Regras para os Agents_) foram conferidas contra o código em **2026-07-24** e estão corretas.

## Sobre o Projeto

SaaS para clínicas, psicólogos, dentistas, estética e salões que resolve o problema de **faltas e no-shows** em agendamentos. O sistema envia confirmações automáticas via WhatsApp, rastreia taxas de faltas e ajuda profissionais a reduzirem prejuízos.

**Modelo de negócio**: R$97/mês por estabelecimento.

## Arquitetura

> ## ⚠️ REALIDADE DO CÓDIGO ≠ stack aspiracional abaixo
>
> A “Stack Tecnológica” e a “Estrutura de Pastas” descritas nesta seção são **aspiracionais/legadas** (Fastify + monorepo `backend/`+`frontend/` + Redis/BullMQ + Supabase). **O código real é outro.** Antes de codar, a fonte da verdade operacional é **[`.context/README.md`](.context/README.md)**.
>
> **Stack real (resumo):**
> - **Monolito Next.js 16 (App Router)**, TypeScript strict, React 19 — **um único `src/`** (não há pasta `backend/`). Rotas de API = `src/app/api/<recurso>/route.ts`.
> - **Auth: NextAuth v4** (Credentials, JWT) — não há refresh tokens próprios.
> - **ORM: Prisma v7** com `@prisma/adapter-pg` **obrigatório**; client gerado em `src/generated/prisma` → importe de `@/generated/prisma/client`.
> - **DB: PostgreSQL** (Neon em prod — atenção a `DATABASE_URL` pooled vs `DIRECT_URL` para migrations).
> - **Scheduler: `node-cron`** iniciado via `instrumentation.ts` (a cada 30 min) — **não** há Redis/BullMQ.
> - **UI: Tailwind v4 + shadcn/ui**; server state TanStack Query v5; client state Zustand v5; forms RHF; charts Recharts.
> - **Deploy: Vercel** (front+API juntos).
>
> **Convenções não-óbvias que mais quebram IA:** multi-tenancy por `userId` (cada `User` é um tenant; não existe `tenant_id`); `params` é `Promise` no Next 16 (sempre `await params`); toda resposta de API é `{ data }` (`ApiResponse<T>`, desempacotado por `fetchApi<T>()`); Zod v4 usa `.issues`. A lista completa está em `.context/README.md`.
>
> **🗺️ Fluxogramas visuais:** abra [`fluxogramas.html`](fluxogramas.html) no navegador — (1) como o **sistema** funciona (conta → configurar → WhatsApp → agenda → confirmação automática → no-show → dashboard) e (2) como **codar com os agentes** (ler `.context` → plano → backend/frontend → definição de feito + teste no Chrome MCP → deploy → curadoria `.wiki`).

### Stack Tecnológica

> ⚠️ Seção aspiracional — ver “Stack real” acima e `.context/README.md`.

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
3. **24h antes** (`confirmationHoursBefore`, default 24): Sistema envia confirmação automática via WhatsApp
4. Paciente confirma/cancela — por **link** (página + botão) ou respondendo no chat (`1`/`sim`/`ok` · `2`/`não`)
5. **6h antes** (`reminderHoursBefore`, default 6): se ainda não respondeu → envia lembrete
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
- Cada rota é um `src/app/api/<recurso>/route.ts` (Route Handler); lógica de negócio em `src/lib/services/`
- Rotas **sem prefixo de versão** — é `/api/<recurso>`, não `/api/v1/`
- Erros padronizados com códigos HTTP corretos (`unauthorizedResponse`/`serverErrorResponse` em `src/lib/auth-helpers.ts`)
- Validação de input em todas as rotas com Zod schemas
- Erros capturados via `captureError` (`src/lib/observability/index.ts` — console + Sentry opt-in); não há pino
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

> É **monolito**: tudo roda da raiz. Não existe `cd backend`/`cd frontend`.

```bash
npm run dev              # Next dev (porta 3000)
npm run build            # Build de produção
npm run test             # Vitest unit + integração
npm run test:e2e         # Playwright
npm run test:sprints     # Checklist E2E no DB local (rodar ISOLADO do vitest)
npm run lint             # ESLint
npm run db:migrate       # prisma migrate dev
npm run db:studio        # Prisma Studio
npm run db:seed          # Seed (rhonner.matheus@gmail.com / 123456)
```

Lista canônica e atualizada: [`.context/README.md`](.context/README.md) → "Comandos essenciais".

## Variáveis de Ambiente

Um único `.env` na raiz (não há split backend/frontend). **Não** existem `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT` nem `NEXT_PUBLIC_API_URL` — a auth é NextAuth (`NEXTAUTH_SECRET`) e a API é interna ao Next.

O contrato de referência é [`.env.example`](.env.example); o conjunto **realmente consumido** pelo código é:

```
DATABASE_URL  DIRECT_URL                      # Postgres (pooled) + direct p/ migrations
NEXTAUTH_SECRET  NEXTAUTH_URL                 # NextAuth
NEXT_PUBLIC_APP_URL                           # base pública
EVOLUTION_API_URL  EVOLUTION_API_KEY          # WhatsApp
EVOLUTION_WEBHOOK_BASE_URL  EVOLUTION_WEBHOOK_SECRET
BILLING_PROVIDER  ASAAS_API_URL  ASAAS_API_KEY
ASAAS_PRO_PLAN_ID  ASAAS_PREMIUM_PLAN_ID  ASAAS_WEBHOOK_SECRET
GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET        # Google Calendar (PREMIUM)
GOOGLE_OAUTH_REDIRECT_URI  GCAL_TOKEN_ENC_KEY
CPF_HASH_PEPPER  CRON_SECRET  ADMIN_EMAILS
SENTRY_DSN  RESEND_API_KEY  PIX_QR_TTL_SECONDS
NEXT_PUBLIC_RECAPTCHA_SITE_KEY  RECAPTCHA_SECRET_KEY
```

## Regras para os Agents

### backend-architect
- Route Handlers do Next.js App Router (`src/app/api/<recurso>/route.ts`) — não há Fastify nem Express
- Prisma como ORM (não TypeORM, não Drizzle) — v7 **exige** `@prisma/adapter-pg`, client em `@/generated/prisma/client`
- Validação com Zod em todas as rotas (Zod v4: `.issues`, não `.errors`)
- `node-cron` para jobs agendados (confirmações, lembretes), iniciado por `instrumentation.ts` a cada 30 min — não há BullMQ/Redis
- Estrutura modular: cada feature em seu próprio módulo (`src/lib/services/<feature>`)
- Multi-tenant: **não existe `tenant_id`** — cada `User` é um tenant; toda query Prisma filtra por `userId: session.user.id`

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
