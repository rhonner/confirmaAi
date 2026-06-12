-- BillingEvent: idempotência de webhooks (providerEventId @unique)
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" "BillingProvider" NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingEvent_providerEventId_key" ON "BillingEvent"("providerEventId");
CREATE INDEX "BillingEvent_userId_createdAt_idx" ON "BillingEvent"("userId", "createdAt" DESC);
CREATE INDEX "BillingEvent_eventType_createdAt_idx" ON "BillingEvent"("eventType", "createdAt" DESC);

-- UsageCounter: counter mensal de mensagens (preparação Sprint 6)
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "messagesIncluded" INTEGER NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageCounter_userId_periodStart_key" ON "UsageCounter"("userId", "periodStart");
CREATE INDEX "UsageCounter_userId_periodEnd_idx" ON "UsageCounter"("userId", "periodEnd");
