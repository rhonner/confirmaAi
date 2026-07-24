# Orquestrador de Contexto — ConfirmaAí

> **Leia este arquivo SEMPRE antes de desenvolver, refatorar ou debugar qualquer funcionalidade.**
> Ele é o ponto de entrada (orquestrador) para todo o contexto registrado do projeto.

## Como funciona o orquestrador

Toda funcionalidade do sistema é registrada como um **arquivo `.md` em `.context/features/`**, descrevendo:

- O que a feature faz (regras de negócio)
- Quais arquivos a compõem (rotas, services, schemas, componentes, hooks, jobs)
- Quais fluxos cruzam outras features (links para `flows/`)
- Pontos sensíveis (multi-tenancy, segurança, side effects, race conditions)
- Como estender (passos padrão para adicionar campos/regras/endpoints)

Quando o usuário pedir para desenvolver, alterar ou debugar algo:

1. **Identifique a(s) feature(s) afetada(s)** e leia o arquivo correspondente em `.context/features/`.
2. Se a tarefa for nova (não há feature registrada), **crie um novo arquivo** em `.context/features/<nome>.md` usando `.context/features/_TEMPLATE.md` e atualize o índice abaixo.
3. Se a tarefa alterar uma feature existente de forma estrutural (novo endpoint, nova entidade, mudança de fluxo), **atualize o arquivo da feature** ao final do trabalho.

> Memória do agente (`~/.claude/.../memory`) é para preferências do usuário. **`.context/` é a fonte de verdade do projeto.** Quando houver conflito, o `.context/` vence.
>
> Existe também a **wiki** em [`.wiki/`](../.wiki/README.md) — base de conhecimento sintetizado e cumulativo (decisões com seu “porquê”, padrões descobertos, sumários cruzados de sessões). Ela é **complementar**, não substitui o `.context/`. Regra: regras operacionais de feature → `.context/`; conhecimento de bastidor que acumula a cada sessão → `.wiki/`. O fluxo de ingestão é automático via hooks `SessionStart`/`SessionEnd` (ver `.wiki/AGENTS.md`).

---

## Stack (resumo executivo)

| Camada            | Tecnologia                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| Framework         | **Next.js 16 (App Router) — monolito**, TypeScript strict, React 19     |
| Auth              | NextAuth v4 (Credentials provider, JWT)                                 |
| ORM               | Prisma v7 (`@prisma/adapter-pg` obrigatório) — output em `src/generated/prisma` |
| DB                | PostgreSQL                                                              |
| Validação         | Zod v4 (use `.issues`, não `.errors`)                                   |
| UI                | Tailwind v4 + shadcn/ui + radix-ui + sonner (toasts) + lucide-react     |
| Server state      | TanStack Query v5                                                       |
| Client state      | Zustand v5                                                              |
| Forms             | React Hook Form + `@hookform/resolvers`                                 |
| Charts            | Recharts                                                                |
| WhatsApp          | Evolution API self-hosted, **uma instância por usuário** (multi-tenant) |
| Scheduler         | `node-cron` iniciado via `instrumentation.ts` (a cada 30 min)           |
| Testes            | Vitest (unit + integration) + Playwright (E2E)                          |

> **Importante:** o `CLAUDE.md` raiz descreve a arquitetura *aspiracional* (Fastify + monorepo backend/frontend). **A realidade do código é monolito Next.js**. Use o `.context/` como guia operacional; o `CLAUDE.md` como guia de princípios (multi-tenancy, validação Zod, modular por feature).

---

## Índice de features registradas

