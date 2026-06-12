import { describe, it, expect } from "vitest";
import { MockProvider } from "@/lib/billing/mock";
import { eventToSubscriptionPatch } from "@/lib/billing/provider";

describe("MockProvider", () => {
  const provider = new MockProvider();

  it("createCustomer retorna providerCustomerId determinístico por user", async () => {
    const a = await provider.createCustomer({ userId: "user-abcdef12", email: "x@y.com", name: "X" });
    const b = await provider.createCustomer({ userId: "user-abcdef12", email: "x@y.com", name: "X" });
    expect(a.providerCustomerId).toBe(b.providerCustomerId);
    expect(a.providerCustomerId).toMatch(/^mock_cus_/);
  });

  it("createCheckout PIX retorna QR + payload + expiresAt", async () => {
    const r = await provider.createCheckout({
      userId: "u1",
      customerId: "mock_cus_1",
      plan: "PRO",
      method: "PIX",
      returnUrl: "http://localhost:3000/billing/sucesso",
    });
    expect(r.sessionId).toMatch(/^mock_chk_/);
    expect(r.qrCodeBase64).toBeTruthy();
    expect(r.qrCodePayload).toContain("BR.GOV.BCB.PIX");
    expect(r.expiresAt).toBeInstanceOf(Date);
  });

  it("createCheckout CREDIT_CARD retorna paymentUrl, sem QR", async () => {
    const r = await provider.createCheckout({
      userId: "u1",
      customerId: "mock_cus_1",
      plan: "PRO",
      method: "CREDIT_CARD",
      returnUrl: "http://localhost:3000/billing/sucesso",
    });
    expect(r.paymentUrl).toContain("mock_session=");
    expect(r.qrCodeBase64).toBeNull();
  });

  it("verifyWebhookSignature aceita HMAC válido e rejeita inválido", () => {
    const body = JSON.stringify({ id: "e1", event: "PAYMENT_RECEIVED" });
    const sig = provider.signForMock(body);
    expect(provider.verifyWebhookSignature({ rawBody: body, signature: sig })).toBe(true);
    expect(provider.verifyWebhookSignature({ rawBody: body, signature: "wrong" })).toBe(false);
    expect(provider.verifyWebhookSignature({ rawBody: body, signature: null })).toBe(false);
    expect(provider.verifyWebhookSignature({ rawBody: body + "x", signature: sig })).toBe(false);
  });

  it("parseEvent extrai eventType + IDs + paymentStatus", () => {
    const raw = JSON.stringify({
      id: "evt_1",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_1",
        customer: "cus_1",
        subscription: "sub_1",
        status: "RECEIVED",
        nextDueDate: "2026-06-07",
      },
    });
    const e = provider.parseEvent(raw);
    expect(e.providerEventId).toBe("evt_1");
    expect(e.eventType).toBe("PAYMENT_RECEIVED");
    expect(e.providerCustomerId).toBe("cus_1");
    expect(e.providerSubscriptionId).toBe("sub_1");
    expect(e.paymentStatus).toBe("PAID");
    expect(e.nextDueDate).toBeInstanceOf(Date);
  });
});

describe("eventToSubscriptionPatch", () => {
  it("PAYMENT_RECEIVED → ACTIVE com nextDueDate", () => {
    const patch = eventToSubscriptionPatch({
      providerEventId: "1",
      eventType: "PAYMENT_RECEIVED",
      providerCustomerId: null,
      providerSubscriptionId: null,
      nextDueDate: new Date("2026-06-07"),
      payload: {},
    });
    expect(patch.status).toBe("ACTIVE");
    expect(patch.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("PAYMENT_OVERDUE → PAST_DUE", () => {
    const patch = eventToSubscriptionPatch({
      providerEventId: "1",
      eventType: "PAYMENT_OVERDUE",
      providerCustomerId: null,
      providerSubscriptionId: null,
      payload: {},
    });
    expect(patch.status).toBe("PAST_DUE");
  });

  it("SUBSCRIPTION_DELETED → CANCELED + cancelAtPeriodEnd", () => {
    const patch = eventToSubscriptionPatch({
      providerEventId: "1",
      eventType: "SUBSCRIPTION_DELETED",
      providerCustomerId: null,
      providerSubscriptionId: null,
      payload: {},
    });
    expect(patch.status).toBe("CANCELED");
    expect(patch.cancelAtPeriodEnd).toBe(true);
  });

  it("evento desconhecido → patch vazio", () => {
    const patch = eventToSubscriptionPatch({
      providerEventId: "1",
      eventType: "RANDOM_EVENT",
      providerCustomerId: null,
      providerSubscriptionId: null,
      payload: {},
    });
    expect(Object.keys(patch)).toHaveLength(0);
  });
});
