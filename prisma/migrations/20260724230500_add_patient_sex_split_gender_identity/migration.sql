-- Sexo (clínico) e identidade de gênero passam a ser campos SEPARADOS.
-- Esclarecimento do dono (2026-07-24): "quando eu disse gênero na primeira
-- mensagem, quis dizer sexo" — então FEMALE/MALE saem do enum de identidade
-- (viram CIS_WOMAN/CIS_MAN) e nascem no enum novo `Sex`.
-- Seguro: nenhuma linha usa `Patient.gender` ainda (coluna criada minutos antes,
-- 0 de 21 pacientes com valor) — conferido antes de escrever esta migration.

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'INTERSEX', 'NOT_INFORMED');

-- AlterEnum: Gender ganha CIS_WOMAN/CIS_MAN e perde FEMALE/MALE
BEGIN;
CREATE TYPE "Gender_new" AS ENUM ('CIS_WOMAN', 'CIS_MAN', 'TRANS_WOMAN', 'TRANS_MAN', 'TRAVESTI', 'NON_BINARY', 'AGENDER', 'GENDERFLUID', 'SELF_DESCRIBED', 'NOT_INFORMED');
ALTER TABLE "Patient" ALTER COLUMN "gender" TYPE "Gender_new" USING ("gender"::text::"Gender_new");
DROP TYPE "Gender";
ALTER TYPE "Gender_new" RENAME TO "Gender";
COMMIT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "sex" "Sex";
