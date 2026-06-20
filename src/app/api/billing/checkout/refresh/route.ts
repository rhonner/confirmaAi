import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
import type { CheckoutResponse } from "../route";

const bodySchema = z.object({
  plan: z.enum(["PRO", "PREMIUM"]),
});

/**
 * Regenera o QR Pix quando o TTL curto do checkout expira. REUSA a assinatura
 * existente (`providerSubscriptionId`) — NÃO cria assinatura nova (senão recria
 * o bug de duplicação). Re-busca a cobrança Pix pendente da recorrência e
 * devolve um `expiresAt` curto novo. Ver `src/lib/billing/pix-ttl.ts`.
 */
export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequestResponse(parsed.error.issues[0].message);
    const { plan } = parsed.data;

    const sub = await prisma.subscription.findUnique({ where: { userId: session.user.id } });
    if (!sub?.providerSubscriptionId || !sub.providerCustomerId) {
      return badRequestResponse("Inicie o checkout antes de gerar um novo QR.");
    }
    if (sub.plan === plan && sub.status === "ACTIVE") {
      return badRequestResponse("Você já está nesse plano");
    }

    const provider = getBillingProvider();
    const result = await provider.refreshPixCharge({
      providerSubscriptionId: sub.providerSubscriptionId,
      customerId: sub.providerCustomerId,
      plan,
      userId: session.user.id,
    });

    await audit({
      action: "billing.checkout.qr_refreshed",
      tenantUserId: session.user.id,
      entityType: "Subscription",
      entityId: sub.id,
      metadata: {
        plan,
        providerSubscriptionId: sub.providerSubscriptionId,
        expiresAt: result.expiresAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json<ApiResponse<CheckoutResponse>>({
      data: {
        sessionId: result.sessionId,
        qrCodeBase64: result.qrCodeBase64 ?? null,
        qrCodePayload: result.qrCodePayload ?? null,
        paymentUrl: result.paymentUrl ?? null,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        plan,
        method: "PIX",
        provider: provider.name,
      },
    });
  } catch (error) {
    console.error("checkout/refresh error:", error);
    return serverErrorResponse();
  }
});
