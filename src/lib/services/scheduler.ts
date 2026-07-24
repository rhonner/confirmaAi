import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "./whatsapp";
import {
  formatMessage,
  formatAppointmentDate,
  formatAppointmentTime,
  withConfirmationLink,
} from "./message-template";
import { makeConfirmationToken } from "./confirmation-token";
import { audit } from "@/lib/audit";
import { getCurrentUsage, incrementMessagesSent } from "@/lib/billing/usage";
import type { MessageType, Prisma } from "@/generated/prisma/client";

/** Base URL pública p/ montar o link de confirmação. */
function appBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL ?? process.env.EVOLUTION_WEBHOOK_BASE_URL;
  if (!url) {
    // Em produção, montar o link com `localhost` quebraria a confirmação de
    // TODOS os pacientes — e como não-confirmados são auto-cancelados no
    // deadline, viraria cancelamento em massa. Falha alto e cedo: o envio é
    // abortado pelo try/catch do `processSends`, `confirmationSentAt` NÃO é
    // setado, então nada entra no filtro do auto-cancelamento. (code-review.)
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_APP_URL ausente — não dá pra montar o link de confirmação");
    }
    return "http://localhost:3000";
  }
  return url;
}

// Janela mínima de confirmação: se a confirmação for enviada TARDE (agendamento
// de última hora, backlog do cron, reconexão tardia do WhatsApp), o paciente
// ainda ganha esse tempo p/ confirmar — senão o link nasceria já expirado e o
// agendamento seria auto-cancelado no mesmo run. (Achado crítico do code-review.)
const CONFIRM_GRACE_MS = 2 * 3_600_000; // 2h

/**
 * Deadline efetivo (ms epoch) do link/auto-cancelamento: o nominal
 * (`dateTime - reminderHoursBefore`), mas **nunca antes** de `sentAt + GRACE`
 * (piso p/ envio tardio) e **nunca depois** de `dateTime` (teto). `sentAt` = o
 * instante do envio (no `sendConfirmations` é `now`; no auto-cancel é o
 * `confirmationSentAt` gravado) — assim o `exp` do token e o deadline do
 * auto-cancel derivam da MESMA fórmula e batem.
 */
export function effectiveDeadlineMs(
  dateTime: Date,
  reminderHoursBefore: number,
  sentAtMs: number,
): number {
  const nominal = dateTime.getTime() - reminderHoursBefore * 3_600_000;
  const floor = sentAtMs + CONFIRM_GRACE_MS;
  return Math.min(dateTime.getTime(), Math.max(nominal, floor));
}

export type SchedulerStats = {
  confirmationsSent: number;
  /** Agendamentos auto-cancelados no deadline por falta de confirmação. */
  autoCanceled: number;
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
  // Sprint 11 — LGPD: contas soft-deleted cujos dados de pacientes foram purgados (30d).
  accountsPurged: number;
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
  templateOf: (s: { confirmationMessage: string; reminderMessage: string }) => string;
  sentAtField: "confirmationSentAt" | "reminderSentAt";
};

// Único "send" restante: a mensagem de confirmação, que agora leva o LINK
// (não mais "responda 1/2"). O lembrete deixou de ser um envio — no deadline
// (dateTime - reminderHoursBefore) quem não confirmou é auto-cancelado
// (ver `autoCancelUnconfirmed`).
const CONFIRMATION: SendKind = {
  type: "CONFIRMATION",
  // `retroactive: false`: registro lançado no passado não recebe WhatsApp (o
  // atendimento já aconteceu — mandar confirmação seria absurdo). Sem isso ele
  // ficaria eternamente na fila de candidatos, pulado item a item pelo guard
  // `now > dateTime` — correto no fim, mas varrendo lixo em todo run.
  where: {
    confirmationSentAt: null,
    status: "PENDING",
    retroactive: false,
    user: { whatsappStatus: "CONNECTED" },
  },
  hoursBeforeOf: (s) => s.confirmationHoursBefore,
  templateOf: (s) => s.confirmationMessage,
  sentAtField: "confirmationSentAt",
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

      // Mensagem de confirmação com o LINK (Feature "Confirmação por link"). O
      // template guardado é só o corpo; o bloco do link + prazo é anexado aqui.
      // Token assinado com exp = deadline EFETIVO (com piso de GRACE p/ envio
      // tardio) — o MESMO cálculo que `autoCancelUnconfirmed` usa p/ cancelar.
      const deadlineMs = effectiveDeadlineMs(
        appointment.dateTime,
        settings.reminderHoursBefore,
        now.getTime(),
      );
      const deadlineDate = new Date(deadlineMs);
      const url = `${appBaseUrl()}/confirmar/${makeConfirmationToken(appointment.id, deadlineMs)}`;
      const deadlineLabel = `${formatAppointmentDate(deadlineDate)} às ${formatAppointmentTime(deadlineDate)}`;
      const message = formatMessage(
        withConfirmationLink(kind.templateOf(settings), { url, deadlineLabel }),
        {
          nome: appointment.patient.name,
          data: formatAppointmentDate(appointment.dateTime),
          hora: formatAppointmentTime(appointment.dateTime),
          clinica: appointment.user.clinicName,
        },
      );

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
        stats.confirmationsSent++;

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
      // `retroactive: false` é o que faz o "Retroativo" significar algo: um
      // agendamento LANÇADO no passado (registro de organização) não é uma falta
      // — sem esse filtro o cron o viraria NO_SHOW em até 30 min e corromperia a
      // taxa de faltas, que é o produto. Ver features/appointments.md § Retroativo.
      where: { dateTime: { lt: new Date() }, status: "PENDING", retroactive: false },
      data: { status: "NO_SHOW" },
    });
    stats.noShowsMarked = result.count;
  } catch (error) {
    console.error("Error in markNoShows:", error);
  }
}

