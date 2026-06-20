import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { PLANS } from "@/lib/billing/plans";
import { sendDunningEmail, sendUsageLimitEmail } from "@/lib/emails/transactional";

/**
 * Sprint 10 / fatia 2.3 — camada de COMUNICAÇÃO de cobrança no cron.
 *
 * Espelha o padrão da Sprint 8 (`whatsapp-alerts.ts`): funções PURAS de decisão
 * + dedup por `AuditLog`, SEM schema novo. Roda dentro de `runSchedulerJobs()`,
 * best-effort (nunca lança — uma falha de email/audit não pode quebrar o cron).
 *
 * (1) **Dunning**: para cada Subscription `PAST_DUE`, email nos dias 1/3/7 desde
 *     o início do atraso (+ aviso de suspensão iminente no dia 7). O lifecycle
 *     `PAST_DUE → SUSPENDED` (7d) vive em `billing-maintenance.ts`; aqui é só a
 *     comunicação. **Roda ANTES do billing-maintenance** (ver `scheduler.ts`)
 *     pra o aviso do dia 7 sair antes da suspensão.
 * (2) **Perto do limite**: ao cruzar 80% e 100% das mensagens do período, 1 email
 *     por marco por período (Free incluído — gancho de conversão).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// Alinhado a PAST_DUE_GRACE_DAYS em billing-maintenance.ts.
const SUSPEND_AFTER_DAYS = 7;

const DUNNING_STAGES = [
  { stage: "DAY_1", day: 1 },
  { stage: "DAY_3", day: 3 },
  { stage: "DAY_7", day: 7 },
] as const;
export type DunningStage = (typeof DUNNING_STAGES)[number]["stage"];

export type DunningDecision = {
  stage: DunningStage;
  daysSince: number;
  /** Dias até a suspensão automática (0 = hoje/iminente). */
  suspendsInDays: number;
};

/**
 * Decide qual estágio de dunning enviar. Pura.
 *
 * Regra: pega o **maior** estágio cujo `day <= daysSince` (o mais urgente já
 * vencido) e só dispara se ele ainda NÃO foi enviado. Nunca regride para um
 * estágio menor depois de enviar um maior (ex: cron pulou dias e foi direto pro
 * DAY_7 → não manda DAY_3 atrasado no dia seguinte).
 */
export function dunningStageDue(input: {
  pastDueSince: Date;
  now: Date;
  alreadySentStages: string[];
}): DunningDecision | null {
  const daysSince = Math.floor((input.now.getTime() - input.pastDueSince.getTime()) / DAY_MS);
  let highestDue: (typeof DUNNING_STAGES)[number] | null = null;
  for (const s of DUNNING_STAGES) {
    if (daysSince >= s.day) highestDue = s; // DUNNING_STAGES é crescente
  }
  if (!highestDue) return null;
  if (input.alreadySentStages.includes(highestDue.stage)) return null;
  return {
    stage: highestDue.stage,
    daysSince,
    suspendsInDays: Math.max(0, SUSPEND_AFTER_DAYS - daysSince),
  };
}

/**
 * Decide qual marco de uso de mensagens notificar (80% ou 100%). Pura.
 * 100% tem precedência; cada marco é enviado uma vez por período (dedup externo).
 */
export function usageThresholdDue(input: {
  messagesSent: number;
  messagesIncluded: number;
  alreadyNotified: number[];
}): 80 | 100 | null {
  if (input.messagesIncluded <= 0) return null;
  const pct = input.messagesSent / input.messagesIncluded;
  if (pct >= 1 && !input.alreadyNotified.includes(100)) return 100;
  if (pct >= 0.8 && !input.alreadyNotified.includes(80)) return 80;
  return null;
}

export type BillingNotificationStats = {
  dunningEmailsSent: number;
  usageWarningsSent: number;
};

/**
 * Âncora "início do atraso": primeiro `billing.payment.failed` DESDE o último
 * `billing.payment.received` (reinicia o relógio num ciclo PAST_DUE→ACTIVE→PAST_DUE).
 * Fallback `updatedAt` quando o PAST_DUE foi setado fora do webhook (mock-trigger/backfill).
 */
