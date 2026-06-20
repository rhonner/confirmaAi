import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, unauthorizedResponse, serverErrorResponse } from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import { buildAccountExport } from "@/lib/account/export";

/**
 * GET /api/account/export — portabilidade LGPD. Baixa TODOS os dados do tenant
 * em JSON (escopado por userId). NÃO é pago (direito legal, não feature do plano).
 */
export const GET = auditWrap(async (_request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const data = await buildAccountExport(session.user.id);

    await audit({
      action: "account.exported",
      tenantUserId: session.user.id,
      metadata: {
        patients: data.patients.length,
        appointments: data.appointments.length,
      },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="clinica-organizada-dados-${stamp}.json"`,
      },
    });
  } catch (error) {
    console.error("account/export error:", error);
    return serverErrorResponse();
  }
});
