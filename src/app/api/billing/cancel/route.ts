import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import type { ApiResponse } from "@/lib/types/api";

/**
 * Cancela a assinatura atual ao FIM do ciclo (não imediato — usuário continua
 * com benefícios até `currentPeriodEnd`). O cron diário de billing-maintenance
 * detecta e faz o downgrade efetivo.
 *
 * Em produção, também precisa cancelar no provider (Asaas) — TBD em Sprint 5
 * extension. Por ora, marca local.
 */
export const POST = auditWrap(async (_req: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const sub = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
    });
    if (!sub) return badRequestResponse("Sem assinatura");
    if (sub.plan === "FREE") return badRequestResponse("Plano Free não pode ser cancelado");

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true, status: "CANCELED" },
    });

    await audit({
      action: "subscription.canceled",
      tenantUserId: session.user.id,
      entityType: "Subscription",
      entityId: sub.id,
      metadata: { plan: sub.plan, currentPeriodEnd: sub.currentPeriodEnd },
    });

    return NextResponse.json<ApiResponse<{ canceled: true; periodEnd: string | null }>>({
      data: { canceled: true, periodEnd: sub.currentPeriodEnd?.toISOString() ?? null },
      message: "Assinatura cancelada. Você mantém o acesso até o fim do ciclo.",
    });
  } catch (error) {
    console.error("cancel error:", error);
    return serverErrorResponse();
  }
});
