-- Remove unique em User.cpfHash — permite mesma pessoa ter múltiplas
-- contas (caso legítimo: médico com 2 clínicas). Defesa contra fraude
-- fica no detector cross-tenant em src/lib/anti-fraud/owner-cpf-dedup.ts
-- (auto-suspend > 3 contas).
DROP INDEX IF EXISTS "User_cpfHash_key";
CREATE INDEX IF NOT EXISTS "User_cpfHash_idx" ON "User"("cpfHash");
