/**
 * Uso de mensagens por período (Sprint 6).
 *
 * `UsageCounter` é criado **lazy** na primeira leitura/incremento de cada
 * período — não existe job de "reset": a virada de período é a criação de uma
 * nova linha keyed por `@@unique([userId, periodStart])`. Isso também é a
 * defesa contra webhook de renovação perdido: se `currentPeriodEnd` do plano
 * pago já passou (webhook atrasado/perdido), o período cai no fallback de mês
 * calendário e o contador continua girando em vez de congelar no ciclo velho.
 */

import { prisma } from "@/lib/prisma";
import { PLANS, effectivePlanTier } from "./plans";
import type { PlanTier, Prisma, Subscription } from "@/generated/prisma/client";

export type UsagePeriod = { periodStart: Date; periodEnd: Date };

export type MessageUsage = {
  messagesSent: number;
  messagesIncluded: number;
  periodStart: Date;
  periodEnd: Date;
};

/** Primeiro instante do mês calendário (UTC) que contém `now`. */
function calendarMonthPeriod(now: Date): UsagePeriod {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

/**
 * Período corrente de uso para a assinatura.
 * - Pago com ciclo válido (`currentPeriodEnd > now`): usa o ciclo de cobrança.
 * - FREE (sem ciclo) ou ciclo expirado (webhook perdido): mês calendário UTC.
 */
export function currentPeriodFor(sub: Subscription | null, now: Date = new Date()): UsagePeriod {
  if (sub?.currentPeriodEnd && sub.currentPeriodEnd > now) {
    return { periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd };
  }
  return calendarMonthPeriod(now);
}

type Tx = Prisma.TransactionClient | typeof prisma;

async function getOrCreateCounter(
  tx: Tx,
  userId: string,
  planTier: PlanTier,
  period: UsagePeriod,
) {
  const messagesIncluded = PLANS[planTier].messagesIncluded;
  return tx.usageCounter.upsert({
    where: { userId_periodStart: { userId, periodStart: period.periodStart } },
    create: {
      userId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      messagesSent: 0,
      messagesIncluded,
    },
    // Plano pode ter mudado no meio do período (upgrade): atualiza o teto.
    update: { messagesIncluded },
  });
}

/** Uso corrente do tenant (cria a linha do período se não existir). */
export async function getCurrentUsage(userId: string, now: Date = new Date()): Promise<MessageUsage> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const period = currentPeriodFor(sub, now);
  // Override admin (beta) → cota de mensagens do PREMIUM. Reverte ao desligar.
  const counter = await getOrCreateCounter(prisma, userId, effectivePlanTier(sub, now), period);
  return {
    messagesSent: counter.messagesSent,
    messagesIncluded: counter.messagesIncluded,
    periodStart: counter.periodStart,
    periodEnd: counter.periodEnd,
  };
}

/**
 * Incrementa o contador do período corrente após um envio bem-sucedido.
 * Increment atômico no banco — seguro mesmo com runs concorrentes do cron.
 */
export async function incrementMessagesSent(userId: string, now: Date = new Date()): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  const period = currentPeriodFor(sub, now);
  await getOrCreateCounter(prisma, userId, effectivePlanTier(sub, now), period);
  await prisma.usageCounter.update({
    where: { userId_periodStart: { userId, periodStart: period.periodStart } },
    data: { messagesSent: { increment: 1 } },
  });
}

/** True se o tenant ainda tem mensagens disponíveis no período corrente. */
export async function hasMessageQuota(userId: string, now: Date = new Date()): Promise<boolean> {
  const usage = await getCurrentUsage(userId, now);
  return usage.messagesSent < usage.messagesIncluded;
}
