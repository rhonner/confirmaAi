import { NextRequest, NextResponse } from "next/server";
import { audit, withFixedActor } from "@/lib/audit";
import { verifyEmailToken } from "@/lib/anti-fraud/email-verification";

/**
 * Verifica o token de email enviado no signup. Redireciona para uma página
 * de feedback (`/verificar-email?status=...`) — nunca retorna detalhes
 * técnicos no body para não vazar info sobre tokens existentes.
 */
export const GET = withFixedActor(
  { actorType: "ANONYMOUS" },
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

    if (!token) {
      return NextResponse.redirect(`${appUrl}/verificar-email?status=invalid`);
    }

    const result = await verifyEmailToken(token);
    if (!result.ok) {
      await audit({
        action: "auth.email_verify_failed",
        metadata: { reason: result.reason },
      });
      return NextResponse.redirect(
        `${appUrl}/verificar-email?status=${result.reason.toLowerCase()}`,
      );
    }

    await audit({
      action: "auth.email_verified",
      tenantUserId: result.userId,
      entityType: "User",
      entityId: result.userId,
    });

    return NextResponse.redirect(`${appUrl}/verificar-email?status=ok`);
  },
);
