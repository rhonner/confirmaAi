import type { BillingProvider as BillingProviderEnum, PlanTier } from "@/generated/prisma/client";

/**
 * Interface para providers de cobrança. Implementações: `asaas.ts`, `mock.ts`.
 * Trocar provider = trocar a fábrica em `index.ts`.
 *
 * Princípio: nada da lógica de negócio (entitlements, lifecycle) vive aqui —
 * só a interface com o gateway externo.
 */

export type CheckoutMethod = "PIX" | "CREDIT_CARD";

export type CreateCustomerInput = {
  userId: string;
  email: string;
  name: string;
  cpf?: string | null;
};

export type CreateCheckoutInput = {
  userId: string;
  customerId: string;
  plan: PlanTier;
  method: CheckoutMethod;
  /** URL para retorno após pagamento (cartão). */
  returnUrl: string;
};

export type CheckoutResult = {
  /** ID interno da sessão de checkout no provider. */
  sessionId: string;
  /** Para Pix, base64 do QR code. */
  qrCodeBase64?: string | null;
  /** Para Pix, payload copia-e-cola. */
  qrCodePayload?: string | null;
  /** Para cartão, URL pra redirecionar. */
  paymentUrl?: string | null;
  /** Quando o checkout expira (Pix tem prazo curto). */
  expiresAt?: Date | null;
};

export type PortalSession = {
  url: string;
};

export type ParsedEvent = {
  /** Identificador único do evento (idempotência). */
  providerEventId: string;
  eventType: string;
  /** ID do customer no provider, mapeável pra User via Subscription.providerCustomerId. */
  providerCustomerId: string | null;
  /** ID da subscription no provider, mapeável via Subscription.providerSubscriptionId. */
  providerSubscriptionId: string | null;
  /** Para eventos de pagamento. */
  paymentStatus?: "PAID" | "FAILED" | "OVERDUE" | "REFUNDED" | null;
  /** Próxima cobrança/expiração (PAID → updateCurrentPeriodEnd). */
  nextDueDate?: Date | null;
  payload: unknown;
};

export interface BillingProviderImpl {
  readonly name: BillingProviderEnum;

  createCustomer(input: CreateCustomerInput): Promise<{ providerCustomerId: string }>;

  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;

  createPortalSession(input: { providerCustomerId: string; returnUrl: string }): Promise<PortalSession>;

  verifyWebhookSignature(input: { rawBody: string; signature: string | null }): boolean;

  parseEvent(rawBody: string): ParsedEvent;
}

/**
 * Helper pra mapear evento canônico → mudança em Subscription.
 * Útil tanto pra real Asaas quanto pra Mock.
 */
export function eventToSubscriptionPatch(event: ParsedEvent): {
  status?: "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED";
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
} {
  const t = event.eventType;
  if (t === "PAYMENT_RECEIVED" || t === "PAYMENT_CONFIRMED") {
    return {
      status: "ACTIVE",
      currentPeriodEnd: event.nextDueDate ?? undefined,
    };
  }
  if (t === "PAYMENT_OVERDUE" || event.paymentStatus === "OVERDUE") {
    return { status: "PAST_DUE" };
  }
  if (t === "SUBSCRIPTION_DELETED" || t === "SUBSCRIPTION_CANCELLED") {
    return { status: "CANCELED", cancelAtPeriodEnd: true };
  }
  return {};
}
