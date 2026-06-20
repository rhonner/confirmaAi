import { prisma } from "@/lib/prisma";
import { actionLabel } from "@/lib/audit/labels";

/**
 * Monta o export de TODOS os dados do tenant (LGPD — portabilidade). Tudo
 * escopado por `userId`. OMITE segredos/PII derivada: senha, hashes (cpfHash,
 * identifierHash), tokens de verificação, QR base64, phoneCanonical. O AuditLog
 * vai resumido (sem before/after/metadata — podem conter PII de terceiros).
 * BillingEvent (payloads crus do Asaas) fica fora.
 */
export async function buildAccountExport(userId: string) {
  const [user, settings, patients, appointments, messageLogs, subscription, usageCounters, auditRows] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          clinicName: true,
          avgAppointmentValue: true,
          cpf: true,
          createdAt: true,
          termsAcceptedAt: true,
          termsVersion: true,
          privacyAcceptedAt: true,
        },
      }),
      prisma.settings.findUnique({
        where: { userId },
        select: {
          confirmationHoursBefore: true,
          reminderHoursBefore: true,
          confirmationMessage: true,
          reminderMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.patient.findMany({
        where: { userId },
        select: { id: true, name: true, phone: true, email: true, cpf: true, notes: true, archivedAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: { userId },
        select: {
          id: true,
          patientId: true,
          dateTime: true,
          durationMinutes: true,
          status: true,
          notes: true,
          confirmationSentAt: true,
          reminderSentAt: true,
          confirmedAt: true,
          createdAt: true,
        },
        orderBy: { dateTime: "asc" },
      }),
      prisma.messageLog.findMany({
        where: { appointment: { userId } },
        select: { id: true, appointmentId: true, type: true, status: true, sentAt: true, response: true, respondedAt: true },
        orderBy: { sentAt: "asc" },
      }),
      prisma.subscription.findUnique({
        where: { userId },
        select: { plan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, provider: true, createdAt: true },
      }),
      prisma.usageCounter.findMany({
        where: { userId },
        select: { periodStart: true, periodEnd: true, messagesSent: true, messagesIncluded: true },
        orderBy: { periodStart: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { tenantUserId: userId },
        select: { action: true, entityType: true, createdAt: true, actorType: true, ipAddress: true },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    account: user ? { ...user, avgAppointmentValue: Number(user.avgAppointmentValue) } : null,
    settings,
    subscription,
    usageCounters,
    patients,
    appointments,
    messageLogs,
    auditLog: auditRows.map((a) => ({ ...a, label: actionLabel(a.action) })),
  };
}
