import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import { resetEligibility, resetBlockMessage } from "@/lib/account/reset-eligibility";
import type { ApiResponse } from "@/lib/types/api";

/**
 * Reset de conta Free (1× vitalício). Apaga TODOS os Patient do tenant (cascade
 * remove Appointment + MessageLog) e TODOS os PatientQuotaSlot (zera a vaga
 * vitalícia), e zera `User.patientSlotCount`. Gateado por `resetEligibility`
 * (FREE + 0 agendamentos + não-usado-antes). Tudo escopado por `userId` da
 * sessão — nenhum `deleteMany` roda sem o filtro de tenant.
 */
export const POST = auditWrap(async (_req: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const [sub, appointmentCount, priorResetCount] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId }, select: { plan: true } }),
      prisma.appointment.count({ where: { userId } }),
      prisma.auditLog.count({ where: { tenantUserId: userId, action: "account.reset" } }),
    ]);

    const eligibility = resetEligibility({
      plan: sub?.plan ?? "FREE",
      appointmentCount,
      priorResetCount,
    });

    if (!eligibility.allowed) {
      await audit({
        action: "account.reset_blocked",
        tenantUserId: userId,
        metadata: { reason: eligibility.reason, appointmentCount, priorResetCount },
      });
      return badRequestResponse(resetBlockMessage(eligibility.reason));
    }

    // Limpeza atômica. Slots ANTES de Patient (evita o SetNull no FK
    // PatientQuotaSlot.patientId); patient.deleteMany cascateia Appointment +
    // MessageLog (onDelete: Cascade no schema).
    const result = await prisma.$transaction(
      async (tx) => {
        const slotsDeleted = (await tx.patientQuotaSlot.deleteMany({ where: { userId } })).count;
        const patientsDeleted = (await tx.patient.deleteMany({ where: { userId } })).count;
        await tx.user.update({ where: { id: userId }, data: { patientSlotCount: 0 } });
        return { slotsDeleted, patientsDeleted };
      },
      { isolationLevel: "Serializable" },
    );

    await audit({
      action: "account.reset",
      tenantUserId: userId,
      entityType: "User",
      entityId: userId,
      metadata: { patientsDeleted: result.patientsDeleted, slotsDeleted: result.slotsDeleted },
    });

    return NextResponse.json<ApiResponse<{ patientsDeleted: number; slotsDeleted: number }>>({
      data: result,
      message: "Conta resetada com sucesso. Suas vagas de paciente foram liberadas.",
    });
  } catch (error) {
    console.error("account/reset error:", error);
    return serverErrorResponse();
  }
});