| Feature              | Arquivo                                              | Resumo                                                             |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Autenticação         | [features/auth.md](features/auth.md)                 | Login, registro, sessão NextAuth, helpers de auth                  |
| Pacientes            | [features/patients.md](features/patients.md)         | CRUD de pacientes, paginação, busca, export CSV + **perfil (nascimento como data civil em string, sexo e identidade de gênero separados, autodescrição redigida na auditoria)** |
| Agendamentos         | [features/appointments.md](features/appointments.md) | CRUD, status, export CSV, **grade Dia arrastável**. ⚠️ **sobreposição permitida** (guard de conflito removido em 2026-07-24) e **agendar no passado permitido** como `retroactive` — fora da automação (sem WhatsApp/no-show) |
| Arraste na agenda    | [features/agenda-day-grid.md](features/agenda-day-grid.md) | Dia = grade de horas estilo Google Agenda (arrastar p/ mover o **horário** + alça p/ estender; snap 15min, colunas de sobreposição). Mês = arrastar chip entre **dias** mantendo o horário (`moveKeepingTime`, hit-test `data-month-day`). Pointer Events nos dois; Semana inalterada. Inclui a armadilha do `pending` × structural sharing do React Query |
| Horário bloqueado    | [features/time-blocks.md](features/time-blocks.md)   | `TimeBlock` (sem paciente): almoço/reunião/férias. Firewall (scheduler não vê); espelho no Google (evento sem convidados); aviso SUAVE ao agendar em cima |
| Dashboard            | [features/dashboard.md](features/dashboard.md)       | Métricas agregadas, gráfico semanal, prejuízo estimado, **card de aniversariantes do dia** |
| Configurações        | [features/settings.md](features/settings.md)         | Mensagens, antecedência, valor médio, nome da clínica              |
| WhatsApp (Evolution) | [features/whatsapp.md](features/whatsapp.md)         | Conexão, QR code, status, desconexão por usuário                   |
| Webhook Evolution    | [features/webhook-evolution.md](features/webhook-evolution.md) | Recebe estados de conexão e respostas dos pacientes      |
| Scheduler / Cron     | [features/scheduler.md](features/scheduler.md)       | Envio de confirmações, auto-cancelamento no deadline e marcação de no-show. ⚠️ ignora `retroactive: true` (invariante) |
| Confirmação por Link | [features/confirmation-link.md](features/confirmation-link.md) | Paciente confirma/cancela por LINK (página + botão, POST) em vez de "1/2"; auto-cancela no deadline. Token HMAC stateless; GET read-only (anti-prefetch) |
| Onboarding + Terminologia | [features/onboarding.md](features/onboarding.md) | Wizard escolhe o ramo (BusinessType) no 1º login → terminologia da UI (Paciente vs Cliente). `businessType`/`onboardingCompletedAt` no User + sessão. ⚠️ refac de rótulos PARCIAL |
| Auditoria            | [features/audit.md](features/audit.md)               | Trilha de mutações (Prisma extension) + eventos de domínio (login, msg, webhook) |
| Billing               | [features/billing.md](features/billing.md)        | Cobrança via provider (Asaas/Mock), checkout Pix/cartão, webhook idempotente com HMAC, lifecycle cron, portal + cancelar |
| Plan Quota           | [features/plan-quota.md](features/plan-quota.md)     | Vagas vitalícias de paciente (Free=5), CPF como identifier primário, anti-fraude por slot ledger |
| Observabilidade      | [features/observability.md](features/observability.md) | `GET /api/health` (200/503) agrega cron/billing/evolution/db; captura de erros (console + Sentry opt-in via `SENTRY_DSN`); runbook |
| Painel Admin         | [features/admin.md](features/admin.md)               | `/admin/audit` (allowlist `ADMIN_EMAILS`, gate em layout+API); métricas cross-tenant (WhatsApp %, pagantes, fraude) + auditoria. Atividade do user em `/configuracoes/atividade` |
| Reset de conta Free  | [features/account-reset.md](features/account-reset.md) | `POST /api/account/reset` (1× vitalício): apaga Patient + PatientQuotaSlot e zera quota; guardas FREE + 0 agendamentos + dedup por audit |
| LGPD & Conta         | [features/lgpd-account.md](features/lgpd-account.md) | Termos/Privacidade + aceite no signup, `GET /api/account/export`, `DELETE /api/account` (soft delete + anonimização, bloqueia login) + purga 30d no cron |
| Google Calendar      | [features/google-calendar.md](features/google-calendar.md) | Conexão OAuth por tenant (PREMIUM). Firewall nos 2 sentidos: evento do Google nunca vira `Appointment` por sync; espelho criado por nós nunca vira bloco promovível. **Fase A** (OAuth PKCE + overlay read-only), **Fase B** (promoção manual evento→agendamento) e **Fase C** (espelhar `Appointment`→Google via `mirror.ts` + escopo `calendar.events` write + tag anti-loop + `after()` best-effort) completas e validadas E2E com credencial real. ⛳ GA bloqueado por **verificação OAuth do escopo de escrita**; sync contínuo Google→app (B2) não iniciado |

