import { addDays } from "date-fns";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PLANS } from "./plans";
import type {
  BillingProviderImpl,
  CreateCustomerInput,
  CreateCheckoutInput,
  CheckoutResult,
  ParsedEvent,
} from "./provider";

/**
 * Implementação real Asaas (Brasil-first, Pix nativo, NF-e integrada).
 *
 * Configuração via env:
 *   ASAAS_API_URL          # https://sandbox.asaas.com/api/v3 (sandbox) ou https://www.asaas.com/api/v3
 *   ASAAS_API_KEY          # access_token (header `access_token`)
 *   ASAAS_WEBHOOK_SECRET   # token enviado em `asaas-access-token` no webhook
 *   ASAAS_PRO_PLAN_ID      # ID do produto/preço Pro
 *   ASAAS_PREMIUM_PLAN_ID  # ID do produto/preço Premium
 *
 * **Não ativa por default em dev.** A fábrica em `index.ts` escolhe via
 * `BILLING_PROVIDER` env var.
 */

export class AsaasProvider implements BillingProviderImpl {
  readonly name = "ASAAS" as const;

  private get apiUrl() {
    return process.env.ASAAS_API_URL ?? "https://sandbox.asaas.com/api/v3";
  }
  private get apiKey() {
    const key = process.env.ASAAS_API_KEY;
    if (!key) throw new Error("ASAAS_API_KEY ausente");
    return key;
  }
  private get webhookSecret() {
    const s = process.env.ASAAS_WEBHOOK_SECRET;
    if (!s) throw new Error("ASAAS_WEBHOOK_SECRET ausente");
    return s;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        access_token: this.apiKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Asaas ${path} ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async createCustomer(input: CreateCustomerInput) {
    const r = await this.request<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpf?.replace(/\D/g, "") ?? undefined,
        externalReference: input.userId,
      }),
    });
    return { providerCustomerId: r.id };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const plan = PLANS[input.plan];
    const value = plan.priceMonthly / 100;
    const billingType = input.method === "PIX" ? "PIX" : "CREDIT_CARD";
    const nextDueDate = addDays(new Date(), 3).toISOString().slice(0, 10);

    // Asaas: cria Subscription (cobrança recorrente).
    const sub = await this.request<{ id: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: input.customerId,
        billingType,
        cycle: "MONTHLY",
        value,
        nextDueDate,
        description: `${plan.label} — ConfirmaAí`,
        externalReference: `${input.userId}:${input.plan}`,
      }),
    });

    // Para Pix, recupera a primeira cobrança e seu QR code.
    if (input.method === "PIX") {
      const payments = await this.request<{ data: Array<{ id: string }> }>(
        `/subscriptions/${sub.id}/payments`,
      );
      const firstPaymentId = payments.data?.[0]?.id;
      if (!firstPaymentId) {
        return { sessionId: sub.id, expiresAt: addDays(new Date(), 1) };
      }
      const pix = await this.request<{
        success: boolean;
        encodedImage: string;
        payload: string;
        expirationDate: string;
      }>(`/payments/${firstPaymentId}/pixQrCode`);
      return {
        sessionId: sub.id,
        qrCodeBase64: pix.encodedImage ?? null,
        qrCodePayload: pix.payload ?? null,
        paymentUrl: null,
        expiresAt: pix.expirationDate ? new Date(pix.expirationDate) : null,
      };
    }

    // Cartão: link público de pagamento.
    return {
      sessionId: sub.id,
      paymentUrl: `${this.apiUrl.replace(/\/api\/v3$/, "")}/c/${sub.id}`,
      expiresAt: addDays(new Date(), 1),
    };
  }

  async createPortalSession({ providerCustomerId, returnUrl }: { providerCustomerId: string; returnUrl: string }) {
    // Asaas não tem "portal" como Stripe — devolvemos a URL pública do customer.
    // Em prod, considerar uma página interna que use API + checkbox de cancelamento.
    return {
      url: `${this.apiUrl.replace(/\/api\/v3$/, "")}/c/${providerCustomerId}?return=${encodeURIComponent(returnUrl)}`,
    };
  }

  verifyWebhookSignature({ signature }: { rawBody: string; signature: string | null }): boolean {
    if (!signature) return false;
    try {
      const expected = Buffer.from(this.webhookSecret);
      const got = Buffer.from(signature);
      if (expected.length !== got.length) return false;
      return timingSafeEqual(expected, got);
    } catch {
      return false;
    }
  }

  parseEvent(rawBody: string): ParsedEvent {
    const json = JSON.parse(rawBody) as {
      id?: string;
      event: string;
      payment?: {
        id?: string;
        customer?: string;
        subscription?: string;
        status?: string;
        nextDueDate?: string;
      };
      subscription?: { id?: string; customer?: string };
    };

    const providerEventId =
      json.id ??
      // fallback: se Asaas não enviar id, derivar de payment.id + event (idempotência best-effort)
      `${json.event}:${json.payment?.id ?? json.subscription?.id ?? ""}`;

    return {
      providerEventId,
      eventType: json.event,
      providerCustomerId: json.payment?.customer ?? json.subscription?.customer ?? null,
      providerSubscriptionId: json.payment?.subscription ?? json.subscription?.id ?? null,
      paymentStatus: mapPaymentStatus(json.payment?.status),
      nextDueDate: json.payment?.nextDueDate ? new Date(json.payment.nextDueDate) : null,
      payload: json,
    };
  }
}

function mapPaymentStatus(s: string | undefined): ParsedEvent["paymentStatus"] {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "RECEIVED" || u === "CONFIRMED" || u === "PAID") return "PAID";
  if (u === "OVERDUE") return "OVERDUE";
  if (u === "REFUNDED") return "REFUNDED";
  if (u === "FAILED" || u === "CANCELLED") return "FAILED";
  return null;
}

// Apenas usado pelo helper dev de geração de assinatura mock.
export function _hmacForTesting(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}
