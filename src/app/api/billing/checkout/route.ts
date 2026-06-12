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
import { getBillingProvider, getPlanConfig } from "@/lib/billing";
import type { ApiResponse } from "@/lib/types/api";
import type { PlanTier } from "@/generated/prisma/client";

const bodySchema = z.object({
  plan: z.enum(["PRO", "PREMIUM"]),
  method: z.enum(["PIX", "CREDIT_CARD"]),
});

export type CheckoutResponse = {
  sessionId: string;
  qrCodeBase64: string | null;
  qrCodePayload: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  plan: PlanTier;
  method: "PIX" | "CREDIT_CARD";
};

export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0].message);
    }
    const { plan, method } = parsed.data;

    // Plano oculto da venda (ex: PREMIUM até as features existirem) não pode
    // ser assinado nem por URL direta.
    if (getPlanConfig(plan).hidden) {
      return badRequestResponse("Plano indisponível no momento");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, cpf: true },
    });
    if (!user) return unauthorizedResponse();

    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (sub?.plan === plan && sub.status === "ACTIVE") {
      return badRequestResponse("Você já está nesse plano");
    }

    const provider = getBillingProvider();

    // Cria customer (1ª vez) ou reusa providerCustomerId existente
    let customerId = sub?.providerCustomerId;
    if (!customerId) {
      const created = await provider.createCustomer({
        userId: user.id,
        email: user.email,
        name: user.name,
        cpf: user.cpf,
      });
      customerId = created.providerCustomerId;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const checkout = await provider.createCheckout({
      userId: user.id,
      customerId,
      plan,
      method,
      returnUrl: `${appUrl}/billing/sucesso`,
    });

    // Persiste/atualiza Subscription com providerCustomerId + providerSubscriptionId
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        providerCustomerId: customerId,
        providerSubscriptionId: checkout.sessionId,
        provider: provider.name,
        // Não muda status aqui — só após webhook PAYMENT_RECEIVED
      },
      create: {
        userId: user.id,
        plan: "FREE",
        status: "ACTIVE",
        provider: provider.name,
        providerCustomerId: customerId,
        providerSubscriptionId: checkout.sessionId,
      },
    });

    await audit({
      action: "billing.checkout.created",
      tenantUserId: user.id,
      entityType: "Subscription",
      entityId: sub?.id ?? null,
      metadata: {
        plan,
        method,
        sessionId: checkout.sessionId,
        provider: provider.name,
      },
    });

    return NextResponse.json<ApiResponse<CheckoutResponse>>({
      data: {
        sessionId: checkout.sessionId,
        qrCodeBase64: checkout.qrCodeBase64 ?? null,
        qrCodePayload: checkout.qrCodePayload ?? null,
        paymentUrl: checkout.paymentUrl ?? null,
        expiresAt: checkout.expiresAt?.toISOString() ?? null,
        plan,
        method,
      },
    });
  } catch (error) {
    console.error("checkout error:", error);
    return serverErrorResponse();
  }
});
