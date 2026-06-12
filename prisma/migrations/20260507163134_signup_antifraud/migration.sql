-- AlterTable: User adds CPF (do dono da clínica) + email verification fields
ALTER TABLE "User" ADD COLUMN "cpf" TEXT;
ALTER TABLE "User" ADD COLUMN "cpfHash" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);

-- CreateIndex: cpfHash globalmente unique (dono não pode ter 2 contas com mesmo CPF)
-- e emailVerificationToken unique para lookup rápido na rota /verify-email.
CREATE UNIQUE INDEX "User_cpfHash_key" ON "User"("cpfHash");
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- CreateTable: SignupAttempt — purpose-built tabela para rate limit de signup
-- (substitui a abordagem AuditLog-based do Sprint 1 hardening).
CREATE TABLE "SignupAttempt" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT,
    "emailHash" TEXT NOT NULL,
    "cpfHash" TEXT,
    "fingerprint" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: queries de rate limit por janela
CREATE INDEX "SignupAttempt_ipAddress_createdAt_idx" ON "SignupAttempt"("ipAddress", "createdAt" DESC);
CREATE INDEX "SignupAttempt_emailHash_createdAt_idx" ON "SignupAttempt"("emailHash", "createdAt" DESC);
CREATE INDEX "SignupAttempt_cpfHash_idx" ON "SignupAttempt"("cpfHash");

-- Backfill: usuários existentes (admin@teste.com etc) já têm email verificado
-- (grandfathering — pre-Sprint-4 não tinha verificação). Define emailVerifiedAt = createdAt.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;
