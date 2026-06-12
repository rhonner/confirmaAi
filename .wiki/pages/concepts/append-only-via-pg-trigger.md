---
title: Append-only via Postgres trigger + GUC bypass
type: concept
created: 2026-05-07
updated: 2026-05-07
tags: [postgres, audit, security, defense-in-depth]
sources:
  - raw/sessions/2026-05-07-sprint-1-3-monetizacao.md
related:
  - .context/features/audit.md
status: stable
---

> Como tornar uma tabela imutável **no nível do banco** — mesmo que o app seja comprometido — mas ainda permitir limpeza pelo retention job. Pattern aplicado em `AuditLog` (Sprint 1 hardening).

## Mecânica

```sql
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER AS $$
DECLARE
  bypass TEXT;
BEGIN
  bypass := current_setting('app.allow_audit_mutation', true);
  IF bypass = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AuditLog é append-only — % bloqueado', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

## Como o retention job (futuro Sprint 7) usa o bypass

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SET LOCAL app.allow_audit_mutation = 'true'");
  await tx.$executeRawUnsafe(`
    DELETE FROM "AuditLog" WHERE "createdAt" < now() - INTERVAL '90 days'
  `);
});
```

`SET LOCAL` morre com o COMMIT/ROLLBACK — fora da tx, ninguém consegue deletar.

## Por que não usar permissões de role separadas?

Seria a alternativa "ortodoxa" (role `app_runtime` sem `DELETE`, role `app_retention` com). Mas:
- Vercel + Prisma usam um único `DATABASE_URL` por env. Trocar de role exige duas conexões.
- Trigger + GUC permite controle fino dentro da mesma transação, sem mudança de credencial.

Trade-off: GUC pode ser setado por qualquer query no mesmo connection — depende do app não chamar `SET LOCAL` em rotas non-retention. Isolar isso numa função utilitária `withAuditMutationBypass(fn)` no momento de implementar Sprint 7.

## Pega bem

- Compromisso de runtime do app (ex: SQL injection que tente `DELETE FROM "AuditLog"`)
- Erros de código que chamem `prisma.auditLog.deleteMany()` por engano

## Não pega

- Atacante com acesso direto ao DB (psql via SSH/IAM) — não é defesa contra esse modelo de ameaça.

## Wikilinks

- [[prisma-v7-extensions]]
- [[rate-limit-via-audit]]

> Fonte: migration `prisma/migrations/20260507170554_audit_append_only/migration.sql`. Validado em smoke test: UPDATE/DELETE bloqueados, bypass funciona.
