import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import { getBillingProvider } from "@/lib/billing";
import type { ApiResponse } from "@/lib/types/api";

export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const sub = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
    });

    if (!sub?.providerCustomerId) {
      return badRequestResponse("Sem assinatura paga ativa");
    }

    const provider = getBillingProvider();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const portal = await provider.createPortalSession({
      providerCustomerId: sub.providerCustomerId,
      returnUrl: `${appUrl}/billing`,
    });

    await audit({
      action: "billing.portal.opened",
      tenantUserId: session.user.id,
      entityType: "Subscription",
      entityId: sub.id,
    });

    return NextResponse.json<ApiResponse<{ url: string }>>({ data: portal });
  } catch (error) {
    console.error("portal error:", error);
    return serverErrorResponse();
  }
});