## Índice de fluxos cruzados

| Fluxo                         | Arquivo                                                  |
| ----------------------------- | -------------------------------------------------------- |
| Confirmação automática (E2E)  | [flows/confirmation-flow.md](flows/confirmation-flow.md) |
| Multi-tenancy (isolamento)    | [flows/multi-tenancy.md](flows/multi-tenancy.md)         |

## Planos e roadmaps

| Plano                                | Arquivo                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------ |
| **Monetização v2 — pacientes únicos** (vigente) | [plans/monetization-v2.md](plans/monetization-v2.md)                 |
| Monetização + Auditoria (roadmap antigo)    | [plans/billing-and-audit-roadmap.md](plans/billing-and-audit-roadmap.md) |
| Deployment status (stop & resume)    | [plans/deployment-status.md](plans/deployment-status.md)                 |
| **Go-to-market — checklist final** (vigente) | [plans/go-to-market-checklist.md](plans/go-to-market-checklist.md)  |

## Fluxogramas visuais

[`../fluxogramas.html`](../fluxogramas.html) — dois fluxogramas (abrir no navegador), úteis como onboarding:

1. **Como o sistema funciona** (swimlanes Profissional × Sistema × Paciente): criar conta → verificar e-mail → configurar (antecedências 24h/6h, templates) → conectar WhatsApp (QR) → cadastrar pacientes (FREE = 5 vagas) → criar agendamento (PENDING) → cron 30 min envia confirmação T-24h → paciente responde 1/2 (CONFIRMED/CANCELED) ou não responde (lembrete T-6h / NO_SHOW) → dashboard de faltas.
2. **Como codar com os agentes**: ler `.context/README.md` + feature → plano → Prisma/migration → contrato `{ data }` + Zod → backend (filtro `userId`) ↔ code-review → frontend/UX → **definição de feito** (tsc/vitest/build/test:sprints) → **teste no Chrome (MCP)** → deploy Vercel (migration via `DIRECT_URL`) → curadoria `.wiki`/`.context` → commit via `gh`. Os loops de "reprovado → volta e corrige" são as setas tracejadas.

---

## Definição de "feito" — checklist obrigatório

> **Não declare uma sprint, feature ou fix concluída sem rodar TUDO abaixo.** Sem exceção.

1. **`npx tsc --noEmit`** — sem erros de tipo.
2. **`TZ=UTC npx vitest run`** — 100% verde.
3. **`npm run build`** — build de produção limpo.
4. **`npm run test:sprints`** — checklist E2E no DB local com 100% pass (script versionado em `scripts/test-sprints.ts`; **adicionar checks da nova sprint** sempre que fechar uma). ⚠️ **Rodar ISOLADO** — concorrente com `vitest` (que tem testes de integração no mesmo Postgres local) dá erro de Prisma por contenção/limpeza de dados; não é regressão.
5. **Teste manual no Chrome via MCP** — para qualquer mudança que toque UI, dev server + clicar pelo fluxo crítico do usuário **de verdade**, com screenshots como evidência. Cobrir golden path + 1-2 edge cases. NÃO confiar só em "componente existe + Playwright básico de renderização" — isso prova compilação, não comportamento.
6. **Documentar a validação** — em `.context/features/<feature>.md` adicionar/atualizar seção "Validação manual no browser" com os passos confirmados (vira artefato de regressão para a próxima sprint).
7. **Helpers de toggle de estado** — para fluxos dependentes de estado (ex: plano FREE vs PRO), criar helper em `scripts/` que alterna rápido em dev (ver `scripts/toggle-admin-plan.ts`). Sempre reverter ao estado original (PRO no caso do `rhonner.matheus@gmail.com`) ao fim do teste.

