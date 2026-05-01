-- Adds per-tenant WhatsApp instance fields for Evolution API integration.

CREATE TYPE "WhatsappStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'FAILED');

ALTER TABLE "User"
  ADD COLUMN "evolutionInstanceName" TEXT,
  ADD COLUMN "whatsappStatus" "WhatsappStatus" NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN "whatsappPhoneNumber" TEXT,
  ADD COLUMN "whatsappConnectedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_evolutionInstanceName_key" ON "User"("evolutionInstanceName");
