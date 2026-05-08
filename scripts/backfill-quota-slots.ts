/**
 * Backfill idempotente de PatientQuotaSlot a partir dos Patients existentes.
 *
 * Quando rodar:
 * - Após aplicar a migration `20260507142334_add_patient_quota_slots`
 *   (Sprint 2). Em dev: `npm run db:migrate` cria a tabela vazia; este script
 *   popula. Em prod: rodar **uma vez** após o deploy da migration.
 *
 * Como rodar:
 *   npx tsx scripts/backfill-quota-slots.ts
 *
 * Idempotente: re-rodar não duplica slots (constraint unique faz no-op).
 * Atualiza User.patientSlotCount no final. Emite audit `patient_quota.backfill`.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPhone } from "../src/lib/billing/identifiers";
import { audit } from "../src/lib/audit";

async function main() {
  const patients = await prisma.patient.findMany({
    select: { id: true, userId: true, phoneCanonical: true },
  });
  console.log(`processing ${patients.length} patients`);

  let created = 0;
  let skipped = 0;

  for (const p of patients) {
    if (!p.phoneCanonical) continue;
    const hash = hashPhone(p.phoneCanonical);
    try {
      await prisma.patientQuotaSlot.create({
        data: {
          userId: p.userId,
          identifierType: "PHONE",
          identifierHash: hash,
          patientId: p.id,
        },
      });
      created++;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") skipped++;
      else throw e;
    }
  }

  const groups = await prisma.patientQuotaSlot.groupBy({
    by: ["userId"],
    _count: { _all: true },
  });
  for (const g of groups) {
    await prisma.user.update({
      where: { id: g.userId },
      data: { patientSlotCount: g._count._all },
    });
  }

  await audit({
    action: "patient_quota.backfill",
    entityType: "PatientQuotaSlot",
    metadata: {
      reason: "migration_20260507142334",
      patientsScanned: patients.length,
      slotsCreated: created,
      slotsSkipped: skipped,
      usersUpdated: groups.length,
    },
    contextOverride: { actorType: "SYSTEM", actorId: "backfill-script" },
  });

  console.log(
    JSON.stringify(
      { patientsScanned: patients.length, created, skipped, usersUpdated: groups.length },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
