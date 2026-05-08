-- AuditLog: append-only no nível do banco
--
-- Defense in depth: mesmo que código da app seja comprometido,
-- mutações em AuditLog são rejeitadas pelo Postgres. O retention job
-- futuro pode explicitamente liberar via `SET LOCAL app.allow_audit_mutation = 'true'`
-- dentro de uma transação dedicada.

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER AS $$
DECLARE
  bypass TEXT;
BEGIN
  -- current_setting com missing_ok=true não levanta se a GUC não existe.
  bypass := current_setting('app.allow_audit_mutation', true);
  IF bypass = 'true' THEN
    -- Bypass autorizado (ex: retention job).
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AuditLog é append-only — % bloqueado pelo trigger audit_log_immutable', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON "AuditLog";
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DROP TRIGGER IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
