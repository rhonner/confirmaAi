import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  forbiddenResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { BETA_OVERRIDE_UNTIL } from "@/lib/billing";
import type { ApiResponse } from "@/lib/types/api";

// Override "beta tester / cortesia" (Sprint 12): liga entitlements de PREMIUM
// SEM tocar em plan/status/providerSubscriptionId — ou seja, sem efeito nenhum
// na cobrança (ver `effectivePlanTier`). Desligar reverte na hora.
// Gated por allowlist de email (ADMIN_EMAILS), defense-in-depth com o layout.
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1),
  enable: z.boolean(),
  reason: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();
    if (!isAdminEmail(session.user.email)) return forbiddenResponse();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequestResponse(parsed.error.issues[0].message);
    const { userId, enable, reason } = parsed.data;

    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (!sub) return notFoundResponse("Assinatura não encontrada para esse usuário");

    const updated = await prisma.subscription.update({
      where: { userId },
      data: enable
        ? { adminOverrideUntil: BETA_OVERRIDE_UNTIL, adminOverrideReason: reason ?? "beta_tester" }
        : { adminOverrideUntil: null, adminOverrideReason: null },
    });

    await audit({
      action: enable ? "admin.override_set" : "admin.override_cleared",
      entityType: "Subscription",
      entityId: updated.id,
      tenantUserId: userId,
      metadata: {
        until: enable ? BETA_OVERRIDE_UNTIL.toISOString() : null,
        reason: enable ? (reason ?? "beta_tester") : null,
      },
      // Atribui a ação ao admin (a auto-auditoria da extension fica como SYSTEM).
      contextOverride: { actorType: "ADMIN", actorId: session.user.id },
    });

    return NextResponse.json<ApiResponse<{ userId: string; adminOverride: boolean }>>({
      data: { userId, adminOverride: enable },
    });
  } catch (error) {
    console.error("admin/override error:", error);
    return serverErrorResponse();
  }
}
