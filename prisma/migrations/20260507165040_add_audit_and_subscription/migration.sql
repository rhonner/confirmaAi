-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('ASAAS', 'STRIPE', 'PAGARME');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'WEBHOOK', 'ADMIN', 'ANONYMOUS');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "provider" "BillingProvider",
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "adminOverrideUntil" TIMESTAMP(3),
    "adminOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "tenantUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadata" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "AuditLog_tenantUserId_createdAt_idx" ON "AuditLog"("tenantUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada User existente recebe uma Subscription FREE/ACTIVE
-- Idempotente: ON CONFLICT DO NOTHING (Subscription.userId é UNIQUE)
INSERT INTO "Subscription" ("id", "userId", "plan", "status", "currentPeriodStart", "createdAt", "updatedAt")
SELECT
  'sub_bf_' || substr(md5(random()::text || u."id"), 1, 21) AS "id",
  u."id" AS "userId",
  'FREE'::"PlanTier" AS "plan",
  'ACTIVE'::"SubscriptionStatus" AS "status",
  NOW() AS "currentPeriodStart",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM "User" u
LEFT JOIN "Subscription" s ON s."userId" = u."id"
WHERE s."id" IS NULL;

-- Audit do backfill (sistema marca o evento)
INSERT INTO "AuditLog" ("id", "actorType", "action", "entityType", "metadata", "createdAt")
SELECT
  'aud_bf_' || substr(md5(random()::text), 1, 21),
  'SYSTEM'::"ActorType",
  'subscription.backfill',
  'Subscription',
  jsonb_build_object('reason', 'migration_20260507165040', 'count', (SELECT COUNT(*) FROM "Subscription")),
  NOW()
WHERE EXISTS (SELECT 1 FROM "Subscription");