/**
 * Auto-cancelamento no deadline (Feature "Confirmação por link"). Quem recebeu
 * o link (`confirmationSentAt != null`), ainda está `PENDING` e já passou do
 * **deadline efetivo** (`effectiveDeadlineMs`, o mesmo do `exp` do token) é
 * **cancelado**. Substitui o antigo `sendReminders`: não há mais lembrete-nudge;
 * o prazo comunicado na mensagem de confirmação passa a ser real.
 *
 * NÃO envia mensagem de cortesia (decisão pós-code-review): (1) o paciente já
 * foi avisado do prazo na própria mensagem de confirmação; (2) um envio aqui
 * furava a cota e não gerava `MessageLog` (ao contrário de todo outbound); (3)
 * `await` serial de 8s por item estrangulava a vazão do cron. Sem envio, o
 * cancelamento é só update + audit (rápido). Cancelados saem do filtro.
 *
 * Deadline é por-tenant (`reminderHoursBefore`) + piso de GRACE por-appointment
 * (do `confirmationSentAt`), então varremos em lotes e checamos por-item.
 */
async function autoCancelUnconfirmed(deadline: number, stats: SchedulerStats): Promise<void> {
  const skippedIds: string[] = [];

  while (Date.now() < deadline) {
    const now = new Date();
    const appointments = await prisma.appointment.findMany({
      where: {
        confirmationSentAt: { not: null },
        status: "PENDING",
        dateTime: { gt: now },
        ...(skippedIds.length ? { id: { notIn: skippedIds } } : {}),
      },
      // Sem envio de mensagem → só precisa de reminderHoursBefore (settings) +
      // os scalars confirmationSentAt/dateTime (não precisa de patient).
      include: { user: { include: { settings: true } } },
      orderBy: { dateTime: "asc" },
      take: BATCH_SIZE,
    });
    if (appointments.length === 0) return;

    for (const appointment of appointments) {
      if (Date.now() >= deadline) {
        stats.truncated = true;
        return;
      }

      const settings = appointment.user.settings;
      if (!settings || !appointment.confirmationSentAt) {
        skippedIds.push(appointment.id);
        continue;
      }

      // Deadline efetivo a partir do confirmationSentAt gravado (MESMA fórmula
      // do envio → bate com o exp do token). Ainda no prazo → próximo run.
      const effectiveDeadline = effectiveDeadlineMs(
        appointment.dateTime,
        settings.reminderHoursBefore,
        appointment.confirmationSentAt.getTime(),
      );
      if (Date.now() < effectiveDeadline) {
        skippedIds.push(appointment.id);
        continue;
      }

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELED" },
      });
      stats.autoCanceled++;

      await audit({
        action: "appointment.auto_canceled",
        entityType: "Appointment",
        entityId: appointment.id,
        tenantUserId: appointment.userId,
        metadata: { reason: "no_confirmation" },
      });
    }

    if (appointments.length < BATCH_SIZE) return;
  }
  stats.truncated = true;
}

export async function runSchedulerJobs(): Promise<SchedulerStats> {
  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;
  const quotaCache: QuotaCache = new Map();
  const stats: SchedulerStats = {
    confirmationsSent: 0,
    autoCanceled: 0,
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
    accountsPurged: 0,
  };

  try {
    await processSends(CONFIRMATION, deadline, quotaCache, stats);
  } catch (error) {
    console.error("Error in sendConfirmations:", error);
  }
  try {
    await autoCancelUnconfirmed(deadline, stats);
  } catch (error) {
    console.error("Error in autoCancelUnconfirmed:", error);
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

  // Purga LGPD (Sprint 11): apaga dados de pacientes de contas soft-deleted há
  // mais de 30 dias. Best-effort, try/catch isolado.
  try {
    const { runAccountPurge } = await import("@/lib/account/account-purge");
    const p = await runAccountPurge();
    stats.accountsPurged = p.accountsPurged;
  } catch (err) {
    console.error("account-purge failed:", err);
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
