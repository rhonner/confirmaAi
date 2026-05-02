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
| Pacientes            | [features/patients.md](features/patients.md)         | CRUD de pacientes, paginação, busca, export CSV                    |
| Agendamentos         | [features/appointments.md](features/appointments.md) | CRUD, detecção de conflitos, status, export CSV                    |
| Dashboard            | [features/dashboard.md](features/dashboard.md)       | Métricas agregadas, gráfico semanal, prejuízo estimado             |
| Configurações        | [features/settings.md](features/settings.md)         | Mensagens, antecedência, valor médio, nome da clínica              |
| WhatsApp (Evolution) | [features/whatsapp.md](features/whatsapp.md)         | Conexão, QR code, status, desconexão por usuário                   |
| Webhook Evolution    | [features/webhook-evolution.md](features/webhook-evolution.md) | Recebe estados de conexão e respostas dos pacientes      |
| Scheduler / Cron     | [features/scheduler.md](features/scheduler.md)       | Envio de confirmações, lembretes e marcação de no-show             |

## Índice de fluxos cruzados

| Fluxo                         | Arquivo                                                  |
| ----------------------------- | -------------------------------------------------------- |
| Confirmação automática (E2E)  | [flows/confirmation-flow.md](flows/confirmation-flow.md) |
| Multi-tenancy (isolamento)    | [flows/multi-tenancy.md](flows/multi-tenancy.md)         |

---

## Convenções não-óbvias (precisa ler antes de codar)

1. **Multi-tenancy por `userId`**: NÃO existe `tenant_id` separado. Cada `User` é um tenant. Toda query Prisma DEVE filtrar por `userId: session.user.id`.
2. **Next.js 16 dynamic params**: `params` é `Promise` — sempre `await params`. Tipo: `{ params: Promise<{ id: string }> }`.
3. **Resposta de API padronizada**: tudo retorna `{ data, error?, message? }` (`ApiResponse<T>` em `src/lib/types/api.ts`). Frontend usa `fetchApi<T>()` que desempacota `.data`.
4. **Prisma client gerado em `src/generated/prisma`** — importe de `@/generated/prisma/client`, não de `@prisma/client`.
5. **Adapter Postgres**: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Sem isso, Prisma v7 não roda.
6. **Telefones**: formato `+55XXXXXXXXXXX` (10 ou 11 dígitos após `+55`). Helpers em `src/lib/phone.ts`. Evolution API recebe só dígitos (`digitsOnly`).
7. **Status do agendamento**: `PENDING | CONFIRMED | NOT_CONFIRMED | CANCELED | NO_SHOW`. `NOT_CONFIRMED` é setado manualmente; `NO_SHOW` é setado pelo cron quando passa do horário e ainda está `PENDING`.
8. **Conflitos**: `findConflictingAppointment` em `src/lib/services/conflict.ts` — overlap `[start, end)`, ignorando `CANCELED`/`NO_SHOW`.
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
npm run db:seed          # Seed (admin@teste.com / 123456)
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
