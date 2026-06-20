import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, withFixedActor } from "@/lib/audit";
import { getBillingProvider, eventToSubscriptionPatch, planTierFromPayload } from "@/lib/billing";
import { captureError } from "@/lib/observability";
import { sendPaymentConfirmedEmail } from "@/lib/emails/transactional";
import { formatInTimeZone, APP_TIMEZONE } from "@/lib/timezone";
import { ptBR } from "date-fns/locale";

const PLAN_LABEL: Record<string, string> = { PRO: "Pro", PREMIUM: "Premium", FREE: "Free" };

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

    // Resolve user via providerSubscriptionId (preferido) ou providerCustomerId.
    let userId: string | null = null;
    let storedSubId: string | null = null;
    if (event.providerSubscriptionId) {
      const sub = await prisma.subscription.findFirst({
        where: { providerSubscriptionId: event.providerSubscriptionId },
        select: { userId: true, providerSubscriptionId: true },
      });
      if (sub) { userId = sub.userId; storedSubId = sub.providerSubscriptionId; }
    }
    if (!userId && event.providerCustomerId) {
      const sub = await prisma.subscription.findFirst({
        where: { providerCustomerId: event.providerCustomerId },
        select: { userId: true, providerSubscriptionId: true },
      });
      if (sub) { userId = sub.userId; storedSubId = sub.providerSubscriptionId; }
    }

    // Evento "stale": refere-se a uma assinatura que NÃO é a atual do usuário —
    // tipicamente o echo de `SUBSCRIPTION_DELETED` da assinatura ANTIGA que o
    // checkout cancelou ao substituí-la (o checkout já reescreveu o row pro NEW).
    // Resolvido pelo fallback de customer, aplicaria CANCELED na assinatura NEW
    // (cancelaria um checkout fresco/pago). NÃO aplica o patch — só registra.
    const staleEvent =
      event.providerSubscriptionId != null &&
      storedSubId != null &&
      event.providerSubscriptionId !== storedSubId;

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

    // Evento stale (assinatura já substituída): registra e ignora o patch.
    if (userId && staleEvent) {
      await audit({
        action: "billing.webhook.stale_ignored",
        tenantUserId: userId,
        entityType: "Subscription",
        metadata: {
          eventType: event.eventType,
          providerEventId: event.providerEventId,
          eventSubscriptionId: event.providerSubscriptionId,
          currentSubscriptionId: storedSubId,
        },
      });
    }

    // Aplica mudança no Subscription, se houver patch derivável.
    if (userId && !staleEvent) {
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

          // Ativação do plano comprado (PAYMENT_RECEIVED) via externalReference.
          if (patch.status === "ACTIVE") {
            const planTier = planTierFromPayload(event.payload);
            if (planTier) {
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

          // Email "pagamento confirmado" — SÓ em ACTIVE, e em try/catch ISOLADO:
          // falha de email NÃO pode cair no catch externo (que marcaria
          // apply_failed / processedAt=null → /api/health acharia que travou).
          if (patch.status === "ACTIVE") {
            try {
              const sub = await prisma.subscription.findUnique({
                where: { userId },
                select: { plan: true, currentPeriodEnd: true, user: { select: { name: true, email: true } } },
              });
              if (sub?.user) {
                await sendPaymentConfirmedEmail({
                  to: sub.user.email,
                  name: sub.user.name,
                  planLabel: PLAN_LABEL[sub.plan] ?? sub.plan,
                  periodEndLabel: sub.currentPeriodEnd
                    ? formatInTimeZone(sub.currentPeriodEnd, APP_TIMEZONE, "dd/MM/yyyy", { locale: ptBR })
                    : undefined,
                });
              }
            } catch (emailErr) {
              await captureError(emailErr, {
                area: "webhook",
                tenantUserId: userId,
                extra: { stage: "payment_confirmed_email" },
              });
            }
          }
        } catch (err) {
          // Cliente pagou e o plano não subiu: alerta de receita, não só log.
          // O BillingEvent fica com processedAt=null → o /api/health também
          // acende depois de 1h se ninguém reconciliar.
          await captureError(err, {
            area: "webhook",
            tenantUserId: userId,
            extra: {
              eventType: event.eventType,
              providerEventId: event.providerEventId,
              billingEventId: billingEventRecord.id,
            },
          });
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
