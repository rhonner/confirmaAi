-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('HEALTH', 'AESTHETICS', 'BEAUTY', 'FINANCE', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "businessType" "BusinessType",
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: usuários EXISTENTES não devem ver o wizard de onboarding
-- retroativamente. Marca todos como já onboardados (businessType fica NULL →
-- terminologia cai no default "Paciente", preservando o comportamento atual).
-- Novos usuários nascem com onboardingCompletedAt NULL → veem o wizard.
UPDATE "User" SET "onboardingCompletedAt" = now();
