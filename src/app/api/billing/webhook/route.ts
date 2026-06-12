import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, withFixedActor } from "@/lib/audit";
import { getBillingProvider, eventToSubscriptionPatch } from "@/lib/billing";

/**
 * Webhook do provider de cobrança (Asaas em prod, Mock em dev).
 *
 * Garantias:
 * - **HMAC obrigatório**: rejeita 401 + audit `billing.webhook.invalid_signature`.
 * - **Idempotência**: `BillingEvent.providerEventId @unique`. Re-receber o
 *   mesmo evento é no-op (P2002 → 200 ok sem reprocessar).
 * - **Sempre 200** após registrar (mesmo se o lifecycle der erro): provider
 *   re-tenta em 5xx, e queremos que pare de re-tentar uma vez gravado.
 *   Falhas de processamento ficam em `processedAt = null` para reconciliação.
 */
export const POST = withFixedActor(
  { actorType: "WEBHOOK", actorId: "billing" },
  async (request: NextRequest) => {
    const provider = getBillingProvider();
    const rawBody = await request.text();
    const signature =
      request.headers.get("asaas-access-token") ??
      request.headers.get("x-mock-signature") ??
      request.headers.get("x-signature");

    if (!provider.verifyWebhookSignature({ rawBody, signature })) {
      await audit({
        action: "billing.webhook.invalid_signature",
        metadata: {
          provider: provider.name,
          hasSignature: !!signature,
          ip: request.headers.get("x-forwarded-for"),
          bodyPreview: rawBody.slice(0, 200),
        },
      });
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let event;
    try {
      event = provider.parseEvent(rawBody);
    } catch (err) {
      await audit({
        action: "billing.webhook.parse_failed",
        metadata: { provider: provider.name, error: String(err).slice(0, 200) },
      });
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    // Resolve user via providerCustomerId (preferido) ou providerSubscriptionId.
    let userId: string | null = null;
    if (event.providerSubscriptionId) {
      const sub = await prisma.subscription.findFirst({
        where: { providerSubscriptionId: event.providerSubscriptionId },
        select: { userId: true },
      });
      userId = sub?.userId ?? null;
    }
    if (!userId && event.providerCustomerId) {
      const sub = await prisma.subscription.findFirst({
        where: { providerCustomerId: event.providerCustomerId },
        select: { userId: true },
      });
      userId = sub?.userId ?? null;
    }

    // Persiste BillingEvent (idempotência por providerEventId @unique).
    let billingEventRecord;
    try {
      billingEventRecord = await prisma.billingEvent.create({
        data: {
          provider: provider.name,
          eventType: event.eventType,
          providerEventId: event.providerEventId,
          payload: event.payload as never,
          userId,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "P2002") {
        // Evento já registrado — idempotência. Não reprocessa.
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw err;
    }

    // Aplica mudança no Subscription, se houver patch derivável.
    if (userId) {
      const patch = eventToSubscriptionPatch(event);
      if (Object.keys(patch).length > 0) {
        try {
          await prisma.subscription.update({
            where: { userId },
            data: {
              ...patch,
              // Plan vem de externalReference (parsed em outras passes; agora,
              // só atualiza se já existe no externalReference do payload)
            },
          });

          // Se evento é PAYMENT_RECEIVED e a subscription tem externalReference indicando o plan, atualiza.
          const payloadObj = event.payload as {
            subscription?: { externalReference?: string };
            externalReference?: string;
          };
          const ref = payloadObj.subscription?.externalReference ?? payloadObj.externalReference;
          if (ref && patch.status === "ACTIVE") {
            const [, planTier] = ref.split(":");
            if (planTier === "PRO" || planTier === "PREMIUM") {
              await prisma.subscription.update({
                where: { userId },
                data: { plan: planTier },
              });
            }
          }

          await audit({
            action: patch.status === "ACTIVE" ? "billing.payment.received"
                  : patch.status === "PAST_DUE" ? "billing.payment.failed"
                  : patch.status === "CANCELED" ? "subscription.canceled"
                  : "billing.webhook.processed",
            tenantUserId: userId,
            entityType: "Subscription",
            metadata: {
              eventType: event.eventType,
              providerEventId: event.providerEventId,
              patch,
            },
          });
        } catch (err) {
          console.error("[billing.webhook] failed to apply patch:", err);
          // Mantém o BillingEvent com processedAt=null pra reconciliação
          return NextResponse.json({ received: true, error: "apply_failed" });
        }
      }
    }

    await prisma.billingEvent.update({
      where: { id: billingEventRecord.id },
      data: { processedAt: new Date() },
    });

    return NextResponse.json({ received: true, processed: true });
  },
);
