import { addDays, addMonths } from "date-fns";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PLANS } from "./plans";
import { computePixExpiresAt } from "./pix-ttl";
import type { PlanTier } from "@/generated/prisma/client";
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

  async updateCustomer({ providerCustomerId, cpf }: { providerCustomerId: string; cpf: string }) {
    // Asaas usa POST (não PUT) para atualizar customer existente.
    await this.request(`/customers/${providerCustomerId}`, {
      method: "POST",
      body: JSON.stringify({ cpfCnpj: cpf.replace(/\D/g, "") }),
    });
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
        description: `${plan.label} — Clínica Organizada`,
        externalReference: `${input.userId}:${input.plan}`,
      }),
    });

    // Para Pix, recupera a primeira cobrança e seu QR code.
    if (input.method === "PIX") {
      const firstPaymentId = await this.pendingPaymentId(sub.id);
      if (!firstPaymentId) {
        return { sessionId: sub.id, expiresAt: computePixExpiresAt(new Date()) };
      }
      return this.fetchPixQrForPayment(firstPaymentId, sub.id);
    }

    // Cartão: link público de pagamento.
    return {
      sessionId: sub.id,
      paymentUrl: `${this.apiUrl.replace(/\/api\/v3$/, "")}/c/${sub.id}`,
      expiresAt: addDays(new Date(), 1),
    };
  }

  /** Regenera o QR Pix da assinatura existente — NÃO cria assinatura nova. */
  async refreshPixCharge(input: {
    providerSubscriptionId: string;
    customerId: string;
    plan: PlanTier;
    userId: string;
  }): Promise<CheckoutResult> {
    const paymentId = await this.pendingPaymentId(input.providerSubscriptionId);
    if (!paymentId) {
      // Sem cobrança pendente (já paga/inexistente) — devolve sessão sem QR novo.
      return { sessionId: input.providerSubscriptionId, expiresAt: computePixExpiresAt(new Date()) };
    }
    return this.fetchPixQrForPayment(paymentId, input.providerSubscriptionId);
  }

  /** Cobrança PENDENTE mais relevante de uma assinatura (pra (re)buscar o QR). */
  private async pendingPaymentId(providerSubscriptionId: string): Promise<string | null> {
    const payments = await this.request<{ data: Array<{ id: string; status?: string }> }>(
      `/subscriptions/${providerSubscriptionId}/payments`,
    );
    const list = payments.data ?? [];
    const pending = list.find((p) => {
      const s = (p.status ?? "").toUpperCase();
      return s === "PENDING" || s === "AWAITING_RISK_ANALYSIS" || s.startsWith("AWAIT");
    });
    return (pending ?? list[0])?.id ?? null;
  }

  /** Monta o CheckoutResult de uma cobrança Pix, com `expiresAt` curto (TTL do produto). */
  private async fetchPixQrForPayment(paymentId: string, sessionId: string): Promise<CheckoutResult> {
    const pix = await this.request<{
      success: boolean;
      encodedImage: string;
      payload: string;
      expirationDate: string;
    }>(`/payments/${paymentId}/pixQrCode`);
    return {
      sessionId,
      qrCodeBase64: pix.encodedImage ?? null,
      qrCodePayload: pix.payload ?? null,
      paymentUrl: null,
      // O `expirationDate` do gateway é ~12 meses; o TTL curto é política do produto.
      expiresAt: computePixExpiresAt(new Date()),
    };
  }

  async cancelSubscription(providerSubscriptionId: string) {
    // Asaas: DELETE /subscriptions/{id} remove a assinatura (interrompe cobranças
    // futuras). Cobranças já confirmadas não são afetadas.
    await this.request(`/subscriptions/${providerSubscriptionId}`, { method: "DELETE" });
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
        dueDate?: string;
        nextDueDate?: string;
      };
      subscription?: { id?: string; customer?: string; nextDueDate?: string };
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
      nextDueDate: deriveNextDueDate(json),
      payload: json,
    };
  }
}

/**
 * O Asaas NÃO envia `nextDueDate` no objeto `payment` dos webhooks (o campo
 * vive na subscription, que não vem no payload de PAYMENT_*). Achado no teste
 * sandbox 2026-06-13: sem fallback, `currentPeriodEnd` ficava null após a
 * ativação — e o downgrade do cron (`CANCELED + currentPeriodEnd < now`)
 * nunca dispararia para quem cancelasse. Fallback: vencimento da cobrança
 * paga + 1 mês = próxima cobrança do ciclo MONTHLY.
 */
function deriveNextDueDate(json: {
  payment?: { dueDate?: string; nextDueDate?: string };
  subscription?: { nextDueDate?: string };
}): Date | null {
  const explicit = json.payment?.nextDueDate ?? json.subscription?.nextDueDate;
  if (explicit) return new Date(explicit);
  if (json.payment?.dueDate) return addMonths(new Date(json.payment.dueDate), 1);
  return null;
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
