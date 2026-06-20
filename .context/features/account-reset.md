# Feature: Reset de conta Free (1× vitalício)

> Sprint 10 / fatia 2.4 (2026-06-20). Botão de "recomeçar" para contas Free que cadastraram pacientes só pra testar e travaram na **quota vitalícia** (`PatientQuotaSlot` nunca libera vaga — ver [`plan-quota.md`](plan-quota.md)). Apaga todos os pacientes do tenant e zera as vagas, **uma única vez**, e só em conta sem uso real.

## Arquivos

| Camada | Caminho |
| ------ | ------- |
| Regra (pura) | `src/lib/account/reset-eligibility.ts` (`resetEligibility`, `resetBlockMessage`) |
| Endpoint | `src/app/api/account/reset/route.ts` (`POST`) |
| Gate na UI | `src/app/api/billing/subscription/route.ts` → `canResetFreeAccount` |
| Hook | `src/hooks/use-api.ts` → `useResetAccount` (+ `Subscription.canResetFreeAccount`) |
| Componente | `src/components/settings/reset-account-card.tsx` |
| Página | `src/app/(dashboard)/configuracoes/page.tsx` (renderiza `<ResetAccountCard/>`) |
| Labels | `src/lib/audit/labels.ts` (`account.reset`, `account.reset_blocked`) |

## Regras (guardas) — `resetEligibility({ plan, appointmentCount, priorResetCount })`

1. **Só FREE** — plano pago é ilimitado, não há quota pra resetar. (`PLAN_NOT_FREE`)
2. **Zero agendamentos (QUALQUER status)** — decisão do fundador 2026-06-20: qualquer agendamento já criado (mesmo `PENDING`/`CANCELED`) bloqueia, sinal de uso real. (`HAS_APPOINTMENTS`)
3. **1× vitalício** — dedup via `AuditLog.count({ action: "account.reset", tenantUserId })`. **Sem migration** (mesmo padrão audit-based do projeto; rejeitado `User.freeResetAt`). (`ALREADY_RESET`)

Pura e testável (`tests/unit/account-reset.test.ts`); a rota faz as contagens (escopadas por `userId`) e passa os números. O mesmo helper alimenta `canResetFreeAccount` na subscription (gate da UI; backend revalida).

## Fluxo de limpeza (transação Serializable)

1. `patientQuotaSlot.deleteMany({ userId })` — **ANTES** dos pacientes (evita o `SetNull` no FK `PatientQuotaSlot.patientId`).
2. `patient.deleteMany({ userId })` — cascateia `Appointment` + `MessageLog` (`onDelete: Cascade` no schema).
3. `user.update({ patientSlotCount: 0 })`.
4. (pós-commit) audit `account.reset` com `{ patientsDeleted, slotsDeleted }`. Bloqueios auditam `account.reset_blocked` com `{ reason }`.

## Pontos sensíveis

- **Multi-tenancy**: TODO `deleteMany`/`count` filtra `userId`/`tenantUserId` da sessão. Um `deleteMany` sem filtro apagaria a base inteira — revisado.
- **Não toca** `Subscription` nem `UsageCounter` (spec só fala Patient + slot). `MessageLog` cai por cascade via `Appointment`/`Patient`.
- **Dedup vs retention**: se um dia ligar o expurgo 90d do `AuditLog` (dívida Sprint 1), a flag "1× vitalício" some → aí sim migrar pra `User.freeResetAt`. Hoje audit-based basta.
- **Duplo-clique**: limpeza é idempotente (2º `deleteMany` não acha nada); a proteção real (reset semanas depois) é o audit. Benigno.
- **UI** esconde o card fora do FREE (`useSubscription().plan`); backend revalida (defesa em profundidade). Confirmação destrutiva exige digitar `RESETAR`.

## Validação manual no browser

(a preencher na validação Chrome — golden path: FREE sem agendamentos → card aparece → digitar RESETAR → pacientes somem + badge 0/5; + caso bloqueado quando há agendamento.)

## Como estender

- **Permitir N resets**: trocar a guarda 3 por um limite/contagem, ou migrar pra `User.freeResetAt`/`freeResetCount`.
- **Relaxar critério de "uso real"**: ajustar `appointmentCount` (ex: só `CONFIRMED`) no `resetEligibility` + na subscription.
