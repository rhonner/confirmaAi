import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/**
 * Manutenção diária de billing (chamada pelo cron `/api/cron/run`).
 *
 * Defesa em profundidade contra webhooks perdidos:
 * - PAST_DUE há mais de 7 dias → SUSPENDED.
 * - CANCELED com `currentPeriodEnd` no passado → downgrade para FREE.
 *   (Não deleta `PatientQuotaSlot` — vagas históricas continuam contando se
 *   a conta voltar ao FREE com >5 pacientes; ver `plan-quota.md`.)
 *
 * Idempotente: rodar 2x não causa duplicação (cada update é gated por status atual).
 */

const PAST_DUE_GRACE_DAYS = 7;

export async function runBillingMaintenance(): Promise<{
  pastDueSuspended: number;
  canceledDowngraded: number;
}> {
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - PAST_DUE_GRACE_DAYS * 24 * 60 * 60_000);

  const pastDueExpired = await prisma.subscription.findMany({
    where: {
      status: "PAST_DUE",
      updatedAt: { lt: graceCutoff },
    },
    select: { id: true, userId: true },
  });

  for (const s of pastDueExpired) {
    await prisma.subscription.update({
      where: { id: s.id },
      data: { status: "SUSPENDED" },
    });
    await audit({
      action: "subscription.suspended",
      tenantUserId: s.userId,
      entityType: "Subscription",
      entityId: s.id,
      metadata: { reason: "past_due_grace_expired", graceDays: PAST_DUE_GRACE_DAYS },
    });
  }

  const canceledExpired = await prisma.subscription.findMany({
    where: {
      status: "CANCELED",
      currentPeriodEnd: { lt: now },
      plan: { in: ["PRO", "PREMIUM"] },
    },
    select: { id: true, userId: true, plan: true },
  });

  for (const s of canceledExpired) {
    await prisma.subscription.update({
      where: { id: s.id },
      data: {
        plan: "FREE",
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        provider: null,
        providerCustomerId: null,
        providerSubscriptionId: null,
      },
    });
    await audit({
      action: "subscription.downgraded",
      tenantUserId: s.userId,
      entityType: "Subscription",
      entityId: s.id,
      metadata: { from: s.plan, to: "FREE", reason: "canceled_period_ended" },
    });
  }

  return {
    pastDueSuspended: pastDueExpired.length,
    canceledDowngraded: canceledExpired.length,
  };
}
