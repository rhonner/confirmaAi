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
- **Timezone**: boundaries (`startOfMonth`/`endOfMonth`/`endOfWeek`) e label da semana são computados em `America/Sao_Paulo` via `toAppTz`/`fromAppTz`/`formatInTimeZone` de `@/lib/timezone`. Sem isso, em runtime UTC (Vercel) as semanas e o filtro do mês saem 3h adiantados.

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

## Card "Aniversariantes de hoje" (2026-07-24)

Pedido do dono: *"o aniversariantes é somente um card gráfico na dashboard ou em algum
lugar de fácil visualização no início"*.

- **Onde**: topo do dashboard, largura total, logo depois do `OnboardingBanner` —
  **antes** das métricas. `src/components/dashboard/birthdays-card.tsx`.
- **Só aparece quando há alguém** (hoje OU nos próximos 7 dias). Sem ninguém → o card
  não é renderizado (dashboard não ganha card morto no topo).
- **Dados**: `GET /api/dashboard` devolve `birthdays: { today[], upcoming[] }`. "Hoje"
  vem de `todayIsoInAppTz()` — com `new Date().getDate()` no runtime UTC o card viraria
  de dia às 21:00 BRT (mesma classe do bug de fuso desta feature).
- **Query**: filtra por PREFIXO de mês (`birthDate: { contains: "-MM-" }`, no máx. 2
  meses na janela) e o casamento exato de dia — incluindo **29/02 → 28/02** em ano não
  bissexto — fica no helper puro `splitBirthdays`, não em SQL.
- **Ação**: link `wa.me` com a mensagem pronta (o dono revisa e envia). **Nada é enviado
  automaticamente**: cota de mensagem existe para prevenir falta (dinheiro), e parabéns
  automático é marketing — risco de bloqueio do número.
- Terminologia (Paciente/Cliente) vem do hook, nunca hardcodada.
- Checks `PF.5`/`PF.6`; validado no Chrome (card com aniversariante de hoje + próximos,
  e desaparecendo ao limpar as datas).
