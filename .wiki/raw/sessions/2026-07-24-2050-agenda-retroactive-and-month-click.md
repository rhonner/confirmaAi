---
type: session
date: 2026-07-24 20:50
branch: main
status: ingested
note: >
  Quarta rodada do mesmo dia (as três primeiras estão em
  2026-07-24-1526-agenda-drag-timeblocks.md). Ingerido na conversa, sem stub do
  hook. A decisão de PERMITIR SOBREPOSIÇÃO já havia sido capturada no addendum
  das 17:50 do log — aqui ela aparece só como contexto das consequências.
files_touched:
  - prisma/schema.prisma
  - prisma/migrations/20260724202407_add_appointment_retroactive/
  - src/lib/retroactive.ts
  - src/lib/services/scheduler.ts
  - src/app/api/appointments/route.ts
  - src/app/api/appointments/[id]/route.ts
  - src/app/api/integrations/google-calendar/convert/route.ts
  - src/lib/services/conflict.ts (DELETADO)
  - src/components/agenda/day-grid.tsx
  - src/components/agenda/month-view.tsx
  - src/app/(dashboard)/agenda/page.tsx
  - src/hooks/use-api.ts
  - tests/unit/retroactive.test.ts
  - tests/unit/month-view-drag.test.tsx
  - scripts/test-sprints.ts
  - .context/features/appointments.md
  - .context/features/scheduler.md
  - .context/features/agenda-day-grid.md
  - .context/features/google-calendar.md
---

# Sessão 2026-07-24 (rodada 4) — três regras novas da agenda

## Objetivo

Pedido do dono, em três frases, com uma imagem do Google Agenda anexada:

1. "Deve ser possível agendar em dias/horários que já passaram simplesmente para organização, mas que fique **flaggeado** de alguma forma."
2. "Também deve ser possível agendar mais de um cliente no mesmo horário e ele ficar **como ficaria no Google Calendar**" (imagem: 3 eventos lado a lado, dividindo a largura).
3. "A ação de clicar em cima do dia na visão Mês **não deve abrir a visão Dia**. Deve abrir o modal de agendamento."

## Duas decisões pedidas ao dono antes de codar

- **Sobreposição avisa antes?** → **Não** (igual Google). A alternativa oferecida era o mesmo modal suave do horário bloqueado; o dono preferiu zero fricção, porque atendimento simultâneo é intencional no negócio dele.
- **Como marcar o registro do passado?** → selo **"⟲ Retroativo"** (entre "Só registro" e "Histórico"), com a consequência declarada na própria pergunta: em qualquer das opções o registro fica **fora da automação**.

## Resultado

Gate verde: `tsc` · vitest **401** · `build` · `test:sprints` **166/166** (novos `RT.1`–`RT.5` + `tests/unit/retroactive.test.ts`). E2E no Chrome MCP (dev `:3001`, conta PREMIUM), dados de teste apagados ao fim.

Operacional completo — não repetido aqui — em
[`.context/features/appointments.md`](../../../.context/features/appointments.md) § Retroativo,
[`.context/features/scheduler.md`](../../../.context/features/scheduler.md) § `markNoShows` e
[`.context/features/agenda-day-grid.md`](../../../.context/features/agenda-day-grid.md).

## Decisões / aprendizados

- **O flag de retroativo é PERSISTIDO, não derivado.** `dateTime < now` na leitura colapsaria dois casos opostos: *"lancei no passado de propósito"* (registro histórico, não é falta) e *"marquei para o futuro e o horário passou"* (é exatamente a falta que o produto mede). O flag guarda a **intenção no momento da escrita**. Ver [[persist-intent-not-elapsed-time]].
- **O selo só significa algo porque o cron filtra.** `markNoShows` e a query de confirmação ganharam `retroactive: false`. Sem isso o registro histórico viraria `NO_SHOW` em ≤ 30 min e corromperia a taxa de faltas — o mesmo raciocínio do [[external-event-firewall]], mas com **flag na tabela de domínio** em vez de tabela separada: aqui a linha **é** de domínio (aparece na agenda, conta métrica por status, é editável), então a tabela separada não servia.
- **Quem decide o flag é o servidor.** Regra única `isRetroactive()` (`src/lib/retroactive.ts`) usada no POST, no PUT (só quando `dateTime` é reescrito) e no `/convert`; o campo **não** existe no schema Zod — cliente não manda. Reversível: mover para o futuro limpa o flag.
- **Permitir sobreposição matou o guard e o arquivo.** `findConflictingAppointment` e os `400 "Conflito com agendamento de X"` saíram das três rotas e `src/lib/services/conflict.ts` foi **deletado** (capturado no addendum das 17:50). Efeito colateral bem-vindo: a corrida de duplo-agendamento entre dois `/convert` deixou de ser bug — o resultado passou a ser válido ([[idempotent-link-under-race]]).
- **Relaxar uma regra de domínio realoca o orçamento de layout.** Com sobreposição permitida, o card de 30 min (28 px = **uma** linha) dividido em 3 colunas passou a mostrar `10:00 · Pendente` e **esconder o nome do paciente** — que estava na 2ª linha, cortada. O layout tinha sido desenhado quando exclusividade era invariante. Fix: `compact = height < 40` move o nome para a linha do horário. A lição: ao remover uma restrição do domínio, revisitar as UIs que a assumiam como garantia.
- **Mudar o significado de um clique exige realocar o antigo.** A célula do Mês passou a **criar**; quem abre a visão Dia agora é o **número do dia** (e o "+N mais"). O clique-fantasma pós-arraste ficou mais caro — antes um falso positivo drilava (inofensivo), agora abriria diálogo de criação. Ver [[drag-vs-click-decide-by-value-change]].
- **Check negativo por grep no fonte precisa ignorar comentários.** O `RT.3` afirma que nenhuma rota volta a rejeitar conflito — e falhou na 1ª execução porque os **próprios comentários** que explicam a remoção citam a mensagem antiga (`"Conflito com agendamento"`). Corrigido com um `stripComments` antes das asserções negativas. Ver [[regression-test-assert-the-predicate]].
- **Firewall do cron NÃO foi testado rodando o cron.** `runSchedulerJobs()` dispara também as notificações de billing (e-mail real para endereço real). Coberto por `RT.1` (invariante no fonte) + `RT.2` (o mesmo filtro rodando contra o DB real, com um par retroativo/normal no passado).
- **Client Prisma em memória não vê coluna nova.** Depois da migration, a API devolvia o agendamento **sem** o campo `retroactive` até reiniciar o dev `:3001` — segunda vez no mesmo dia (a primeira foi no `TimeBlock`).

## Pendências registradas

- **Não commitado** (o dono versiona via `gh`); agora com **duas** migrations só em DEV: `20260724160036_add_time_block` e `20260724202407_add_appointment_retroactive` — em prod o `vercel-build` aplica ([[migrations-not-auto-applied]]).
- Métricas do dashboard continuam contando **por status**: um retroativo marcado "Faltou" à mão conta como falta (é uma falta real, só registrada depois). Nada a fazer — decisão consciente.
- Débito herdado: bloqueio ainda não renderiza no modo Mês.
