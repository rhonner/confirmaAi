import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { captureError } from "@/lib/observability";

/**
 * Purga 30d (Sprint 11 / LGPD): contas soft-deleted (`deletedAt`) têm os dados
 * de pacientes mantidos por uma janela de carência de 30 dias e então APAGADOS
 * definitivamente. Roda no cron (`runSchedulerJobs`), best-effort.
 *
 * O `User` permanece (anonimizado, `deletedAt` setado) — trilha de audit/FK; só
 * os dados de pacientes (PatientQuotaSlot + Patient → cascade Appointment/MessageLog)
 * são removidos. `patientsPurgedAt` marca o que já foi purgado (idempotência).
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const PURGE_GRACE_DAYS = 30;

/** Pura: a conta soft-deleted já passou da carência e ainda não foi purgada? */
export function isPatientPurgeDue(input: {
  deletedAt: Date | null;
  patientsPurgedAt: Date | null;
  now: Date;
  graceDays?: number;
}): boolean {
  if (!input.deletedAt || input.patientsPurgedAt) return false;
  const graceMs = (input.graceDays ?? PURGE_GRACE_DAYS) * DAY_MS;
  return input.now.getTime() - input.deletedAt.getTime() >= graceMs;
}

export async function runAccountPurge(now: Date = new Date()): Promise<{ accountsPurged: number }> {
  let accountsPurged = 0;
  try {
    const cutoff = new Date(now.getTime() - PURGE_GRACE_DAYS * DAY_MS);
    const due = await prisma.user.findMany({
      where: { deletedAt: { lt: cutoff }, patientsPurgedAt: null },
      select: { id: true },
    });
    for (const u of due) {
      try {
        const patientsDeleted = await prisma.$transaction(
          async (tx) => {
            await tx.patientQuotaSlot.deleteMany({ where: { userId: u.id } });
            const p = await tx.patient.deleteMany({ where: { userId: u.id } });
            await tx.user.update({ where: { id: u.id }, data: { patientsPurgedAt: now, patientSlotCount: 0 } });
            return p.count;
          },
          { isolationLevel: "Serializable" },
        );
        accountsPurged++;
        await audit({
          action: "account.purged",
          tenantUserId: u.id,
          entityType: "User",
          entityId: u.id,
          metadata: { patientsDeleted },
        });
      } catch (err) {
        await captureError(err, { area: "cron", tenantUserId: u.id, extra: { stage: "account-purge" } });
      }
    }
  } catch (err) {
    console.error("account-purge sweep failed:", err);
  }
  return { accountsPurged };
}
