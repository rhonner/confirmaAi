# ConfirmaAi

Sistema de Controle de Faltas com Confirmacao Automatica via WhatsApp.

SaaS para clinicas, psicologos, dentistas, estetica e saloes que resolve o problema de faltas e no-shows em agendamentos. Envia confirmacoes automaticas via WhatsApp, rastreia taxas de faltas e ajuda profissionais a reduzirem prejuizos.

> **Para agentes/IA:** a fonte de verdade operacional é [`.context/README.md`](.context/README.md). Fluxogramas (sistema + fluxo de dev com agentes): [`fluxogramas.html`](fluxogramas.html).

## Stack

- **Framework**: Next.js 16 (App Router) com TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **ORM**: Prisma v7 com PostgreSQL
- **Auth**: NextAuth.js v4 (credentials provider, JWT)
- **State**: Zustand (global) + TanStack Query (server state)
- **Forms**: React Hook Form + Zod v4
- **Charts**: Recharts
- **WhatsApp**: Evolution API (self-hosted)
- **Scheduler**: node-cron (a cada 30 minutos)
- **Testes**: Vitest + Testing Library + Playwright

## Como Rodar

### Pre-requisitos

- Node.js 18+
- PostgreSQL (ou conta Supabase)
- Evolution API configurada (para envio de WhatsApp)

### Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variaveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 3. Rodar migrations
npx prisma migrate dev

# 4. Seed com dados de teste
npx prisma db seed

# 5. Iniciar o servidor
npm run dev
```

O app estara disponivel em `http://localhost:3000`.

### Credenciais de Teste (apos seed)

- **Email**: rhonner.matheus@gmail.com
- **Senha**: 123456
- **Clinica**: Clínica Saúde Total

## Variaveis de Ambiente

| Variavel | Descricao |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL |
| `NEXTAUTH_SECRET` | Segredo para JWT do NextAuth |
| `NEXTAUTH_URL` | URL da aplicacao (http://localhost:3000) |
| `DIRECT_URL` | Connection string PostgreSQL **direta** (Neon, host sem `-pooler`) — usada para migrations no deploy |
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | API key da Evolution API |
| `EVOLUTION_WEBHOOK_BASE_URL` | URL base p/ o webhook da Evolution (fallback: `NEXT_PUBLIC_APP_URL`) |

> ℹ️ A instância da Evolution é **uma por usuário**, criada/nomeada automaticamente e conectada via QR code em `/configuracoes` — não há nome de instância global em env.

## Configurar Evolution API

1. Instale a [Evolution API](https://github.com/EvolutionAPI/evolution-api) via Docker
2. Crie uma instancia e conecte seu WhatsApp via QR code
3. Configure o webhook da instancia para apontar para `{SUA_URL}/api/webhook/evolution/[instance]`
4. Preencha as variaveis `EVOLUTION_API_*` no `.env`

## Telas

### Login / Registro
Tela de autenticacao simples com email e senha. Registro cria a conta do profissional com nome da clinica.

### Dashboard (`/dashboard`)
- 4 cards de metricas: Total de Agendamentos, Taxa de Confirmacao, Taxa de Faltas, Prejuizo Estimado
- Grafico de barras semanal (confirmados vs faltas)
- Lista dos agendamentos do dia com status colorido

### Agenda (`/agenda`)
- Visao semanal com navegacao por semanas
- Agendamentos agrupados por dia com status visual (verde=confirmado, amarelo=pendente, vermelho=falta)
- Criar/editar agendamentos via modal

### Pacientes (`/pacientes`)
- Tabela com busca por nome/telefone
- CRUD completo via modais
- Visualizacao de historico por paciente

### Configuracoes (`/configuracoes`)
- Valor medio da consulta (para calculo de prejuizo)
- Horarios de antecedencia para confirmacao e lembrete
- Templates de mensagem customizaveis com variaveis: `{nome}`, `{data}`, `{hora}`, `{clinica}`
- Status da conexao WhatsApp

## Fluxo de Confirmacao Automatica

```
1. Profissional agenda consulta
2. 24h antes: sistema envia confirmacao via WhatsApp
   "Ola {nome}, sua consulta na {clinica} esta agendada para {data} as {hora}.
    Responda 1 para CONFIRMAR ou 2 para CANCELAR."
3. Paciente responde "1" (ou sim/ok) -> Status = CONFIRMADO
   Paciente responde "2" (ou nao/cancelar) -> Status = CANCELADO
4. Se nao responder em tempo: 6h antes envia lembrete
5. Se nao confirmar ate o horario: marca como NO_SHOW
6. Dashboard mostra metricas atualizadas
```

## Estrutura do Projeto

```
saas1/
├── prisma/
│   ├── schema.prisma          # Schema do banco (User, Patient, Appointment, etc.)
│   └── seed.ts                # Dados de teste
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login e registro
│   │   ├── (dashboard)/       # Dashboard, agenda, pacientes, config
│   │   └── api/               # API routes (CRUD, auth, webhook, dashboard)
│   ├── components/ui/         # Componentes shadcn/ui
│   ├── hooks/use-api.ts       # TanStack Query hooks
│   ├── lib/
│   │   ├── auth.ts            # NextAuth config
│   │   ├── prisma.ts          # Prisma singleton
│   │   ├── services/          # WhatsApp, scheduler, templates, webhook parser
│   │   ├── types/             # TypeScript types
│   │   └── validations/       # Zod schemas
│   └── stores/                # Zustand stores
├── tests/
│   ├── unit/                  # Testes unitarios (vitest)
│   ├── integration/           # Testes de integracao
│   └── e2e/                   # Testes E2E (playwright)
├── instrumentation.ts         # Inicializacao do scheduler
└── .env.example               # Variaveis de ambiente
```

## Comandos

```bash
npm run dev        # Dev server
npm run build      # Build de producao
npm run test       # Rodar testes
npm run lint       # Lint
npm run db:migrate # Prisma migrate
npm run db:seed    # Seed do banco
npm run db:studio  # Prisma Studio (GUI do banco)
```

## API Endpoints

| Metodo | Rota | Descricao |
|---|---|---|
| POST | /api/auth/[...nextauth] | Login/auth |
| POST | /api/auth/register | Registro |
| GET/POST | /api/patients | Listar/criar pacientes |
| GET/PUT/DELETE | /api/patients/[id] | Detalhe/editar/remover paciente |
| GET/POST | /api/appointments | Listar/criar agendamentos |
| GET/PUT/DELETE | /api/appointments/[id] | Detalhe/editar/remover agendamento |
| GET | /api/dashboard | Metricas do mes |
| GET/PUT | /api/settings | Configuracoes |
| POST | /api/webhook/evolution/[instance] | Webhook Evolution API |
