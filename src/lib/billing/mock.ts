import { randomBytes, createHmac } from "node:crypto";
import { addDays } from "date-fns";
import type {
  BillingProviderImpl,
  CreateCustomerInput,
  CreateCheckoutInput,
  CheckoutResult,
  ParsedEvent,
} from "./provider";

/**
 * MockProvider: simulação local de gateway de pagamento.
 *
 * Pra que serve:
 * - Dev sem chave Asaas (toda equipe pode rodar `npm run dev` sem dependências externas).
 * - Testes E2E determinísticos (não precisa hit no Asaas sandbox).
 *
 * O endpoint `/api/billing/mock-trigger` (NODE_ENV != production) usa este
 * provider pra disparar webhooks falsos e exercitar o lifecycle completo.
 *
 * **Em produção**, a fábrica em `src/lib/billing/index.ts` escolhe `AsaasProvider`
 * via `BILLING_PROVIDER=ASAAS`.
 */

const MOCK_SECRET = "mock-webhook-secret-do-not-use-in-prod";

// Tiny PNG (1x1 ciano) — placeholder visual para QR code mock.
const MOCK_QR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export class MockProvider implements BillingProviderImpl {
  readonly name = "ASAAS" as const; // pra evitar mexer no enum; comportamento é mock

  async createCustomer(input: CreateCustomerInput) {
    return { providerCustomerId: `mock_cus_${input.userId.slice(-8)}` };
  }

  async updateCustomer(_input: { providerCustomerId: string; cpf: string }) {
    // no-op: mock não mantém estado de customer.
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const sessionId = `mock_chk_${randomBytes(8).toString("hex")}`;
    const expiresAt = addDays(new Date(), 1);

    if (input.method === "PIX") {
      return {
        sessionId,
        qrCodeBase64: MOCK_QR_PNG_BASE64,
        qrCodePayload: `00020126360014BR.GOV.BCB.PIX0114${sessionId}5204000053039865802BR5913MOCK PROVIDER6008TESTE006304ABCD`,
        paymentUrl: null,
        expiresAt,
      };
    }
    return {
      sessionId,
      qrCodeBase64: null,
      qrCodePayload: null,
      paymentUrl: `${input.returnUrl}?mock_session=${sessionId}`,
      expiresAt,
    };
  }

  async createPortalSession({ returnUrl }: { providerCustomerId: string; returnUrl: string }) {
    return { url: `${returnUrl}?mock_portal=true` };
  }

  verifyWebhookSignature({ rawBody, signature }: { rawBody: string; signature: string | null }): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
    return signature === expected;
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
    };
    return {
      providerEventId: json.id ?? `mock_evt_${randomBytes(8).toString("hex")}`,
      eventType: json.event,
      providerCustomerId: json.payment?.customer ?? null,
      providerSubscriptionId: json.payment?.subscription ?? null,
      paymentStatus: mapPaymentStatus(json.payment?.status),
      nextDueDate: json.payment?.nextDueDate ? new Date(json.payment.nextDueDate) : null,
      payload: json,
    };
  }

  /**
   * Helper dev-only: assina um body como se viesse do Mock provider.
   * Usado pelo endpoint `/api/billing/mock-trigger`.
   */
  signForMock(rawBody: string): string {
    return createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
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