async function resolvePastDueSince(userId: string, updatedAt: Date): Promise<Date> {
  const lastRecovered = await prisma.auditLog.findFirst({
    where: { tenantUserId: userId, action: "billing.payment.received" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const firstFailed = await prisma.auditLog.findFirst({
    where: {
      tenantUserId: userId,
      action: "billing.payment.failed",
      ...(lastRecovered ? { createdAt: { gt: lastRecovered.createdAt } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return firstFailed?.createdAt ?? updatedAt;
}

export async function runBillingNotifications(now: Date = new Date()): Promise<BillingNotificationStats> {
  const stats: BillingNotificationStats = { dunningEmailsSent: 0, usageWarningsSent: 0 };

  // (1) DUNNING — assinaturas em atraso.
  try {
    const pastDue = await prisma.subscription.findMany({
      where: { status: "PAST_DUE" },
      select: { userId: true, plan: true, updatedAt: true },
    });
    for (const sub of pastDue) {
      try {
        const pastDueSince = await resolvePastDueSince(sub.userId, sub.updatedAt);
        const sentRows = await prisma.auditLog.findMany({
          where: { tenantUserId: sub.userId, action: "billing.dunning.sent", createdAt: { gte: pastDueSince } },
          select: { metadata: true },
        });
        const alreadySentStages = sentRows
          .map((r) => (r.metadata as { stage?: string } | null)?.stage)
          .filter((s): s is string => !!s);

        const decision = dunningStageDue({ pastDueSince, now, alreadySentStages });
        if (!decision) continue;

        const user = await prisma.user.findUnique({
          where: { id: sub.userId },
          select: { email: true, name: true },
        });
        if (!user) continue;

        const sent = await sendDunningEmail({
          to: user.email,
          name: user.name,
          planLabel: PLANS[sub.plan].label,
          stage: decision.stage,
          suspendsInDays: decision.suspendsInDays,
        });
        if (sent.ok) {
          await audit({
            action: "billing.dunning.sent",
            tenantUserId: sub.userId,
            entityType: "Subscription",
            metadata: {
              stage: decision.stage,
              daysSince: decision.daysSince,
              suspendsInDays: decision.suspendsInDays,
              pastDueSince: pastDueSince.toISOString(),
            },
          });
          stats.dunningEmailsSent++;
        }
      } catch (err) {
        // Observável (não só console): falha de dunning de um tenant é receita em risco.
        await captureError(err, { area: "cron", tenantUserId: sub.userId, extra: { stage: "dunning" } });
      }
    }
  } catch (err) {
    console.error("dunning sweep failed:", err);
  }

  // (2) PERTO DO LIMITE — uso de mensagens do período corrente.
  try {
    const counters = await prisma.usageCounter.findMany({
      where: { periodEnd: { gt: now }, messagesIncluded: { gt: 0 } },
      select: { userId: true, periodStart: true, messagesSent: true, messagesIncluded: true },
    });
    for (const c of counters) {
      try {
        const periodStartIso = c.periodStart.toISOString();
        const notifiedRows = await prisma.auditLog.findMany({
          where: {
            tenantUserId: c.userId,
            action: "billing.usage.threshold_notified",
            metadata: { path: ["periodStart"], equals: periodStartIso },
          },
          select: { metadata: true },
        });
        const alreadyNotified = notifiedRows
          .map((r) => (r.metadata as { threshold?: number } | null)?.threshold)
          .filter((t): t is number => typeof t === "number");

        const threshold = usageThresholdDue({
          messagesSent: c.messagesSent,
          messagesIncluded: c.messagesIncluded,
          alreadyNotified,
        });
        if (!threshold) continue;

        const user = await prisma.user.findUnique({
          where: { id: c.userId },
          select: { email: true, name: true },
        });
        if (!user) continue;

        const sent = await sendUsageLimitEmail({
          to: user.email,
          name: user.name,
          threshold,
          messagesSent: c.messagesSent,
          messagesIncluded: c.messagesIncluded,
        });
        if (sent.ok) {
          await audit({
            action: "billing.usage.threshold_notified",
            tenantUserId: c.userId,
            entityType: "UsageCounter",
            metadata: {
              threshold,
              periodStart: periodStartIso,
              messagesSent: c.messagesSent,
              messagesIncluded: c.messagesIncluded,
            },
          });
          stats.usageWarningsSent++;
        }
      } catch (err) {
        await captureError(err, { area: "cron", tenantUserId: c.userId, extra: { stage: "usage-threshold" } });
      }
    }
  } catch (err) {
    console.error("usage-threshold sweep failed:", err);
  }

  return stats;
}
