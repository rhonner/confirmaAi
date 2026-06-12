import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { allIdentifiers, hashCpf, primaryIdentifier } from "./identifiers";
import { PLANS } from "./plans";
import type {
  IdentifierType,
  PatientQuotaSlot,
  PlanTier,
  Prisma,
} from "@/generated/prisma/client";

export type PatientIdentifierInput = {
  cpf?: string | null;
  phone: string;
};

export type ReserveResult =
  | { ok: true; slot: PatientQuotaSlot; reused: boolean }
  | { ok: false; reason: "QUOTA_EXCEEDED"; plan: PlanTier; current: number; limit: number };

/**
 * Cliente de transação Prisma. Tipado de forma compatível com a extension de
 * audit (que envolve o $transaction normal).
 */
type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Reserva (ou reaproveita) um PatientQuotaSlot **dentro de uma transação**.
 *
 * Algoritmo:
 * 1. Match em qualquer identificador conhecido (CPF e/ou phone) já em
 *    PatientQuotaSlot do tenant.
 *    - Match com `patientId IS NOT NULL` e diferente do novo → conflito.
 *    - Match com `patientId IS NULL` (órfão) → reusa, atribui patientId.
 *    - Sem match → cria slot novo, sujeito ao quota check.
 * 2. Atualiza `User.patientSlotCount` se for slot novo.
 *
 * **Caller deve usar `prisma.$transaction(... , { isolationLevel: "Serializable" })`**
 * para evitar race no 5º/6º paciente.
 */
export async function reserveSlotInTx(
  tx: TxClient,
  userId: string,
  identifier: PatientIdentifierInput,
  newPatientId: string,
): Promise<ReserveResult> {
  const sub = await tx.subscription.findUnique({ where: { userId } });
  const planTier: PlanTier = sub?.plan ?? "FREE";
  const plan = PLANS[planTier];

  const candidates = allIdentifiers(identifier);
  const primary = primaryIdentifier(identifier);

  const matches = candidates.length
    ? await tx.patientQuotaSlot.findMany({
        where: {
          userId,
          identifierHash: { in: candidates.map((c) => c.hash) },
        },
      })
    : [];

  const occupied = matches.find(
    (s) => s.patientId !== null && s.patientId !== newPatientId,
  );
  if (occupied) throw new SlotConflictError(occupied.identifierType);

  const orphan = matches.find((s) => s.patientId === null);
  if (orphan) {
    const updated = await tx.patientQuotaSlot.update({
      where: { id: orphan.id },
      data: { patientId: newPatientId },
    });
    await audit({
      action: "quota.patient_reused",
      entityType: "PatientQuotaSlot",
      entityId: updated.id,
      tenantUserId: userId,
      metadata: { plan: planTier, identifierType: updated.identifierType },
    });
    return { ok: true, slot: updated, reused: true };
  }

  if (plan.patientSlots !== null) {
    const current = await tx.patientQuotaSlot.count({ where: { userId } });
    if (current >= plan.patientSlots) {
      await audit({
        action: "quota.patient_blocked",
        tenantUserId: userId,
        metadata: { plan: planTier, current, limit: plan.patientSlots },
      });
      return {
        ok: false,
        reason: "QUOTA_EXCEEDED",
        plan: planTier,
        current,
        limit: plan.patientSlots,
      };
    }
  }

  const created = await tx.patientQuotaSlot.create({
    data: {
      userId,
      identifierType: primary.type,
      identifierHash: primary.hash,
      patientId: newPatientId,
    },
  });

  await tx.user.update({
    where: { id: userId },
    data: { patientSlotCount: { increment: 1 } },
  });

  return { ok: true, slot: created, reused: false };
}

/**
 * Quando um Patient é editado e ganha CPF (slot original era PHONE),
 * promove o slot para CPF — preserva a vaga histórica mas atualiza o
 * identifier para o mais forte. Não muda contagem.
 *
 * Use **fora** de transação ou passe `tx` se já estiver dentro.
 */
export async function attachCpfToExistingSlot(
  client: TxClient | typeof prisma,
  userId: string,
  patientId: string,
  cpf: string,
): Promise<void> {
  const slot = await client.patientQuotaSlot.findUnique({ where: { patientId } });
  if (!slot) return;
  if (slot.identifierType === "CPF") return;

  const newHash = hashCpf(cpf);
  const collision = await client.patientQuotaSlot.findUnique({
    where: { userId_identifierHash: { userId, identifierHash: newHash } },
  });
  if (collision) return;

  await client.patientQuotaSlot.update({
    where: { id: slot.id },
    data: { identifierType: "CPF", identifierHash: newHash },
  });

  await audit({
    action: "quota.slot_promoted_to_cpf",
    entityType: "PatientQuotaSlot",
    entityId: slot.id,
    tenantUserId: userId,
    metadata: { previousType: "PHONE" satisfies IdentifierType },
  });
}

export class SlotConflictError extends Error {
  constructor(public identifierType: IdentifierType) {
    super("Paciente já existe com esse identificador");
  }
}
