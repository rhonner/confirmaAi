import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "./whatsapp";
import {
  formatMessage,
  formatAppointmentDate,
  formatAppointmentTime,
} from "./message-template";
import { audit } from "@/lib/audit";
import { getCurrentUsage, incrementMessagesSent } from "@/lib/billing/usage";
import type { MessageType, Prisma } from "@/generated/prisma/client";

export type SchedulerStats = {
  confirmationsSent: number;
  remindersSent: number;
  sendFailures: number;
  quotaBlocked: number;
  noShowsMarked: number;
  /** True se o time-budget estourou antes de varrer tudo (próximo run continua). */
  truncated: boolean;
  durationMs: number;
  // Sprint 8 — resiliência WhatsApp (ver whatsapp-alerts.ts):
  /** Emails de reforço/renotificação de desconexão enviados pelo sweep. */
  whatsappRenotified: number;
  /** Tenants desconectados com agendamentos futuros (valor em risco). */
  whatsappDisconnectedWithPending: number;
  /** Health-check da Evolution API ("OK" | "DOWN" | "NOT_CONFIGURED"). */
  evolutionHealth: string;
  /** % de tenants com instância que estão CONNECTED (null sem instâncias). */
  whatsappConnectedPct: number | null;
  // Sprint 10 fatia 2.3 — notificações de billing (ver billing-notifications.ts):
  /** Emails de dunning (cobrança em atraso, dias 1/3/7) enviados. */
  dunningEmailsSent: number;
  /** Avisos de "perto do limite" de mensagens (80%/100%) enviados. */
  usageWarningsSent: number;
};

// A rota /api/cron/run tem maxDuration = 60s; paramos a varredura em 45s
// para sobrar margem pro billing-maintenance e pra resposta HTTP.
const TIME_BUDGET_MS = 45_000;
// Tamanho do lote por query — limita memória por invocação serverless.
const BATCH_SIZE = 200;

type QuotaCache = Map<string, number>; // userId → mensagens restantes no período

async function remainingMessages(cache: QuotaCache, userId: string): Promise<number> {
  const cached = cache.get(userId);
  if (cached !== undefined) return cached;
  const usage = await getCurrentUsage(userId);
  const remaining = Math.max(0, usage.messagesIncluded - usage.messagesSent);
  cache.set(userId, remaining);
  return remaining;
}

/**
 * Registra o bloqueio por quota UMA vez por (appointment, type) — o
 * appointment continua matching o filtro a cada run enquanto bloqueado, e sem
 * dedup isso viraria spam de MessageLog/AuditLog a cada 30 min.
 */
async function logQuotaBlockedOnce(
  appointmentId: string,
  userId: string,
  type: MessageType,
): Promise<void> {
  const existing = await prisma.messageLog.findFirst({
    where: { appointmentId, type, status: "QUOTA_BLOCKED" },
    select: { id: true },
  });
  if (existing) return;

  await prisma.messageLog.create({
    data: { appointmentId, type, status: "QUOTA_BLOCKED" },
  });
  await audit({
    action: "quota.message_blocked",
    entityType: "Appointment",
    entityId: appointmentId,
    tenantUserId: userId,
    metadata: { type },
  });
}

type SendKind = {
  type: MessageType;
  where: Prisma.AppointmentWhereInput;
  hoursBeforeOf: (s: { confirmationHoursBefore: number; reminderHoursBefore: number }) => number;
  messageOf: (s: { confirmationMessage: string; reminderMessage: string }) => string;
  sentAtField: "confirmationSentAt" | "reminderSentAt";
};

const CONFIRMATION: SendKind = {
  type: "CONFIRMATION",
  where: { confirmationSentAt: null, status: "PENDING", user: { whatsappStatus: "CONNECTED" } },
  hoursBeforeOf: (s) => s.confirmationHoursBefore,
  messageOf: (s) => s.confirmationMessage,
  sentAtField: "confirmationSentAt",
};

const REMINDER: SendKind = {
  type: "REMINDER",
  where: {
    confirmationSentAt: { not: null },
    reminderSentAt: null,
    status: "PENDING",
    user: { whatsappStatus: "CONNECTED" },
  },
  hoursBeforeOf: (s) => s.reminderHoursBefore,
  messageOf: (s) => s.reminderMessage,
  sentAtField: "reminderSentAt",
};

/**
 * Varre appointments elegíveis em lotes, priorizando os horários mais
 * próximos, até esgotar a fila ou estourar `deadline`.
 *
 * Paginação: appointments enviados saem do filtro sozinhos (sentAt deixa de
 * ser null); os pulados (cedo demais, sem quota, falha de envio) entram em
 * `skippedIds` para não repetir dentro do mesmo run.
 */
