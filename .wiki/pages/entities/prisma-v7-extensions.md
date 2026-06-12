---
title: Prisma v7 — extensions ($extends)
type: entity
created: 2026-05-07
updated: 2026-05-07
tags: [prisma, audit, async-local-storage]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
related:
  - .context/features/audit.md
status: stable
---

> Como construímos auditoria automática com `prisma.$extends({ query })` interceptando todas as mutations em modelos selecionados, sem tocar uma linha das rotas.

## Setup

```ts
// src/lib/prisma.ts
const adapter = new PrismaPg({ connectionString });
return new PrismaClient({ adapter }).$extends(auditExtension);
```

## Definição da extensão

```ts
export const auditExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: "audit",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (!AUDITED_MODELS.has(model)) return query(args);
          const result = await query(args);
          await audit({ ... });
          return result;
        },
        async update({ ... }) { /* findOne para before, depois query, depois diff */ },
        async delete({ ... }) { /* findOne pra capturar before */ },
        // ... createMany / updateMany / deleteMany / upsert
      },
    },
  });
});
```

## Cuidados

### 1. Recursão

A extensão chama `audit()` que usa `prisma.auditLog.create()`. Isso passa pelas extensões. Solução: **não inclua `AuditLog` em `AUDITED_MODELS`** — `if (!AUDITED_MODELS.has(model)) return query(args)` curto-circuita.

Reads (`findUnique` / `findFirst` / `findMany`) não são interceptados → o `findOne` interno pra capturar "before" não recursa.

### 2. Contexto via AsyncLocalStorage

A extensão precisa saber **quem fez** a mutation. ALS resolve sem passar contexto explicitamente:

```ts
// route handler
runWithAuditContext({ actorType: "USER", actorId: session.user.id }, () =>
  prisma.patient.create(...)
);
// extensão lê via getOrSystemContext() — fallback pra SYSTEM se vazio
```

ALS exige Node runtime — não funciona em Next.js Edge. Nossas rotas estão em Node (default), ok.

### 3. Diff seletivo

Para `update`: `before = findOne(where)`, depois `result = query(args)`, depois `shallowDiff(redact(before), redact(after))`. Diff é gravado em `beforeJson`/`afterJson` — só campos alterados.

Redação acontece **antes** do diff (campos como `password` ficam `[REDACTED]` em ambos lados → diff os trata como iguais → não aparecem). Trade-off: você perde "houve mudança no password" mas ganha "nunca vaza hash".

### 4. Tx + audit

Quando uma mutation roda dentro de `prisma.$transaction(async (tx) => {...})`, **a extensão usa o cliente principal** (não o `tx`). Isso significa que `audit()` escreve em uma transação separada — **sobrevive ao rollback**.

Trade-off aceito: trail persiste mesmo se a operação foi rollbackada. Documentado em `.context/features/audit.md` como "AuditLog em transações com rollback".

## Performance

Cada `update`/`delete` adiciona 1 `SELECT` (pra capturar before) + 1 `INSERT` (audit). No volume atual (clínicas SMB, dezenas de mutations/dia) é negligenciável. Para hot paths (>100 writes/s), considerar fila assíncrona — fora do escopo MVP.

## Models auditados (Sprint 1)

`Patient`, `Appointment`, `Settings`, `User`, `Subscription`. **Não** auditados: `MessageLog`, `BillingEvent` (já são event-tables; auditar = duplicar).

## Wikilinks

- [[append-only-via-pg-trigger]] — proteção da tabela alvo
- [[rate-limit-via-audit]] — uso secundário dos eventos gerados

> Fonte: `src/lib/audit/prisma-extension.ts`, `src/lib/audit/log.ts`.
