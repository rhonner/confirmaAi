# Feature: Dashboard

> Métricas agregadas do usuário (clínica): total de agendamentos no período, taxa de confirmação, no-show, prejuízo estimado e gráfico semanal.

## Arquivos que compõem a feature

| Camada           | Caminho                                            |
| ---------------- | -------------------------------------------------- |
| Rota API         | `src/app/api/dashboard/route.ts`                   |
| Hook React Query | `src/hooks/use-api.ts` → `useDashboard(range)`     |
| Página           | `src/app/(dashboard)/dashboard/page.tsx`           |
| Componente       | `src/components/dashboard/onboarding-banner.tsx`   |
| Tipo             | `DashboardStats` em `src/lib/types/api.ts`         |

## Regras de negócio

- **Range**: `7d`, `30d`, ou `month` (default = mês corrente via `startOfMonth`/`endOfMonth`).
- **Métricas calculadas**:
  - `totalAppointments` = todos no período do usuário.
  - `confirmed` = status `CONFIRMED`.
  - `notConfirmed` = `NOT_CONFIRMED` + `PENDING` somados.
  - `noShow` = status `NO_SHOW`.
  - `canceled` = status `CANCELED`.
  - `confirmationRate` = `(confirmed / total) * 100`, 1 casa decimal.
  - `noShowRate` = `(noShow / total) * 100`, 1 casa decimal.
  - `estimatedLoss` = `noShow * user.avgAppointmentValue`, 2 casas decimais.
- **`weeklyData`**: array por semana do período. Cada item: `{ week, total, noShow, confirmed }`. Semanas calculadas com `eachWeekOfInterval(..., { weekStartsOn: 0 })` (domingo). Label `"Sem d/MM"` em pt-BR.

## Endpoints

| Método | Path             | Query        | Resposta                          |
| ------ | ---------------- | ------------ | --------------------------------- |
| GET    | `/api/dashboard` | `?range=`    | `ApiResponse<DashboardStats>`     |

## Pontos sensíveis

- **Performance**: usa `Promise.all` com 6 `count()` queries + 1 `findMany` (apenas `status` e `dateTime`) para o gráfico semanal. Evita carregar todos os campos.
- **`user.avgAppointmentValue`** é `Decimal` no Prisma — convertido com `Number(...)`. Para valores grandes pode perder precisão, mas para R$ é aceitável.
- **Multi-tenancy**: filtro `userId: session.user.id` em todas as queries.
- **Onboarding banner**: mostrado se usuário ainda não conectou WhatsApp / não tem pacientes / não tem agendamentos (lógica em `onboarding-banner.tsx`).

## Como estender

- **Nova métrica agregada**: adicione contador em `Promise.all`, atualize `DashboardStats` em `src/lib/types/api.ts` e renderize na página.
- **Novo range** (ex: `90d`, `year`): adicionar `else if` ao parsing de `range` e novo botão na UI. Considerar custo do `findMany` para janelas longas.
- **Quebra por status no chart**: `weeklyData` já filtra; adicionar nova chave (ex: `pending`) e atualizar `<Bar>` do Recharts.