async function processSends(
  kind: SendKind,
  deadline: number,
  quotaCache: QuotaCache,
  stats: SchedulerStats,
): Promise<void> {
  const skippedIds: string[] = [];

  while (Date.now() < deadline) {
    const appointments = await prisma.appointment.findMany({
      where: { ...kind.where, ...(skippedIds.length ? { id: { notIn: skippedIds } } : {}) },
      include: { patient: true, user: { include: { settings: true } } },
      orderBy: { dateTime: "asc" },
      take: BATCH_SIZE,
    });
    if (appointments.length === 0) return;

    for (const appointment of appointments) {
      if (Date.now() >= deadline) {
        stats.truncated = true;
        return;
      }

      const now = new Date();
      const settings = appointment.user.settings;
      if (!settings) {
        skippedIds.push(appointment.id);
        continue;
      }

      const sendTime = new Date(appointment.dateTime);
      sendTime.setHours(sendTime.getHours() - kind.hoursBeforeOf(settings));
      if (now < sendTime || now > appointment.dateTime) {
        skippedIds.push(appointment.id);
        continue;
      }

      // Gate de quota de mensagens (Sprint 6). Bloqueado ≠ enviado: o
      // appointment fica PENDING e volta a ser elegível se o tenant fizer
      // upgrade antes do horário.
      const remaining = await remainingMessages(quotaCache, appointment.userId);
      if (remaining <= 0) {
        await logQuotaBlockedOnce(appointment.id, appointment.userId, kind.type);
        stats.quotaBlocked++;
        skippedIds.push(appointment.id);
        continue;
      }

      const message = formatMessage(kind.messageOf(settings), {
        nome: appointment.patient.name,
        data: formatAppointmentDate(appointment.dateTime),
        hora: formatAppointmentTime(appointment.dateTime),
        clinica: appointment.user.clinicName,
      });

      const success = await sendWhatsAppMessage(
        appointment.user.evolutionInstanceName,
        appointment.patient.phone,
        message,
      );

      if (success) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { [kind.sentAtField]: new Date() },
        });
        await prisma.messageLog.create({
          data: { appointmentId: appointment.id, type: kind.type, status: "SENT" },
        });
        await incrementMessagesSent(appointment.userId);
        quotaCache.set(appointment.userId, remaining - 1);
        if (kind.type === "CONFIRMATION") stats.confirmationsSent++;
        else stats.remindersSent++;

        await audit({
          action: "message.sent",
          entityType: "Appointment",
          entityId: appointment.id,
          tenantUserId: appointment.userId,
          metadata: { type: kind.type, instanceName: appointment.user.evolutionInstanceName },
        });
      } else {
        stats.sendFailures++;
        skippedIds.push(appointment.id);
        await audit({
          action: "message.send_failed",
          entityType: "Appointment",
          entityId: appointment.id,
          tenantUserId: appointment.userId,
          metadata: { type: kind.type },
        });
      }
    }

    if (appointments.length < BATCH_SIZE) return;
  }
  stats.truncated = true;
}

async function markNoShows(stats: SchedulerStats): Promise<void> {
  try {
    const result = await prisma.appointment.updateMany({
      where: { dateTime: { lt: new Date() }, status: "PENDING" },
      data: { status: "NO_SHOW" },
    });
    stats.noShowsMarked = result.count;
  } catch (error) {
    console.error("Error in markNoShows:", error);
  }
}

export async function runSchedulerJobs(): Promise<SchedulerStats> {
  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;
  const quotaCache: QuotaCache = new Map();
  const stats: SchedulerStats = {
    confirmationsSent: 0,
    remindersSent: 0,
    sendFailures: 0,
    quotaBlocked: 0,
    noShowsMarked: 0,
    truncated: false,
    durationMs: 0,
    whatsappRenotified: 0,
    whatsappDisconnectedWithPending: 0,
    evolutionHealth: "NOT_CONFIGURED",
    whatsappConnectedPct: null,
    dunningEmailsSent: 0,
    usageWarningsSent: 0,
  };

  try {
    await processSends(CONFIRMATION, deadline, quotaCache, stats);
  } catch (error) {
    console.error("Error in sendConfirmations:", error);
  }
  try {
    await processSends(REMINDER, deadline, quotaCache, stats);
  } catch (error) {
    console.error("Error in sendReminders:", error);
  }
  await markNoShows(stats);

  // Notificações de billing (Sprint 10 fatia 2.3): dunning (dias 1/3/7) +
  // aviso de "perto do limite". Roda ANTES do billing-maintenance de propósito:
  // a suspensão (PAST_DUE>7d) limparia o status PAST_DUE e o email do dia 7
  // (aviso de suspensão iminente) não sairia. Best-effort, try/catch isolado.
  try {
    const { runBillingNotifications } = await import("./billing-notifications");
    const n = await runBillingNotifications();
    stats.dunningEmailsSent = n.dunningEmailsSent;
    stats.usageWarningsSent = n.usageWarningsSent;
  } catch (err) {
    console.error("billing-notifications failed:", err);
  }

  // Billing maintenance (Sprint 5): defesa em profundidade contra webhooks
  // perdidos. Roda no mesmo cron pra economizar invocações Vercel.
  try {
    const { runBillingMaintenance } = await import("./billing-maintenance");
    const r = await runBillingMaintenance();
    if (r.pastDueSuspended > 0 || r.canceledDowngraded > 0) {
      console.info("[billing-maintenance]", r);
    }
  } catch (err) {
    console.error("billing-maintenance failed:", err);
  }

  // Resiliência WhatsApp (Sprint 8): health-check Evolution, métrica de
  // conectados e sweep de desconectados (reforço 24h / renotificação diária).
  try {
    const { runWhatsappResilience } = await import("./whatsapp-alerts");
    const w = await runWhatsappResilience();
    stats.whatsappRenotified = w.whatsappRenotified;
    stats.whatsappDisconnectedWithPending = w.whatsappDisconnectedWithPending;
    stats.evolutionHealth = w.evolutionHealth;
    stats.whatsappConnectedPct = w.whatsappConnectedPct;
  } catch (err) {
    console.error("whatsapp-resilience failed:", err);
  }

  stats.durationMs = Date.now() - startedAt;
  return stats;
}
