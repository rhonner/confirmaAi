-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('CPF', 'PHONE');

-- AlterTable: User adds patientSlotCount denormalized counter
ALTER TABLE "User" ADD COLUMN "patientSlotCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Patient adds CPF + canonical phone + archive
ALTER TABLE "Patient" ADD COLUMN "phoneCanonical" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Patient" ADD COLUMN "cpf" TEXT;
ALTER TABLE "Patient" ADD COLUMN "cpfHash" TEXT;
ALTER TABLE "Patient" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Backfill phoneCanonical (digits-only) para rows existentes.
-- Os slots em PatientQuotaSlot são populados depois via script TS pra
-- alinhar a função de hash com o app (CPF_HASH_PEPPER do env).
UPDATE "Patient" SET "phoneCanonical" = regexp_replace(phone, '\D', '', 'g');

-- CreateTable: PatientQuotaSlot
CREATE TABLE "PatientQuotaSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identifierType" "IdentifierType" NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "patientId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientQuotaSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientQuotaSlot_patientId_key" ON "PatientQuotaSlot"("patientId");
CREATE UNIQUE INDEX "PatientQuotaSlot_userId_identifierHash_key" ON "PatientQuotaSlot"("userId", "identifierHash");
CREATE INDEX "PatientQuotaSlot_userId_idx" ON "PatientQuotaSlot"("userId");
CREATE INDEX "PatientQuotaSlot_identifierHash_idx" ON "PatientQuotaSlot"("identifierHash");

-- CreateIndex: Patient unique on (userId, cpfHash). NULLs são distintos em Postgres,
-- então rows legadas (cpfHash=NULL) não conflitam.
CREATE UNIQUE INDEX "Patient_userId_cpfHash_key" ON "Patient"("userId", "cpfHash");
CREATE INDEX "Patient_userId_archivedAt_idx" ON "Patient"("userId", "archivedAt");

-- AddForeignKey
ALTER TABLE "PatientQuotaSlot" ADD CONSTRAINT "PatientQuotaSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientQuotaSlot" ADD CONSTRAINT "PatientQuotaSlot_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
