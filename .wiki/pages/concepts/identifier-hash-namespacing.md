---
title: Hash de identificador com namespace
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [security, hash, gotcha, billing]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
related:
  - .context/features/plan-quota.md
status: stable
---

> Sintoma sutil descoberto em test unit: `hashCpf("11144477735")` produzia o **mesmo hash** que `hashPhone("11144477735")`. Solução: prefixo de namespace antes do digest.

## Por que importa

Em `PatientQuotaSlot.identifierHash` o tipo (`CPF` vs `PHONE`) é semanticamente diferente, mas se o input canonicalizado tem 11 dígitos e o pepper é igual, `sha256(value + pepper)` colide. Resultado: paciente com phone `11144477735` colidiria com qualquer pessoa cujo CPF é `111.444.777-35` — **mesmo dentro do mesmo tenant**.

## Fix

```ts
export function hashCpf(cpf: string) {
  return sha256("cpf:" + canonicalizeCpf(cpf) + ":" + pepper);
}
export function hashPhone(phone: string) {
  return sha256("phone:" + canonicalizePhone(phone) + ":" + pepper);
}
```

## Princípio geral

**Sempre namespace hashes que vão pra mesma coluna a partir de domínios diferentes.** Mesmo que a probabilidade de colisão pareça baixa, o custo do prefixo é zero e elimina toda uma classe de bugs.

Aplica também a:
- Cache keys (`user:${id}:profile` vs `org:${id}:profile`)
- Dedup chaves em filas (`webhook:asaas:${eventId}` vs `webhook:stripe:${eventId}`)
- Tokens (`pwd-reset:${token}` vs `email-verify:${token}`)

## Como pegamos o bug

Test unit dedicado:
```ts
it("phone hash difere de CPF hash mesmo com input numérico igual", () => {
  expect(hashCpf("11144477735")).not.toBe(hashPhone("11144477735"));
});
```

Falhou na primeira rodada → adicionei namespace → passou. Sem esse teste, o bug ia pra produção e só apareceria em campo (talvez nunca, mas eventualmente).

## Pegada de migração

Se mudar o algoritmo de hash em produção, precisa **rehash** de toda a base — script `scripts/rehash-quota-slots.ts` é exemplo dev-only. Em prod, planejar (provavelmente impossível em zero-downtime sem coluna paralela).

## Wikilinks

- [[quota-ledger-immortal-slot]]
- [[append-only-via-pg-trigger]]

> Fonte: `src/lib/billing/identifiers.ts`, test em `tests/unit/identifiers.test.ts`.
