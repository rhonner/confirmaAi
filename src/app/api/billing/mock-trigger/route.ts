import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  forbiddenResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { auditWrap } from "@/lib/audit";
import { MockProvider } from "@/lib/billing";

/**
 * Endpoint dev-only que dispara um webhook fake como se viesse do MockProvider.
 * Útil pra exercitar todo o lifecycle (checkout → ACTIVE → PAST_DUE → CANCELED)
 * sem provider real. **Bloqueado em produção.**
 *
 * Body: { event: "PAYMENT_RECEIVED" | "PAYMENT_OVERDUE" | "SUBSCRIPTION_DELETED" }
 *
 * Resolve a subscription do user logado, monta um payload Asaas-shaped e
 * chama o próprio webhook do app via fetch (com HMAC válido do MockProvider).
 */
export const POST = auditWrap(async (request: NextRequest) => {
  if (process.env.NODE_ENV === "production") {
    return forbiddenResponse();
  }

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const event = (body as { event?: string }).event ?? "PAYMENT_RECEIVED";

    const sub = await prisma.subscription.findUnique({
      where: { userId: session.user.id },
    });
    if (!sub?.providerSubscriptionId || !sub.providerCustomerId) {
      return NextResponse.json(
        { error: "Crie um checkout primeiro pra ter providerSubscriptionId" },
        { status: 400 },
      );
    }

    const targetPlan =
      (body as { plan?: "PRO" | "PREMIUM" }).plan ??
      (sub.plan === "FREE" ? "PRO" : sub.plan);

    const fakePayload = {
      id: `mock_evt_${Date.now()}`,
      event,
      payment: {
        id: `mock_pay_${Date.now()}`,
        customer: sub.providerCustomerId,
        subscription: sub.providerSubscriptionId,
        status: event === "PAYMENT_RECEIVED" ? "RECEIVED" : event === "PAYMENT_OVERDUE" ? "OVERDUE" : undefined,
        nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString().slice(0, 10),
      },
      subscription: {
        id: sub.providerSubscriptionId,
        externalReference: `${session.user.id}:${targetPlan}`,
      },
    };
    const rawBody = JSON.stringify(fakePayload);
    const signature = new MockProvider().signForMock(rawBody);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const r = await fetch(`${appUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-signature": signature,
      },
      body: rawBody,
    });

    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      body: await r.json().catch(() => null),
    });
  } catch (error) {
    console.error("mock-trigger error:", error);
    return serverErrorResponse();
  }
});