---

## Convenções não-óbvias (precisa ler antes de codar)

1. **Multi-tenancy por `userId`**: NÃO existe `tenant_id` separado. Cada `User` é um tenant. Toda query Prisma DEVE filtrar por `userId: session.user.id`.
2. **Next.js 16 dynamic params**: `params` é `Promise` — sempre `await params`. Tipo: `{ params: Promise<{ id: string }> }`.
3. **Resposta de API padronizada**: tudo retorna `{ data, error?, message? }` (`ApiResponse<T>` em `src/lib/types/api.ts`). Frontend usa `fetchApi<T>()` que desempacota `.data`.
4. **Prisma client gerado em `src/generated/prisma`** — importe de `@/generated/prisma/client`, não de `@prisma/client`.
5. **Adapter Postgres**: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Sem isso, Prisma v7 não roda.
6. **Telefones**: formato `+55XXXXXXXXXXX` (10 ou 11 dígitos após `+55`). Helpers em `src/lib/phone.ts`. Evolution API recebe só dígitos (`digitsOnly`).
7. **Status do agendamento**: `PENDING | CONFIRMED | NOT_CONFIRMED | CANCELED | NO_SHOW`. `NOT_CONFIRMED` é setado manualmente; `NO_SHOW` é setado pelo cron quando passa do horário e ainda está `PENDING`.
8. **Sobreposição de agendamentos é PERMITIDA** (decisão do dono, 2026-07-24): não existe checagem de conflito agendamento×agendamento. `findConflictingAppointment` e `src/lib/services/conflict.ts` foram **removidos**. O único aviso de sobreposição é o de **horário bloqueado** (`TimeBlock`) — e ele é **suave** ("Agendar mesmo assim"). Ver `features/appointments.md` e `features/time-blocks.md`.
9. **Datas como string `yyyy-MM-dd`**: tratadas como dia local completo (não UTC) na rota `GET /api/appointments`.
10. **Mensagens template**: placeholders `{nome}`, `{data}`, `{hora}`, `{clinica}` (português, lowercase). Renderização em `src/lib/services/message-template.ts`.
11. **Idioma**: código em **inglês**, UI/mensagens/erros em **português (BR)**.
12. **Arquivos**: `kebab-case`. Componentes React: `PascalCase`. Rotas API: `src/app/api/<recurso>/route.ts`.

---

## Comandos essenciais

```bash
npm run dev              # Next dev (porta 3000)
npm run build            # Build de produção
npm run test             # Vitest unit
npm run test:e2e         # Playwright
npm run db:migrate       # Prisma migrate dev
npm run db:studio        # Prisma Studio
npm run db:seed          # Seed (rhonner.matheus@gmail.com / 123456)
```

## Variáveis de ambiente

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
EVOLUTION_API_URL=...
EVOLUTION_API_KEY=...
EVOLUTION_WEBHOOK_BASE_URL=...        # ou NEXT_PUBLIC_APP_URL como fallback
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Como registrar uma nova feature

1. Copie `.context/features/_TEMPLATE.md` para `.context/features/<minha-feature>.md`.
2. Preencha as seções (resumo, arquivos, regras, fluxos, pontos sensíveis, como estender).
3. Adicione uma linha no índice acima ("Índice de features registradas").
4. Se a feature toca outra existente, atualize o arquivo dela com o link cruzado.
