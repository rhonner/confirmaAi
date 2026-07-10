import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { check } from "@/lib/billing/entitlements";
import { hasWriteScope, isGoogleOAuthConfigured } from "@/lib/services/google/oauth";
import type { ApiResponse } from "@/lib/types/api";

type GcalStatusResponse = {
  /** Servidor tem as credenciais Google? `false` → UI esconde a feature. */
  configured: boolean;
  /** Plano do tenant permite a feature (PREMIUM)? */
  allowed: boolean;
  status: "DISCONNECTED" | "CONNECTED" | "NEEDS_RECONSENT";
  googleAccountEmail: string | null;
  connectedAt: string | null;
  /** Fase C: espelhamento app→Google ativo (conectado + escopo de escrita + plano). */
  mirrorActive: boolean;
  /** Fase C: conectado mas grant só-leitura (legado) → reconectar p/ ativar o espelhamento. */
  needsWriteReconsent: boolean;
};

/**
 * GET /api/integrations/google-calendar/status — estado da conexão para o
 * card em /configuracoes. Não sonda o Google (rápido); problemas de grant
 * aparecem via NEEDS_RECONSENT persistido pelo fetch de eventos.
 */
export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const [decision, conn] = await Promise.all([
      check(userId, "gcal.connect"),
      prisma.googleCalendarConnection.findUnique({
        where: { userId },
        select: {
          status: true,
          scopes: true,
          googleAccountEmail: true,
          connectedAt: true,
        },
      }),
    ]);

    // REVOKED = desconectado do ponto de vista do usuário (linha só existe
    // para retentar a revogação do grant).
    const status: GcalStatusResponse["status"] =
      !conn || conn.status === "REVOKED"
        ? "DISCONNECTED"
        : conn.status === "NEEDS_RECONSENT"
          ? "NEEDS_RECONSENT"
          : "CONNECTED";

    const hasWrite = conn ? hasWriteScope(conn.scopes) : false;

    return NextResponse.json<ApiResponse<GcalStatusResponse>>({
      data: {
        configured: isGoogleOAuthConfigured(),
        allowed: decision.allowed,
        status,
        googleAccountEmail: status === "DISCONNECTED" ? null : (conn?.googleAccountEmail ?? null),
        connectedAt:
          status === "DISCONNECTED" ? null : (conn?.connectedAt?.toISOString() ?? null),
        mirrorActive: status === "CONNECTED" && hasWrite && decision.allowed,
        needsWriteReconsent: status === "CONNECTED" && !hasWrite,
      },
    });
  } catch (error) {
    console.error("GET /api/integrations/google-calendar/status error:", error);
    return serverErrorResponse();
  }
}
