---
title: Quota ledger com slot vitalício
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [billing, quota, anti-fraud, ledger]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
related:
  - .context/features/plan-quota.md
  - .context/plans/monetization-v2.md
status: stable
---

> Pattern para limites por capacidade que **não podem ser burlados pelo loop "criar → deletar → criar"**. Usado pra impor 5 pacientes únicos vitalícios no plano Free.

## Problema

`SELECT count(*) FROM "Patient" WHERE userId=$1 < 5` é trivial de burlar: cadastra → deleta → cadastra → deleta. Limite efetivo: ∞.

## Solução

Tabela append-only `PatientQuotaSlot` que registra cada identificador único que **alguma vez** ocupou vaga:

```prisma
model PatientQuotaSlot {
  id             String         @id @default(cuid())
  userId         String
  identifierType IdentifierType   // CPF | PHONE
  identifierHash String           // sha256 com namespace + pepper
  patientId      String?  @unique // null se paciente foi deletado
  firstSeenAt    DateTime @default(now())
  @@unique([userId, identifierHash])
}
```

## Invariantes

1. **Slot nunca é deletado automaticamente.** `Patient` deletado → `slot.patientId = null` (órfão).
2. **Recriar paciente com mesmo CPF/phone reusa slot órfão** (não consome nova vaga).
3. **Quota check** = `count(slots WHERE userId)`. Não `count(Patient)`.
4. **Reserva atômica** dentro de `prisma.$transaction({ isolationLevel: "Serializable" })` — evita race no 5º/6º slot.

## Algoritmo de reserva

```
1. Match qualquer hash conhecido (cpf E phone) em slots do tenant
2. Match com patientId ≠ null e ≠ novo → conflito (paciente já existe)
3. Match com patientId = null → reusa (atribui patientId)
4. Sem match → check quota → cria slot novo
```

Reuso é generoso (matches em CPF *ou* phone) — usuário não é punido por completar identificação depois (`attachCpfToExistingSlot` promove slot PHONE → CPF).

## Counter desnormalizado

`User.patientSlotCount` é mantido em sync via increment atômico no mesmo tx. Usado pra UI rápida (UsageBadge) sem `count()` em cada render. Drift teórico → backfill script `scripts/backfill-quota-slots.ts` reconcilia.

## Trade-offs

| Vantagem | Custo |
| -------- | ----- |
| Anti-fraude forte | Confunde usuário ("apaguei, por que ainda conta?") — mitigado em UI com tooltip |
| Não precisa Redis/lock distribuído | Tabela cresce indefinidamente (slots órfãos persistem) |
| Conta CPF + phone como mesma vaga | Mudança de CPF de paciente existente é bloqueada (tem que excluir+recadastrar) |

## Decisão revertida (registrada explicitamente)

Cross-tenant detection de CPF de paciente — descartada. Paciente em N clínicas é legítimo (cada clínica é cliente diferente), não fraude. Ver [[monetization-v2-state]].

## Wikilinks

- [[identifier-hash-namespacing]]
- [[append-only-via-pg-trigger]] (mesmo espírito, escopo diferente)

> Fonte: `src/lib/billing/quota.ts` (`reserveSlotInTx`), validação em `npm run test:sprints` (Sprint 2: 25/25 ✅).
