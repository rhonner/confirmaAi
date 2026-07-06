import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { decryptToken } from "@/lib/services/google/token-crypto";
import { revokeGoogleGrant } from "@/lib/services/google/revoke";
import type { ApiResponse } from "@/lib/types/api";

type DisconnectResponse = { disconnected: true; revoked: boolean };

/**
 * POST /api/integrations/google-calendar/disconnect — desconecta a agenda.
 * Revoga o grant no Google (best-effort) e:
 * - revoke OK → apaga a linha (tokens somem do banco);
 * - revoke falhou → marca REVOKED e MANTÉM o token cifrado, para que um
 *   futuro connect/teardown possa retentar a revogação — a UI já trata
 *   REVOKED como desconectado. `revoked:false` na resposta permite ao card
 *   orientar o usuário a revogar também em myaccount.google.com/permissions.
 * Idempotente: sem conexão, responde sucesso.
 */
export const POST = auditWrap(async (_request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    const userId = session.user.id;

    const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
    if (!conn) {
      return NextResponse.json<ApiResponse<DisconnectResponse>>({
        data: { disconnected: true, revoked: true },
      });
    }

    let revoked = false;
    let tokenUnreadable = false;
    try {
      const refreshToken = decryptToken(conn.refreshTokenEnc);
      revoked = await revokeGoogleGrant(refreshToken);
    } catch (err) {
      // Blob ilegível (chave rotacionada/corrompida): não há o que revogar
      // com esse token — remover a linha é o único teardown possível. MAS o
      // grant continua vivo no Google: reportar `revoked:false` para a UI
      // orientar a revogação manual (não mentir que revogou).
      tokenUnreadable = true;
      await captureError(err, {
        area: "request",
        tenantUserId: userId,
        extra: { route: "gcal/disconnect/decrypt" },
      });
    }

    if (revoked || tokenUnreadable) {
      await prisma.googleCalendarConnection.delete({ where: { userId } });
    } else {
      // Revoke falhou (rede/Google fora): mantém o token cifrado para um
      // retry futuro (connect/teardown); UI trata REVOKED como desconectado.
      await prisma.googleCalendarConnection.update({
        where: { userId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          lastError: "revoke falhou no disconnect — retentar em connect/teardown",
        },
      });
    }

    await audit({
      action: "gcal.disconnected",
      tenantUserId: userId,
      entityType: "GoogleCalendarConnection",
      entityId: userId,
      metadata: { revoked, tokenUnreadable },
    });

    return NextResponse.json<ApiResponse<DisconnectResponse>>({
      data: { disconnected: true, revoked },
    });
  } catch (error) {
    console.error("POST /api/integrations/google-calendar/disconnect error:", error);
    return serverErrorResponse();
  }
});
