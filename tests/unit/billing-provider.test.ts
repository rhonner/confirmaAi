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

  it("updateCustomer e cancelSubscription existem e resolvem (no-op no mock)", async () => {
    await expect(provider.updateCustomer({ providerCustomerId: "mock_cus_1", cpf: "11144477735" })).resolves.toBeUndefined();
    await expect(provider.cancelSubscription("mock_chk_abc")).resolves.toBeUndefined();
  });

  it("refreshPixCharge reusa o providerSubscriptionId (não cria assinatura) + QR novo + expiresAt curto", async () => {
    const before = Date.now();
    const r = await provider.refreshPixCharge({
      providerSubscriptionId: "mock_chk_xyz",
      customerId: "mock_cus_1",
      plan: "PRO",
      userId: "u1",
    });
    expect(r.sessionId).toBe("mock_chk_xyz"); // mesma assinatura
    expect(r.qrCodeBase64).toBeTruthy();
    expect(r.qrCodePayload).toContain("BR.GOV.BCB.PIX");
    expect(r.expiresAt).toBeInstanceOf(Date);
    // TTL curto: expira em ≤ 10 min a partir de agora.
    expect(r.expiresAt!.getTime()).toBeGreaterThan(before);
    expect(r.expiresAt!.getTime()).toBeLessThanOrEqual(before + 600_000 + 2000);
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

import { planTierFromPayload } from "@/lib/billing/provider";

describe("planTierFromPayload (bug do go-live: externalReference em payment)", () => {
  it("lê o plano de payment.externalReference (formato real do Asaas em PAYMENT_RECEIVED)", () => {
    const payload = { event: "PAYMENT_RECEIVED", payment: { externalReference: "user_abc:PRO" } };
    expect(planTierFromPayload(payload)).toBe("PRO");
  });

  it("lê de subscription.externalReference quando presente", () => {
    expect(planTierFromPayload({ subscription: { externalReference: "user_abc:PREMIUM" } })).toBe("PREMIUM");
  });

  it("lê do externalReference de topo como último fallback", () => {
    expect(planTierFromPayload({ externalReference: "user_abc:PRO" })).toBe("PRO");
  });

  it("retorna null quando não há externalReference", () => {
    expect(planTierFromPayload({ event: "PAYMENT_RECEIVED", payment: {} })).toBeNull();
  });

  it("retorna null para tier desconhecido (não promove FREE nem lixo)", () => {
    expect(planTierFromPayload({ payment: { externalReference: "user_abc:FREE" } })).toBeNull();
    expect(planTierFromPayload({ payment: { externalReference: "user_abc" } })).toBeNull();
  });
});

import { AsaasProvider } from "@/lib/billing/asaas";

describe("AsaasProvider.parseEvent (bug do sandbox: nextDueDate ausente no payment)", () => {
  const provider = new AsaasProvider();

  it("deriva nextDueDate de payment.dueDate + 1 mês (shape real do PAYMENT_RECEIVED)", () => {
    // Payload capturado do sandbox em 2026-06-13: payment.nextDueDate vem null,
    // o campo só existe na subscription (que não vem em eventos PAYMENT_*).
    const raw = JSON.stringify({
      id: "evt_sandbox_1",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_7vn97fjqc2m5y6eu",
        customer: "cus_x",
        subscription: "sub_kvi25tl4ajbbm5i0",
        status: "RECEIVED_IN_CASH",
        value: 65,
        dueDate: "2026-06-15",
        nextDueDate: null,
        externalReference: "user_abc:PRO",
      },
    });
    const e = provider.parseEvent(raw);
    expect(e.nextDueDate).toEqual(new Date("2026-07-15"));
    // E o patch resultante precisa fechar o ciclo (sem isso, CANCELED nunca expira no cron).
    const patch = eventToSubscriptionPatch(e);
    expect(patch.status).toBe("ACTIVE");
    expect(patch.currentPeriodEnd).toEqual(new Date("2026-07-15"));
  });

  it("usa payment.nextDueDate explícito quando presente (não regride o Mock)", () => {
    const raw = JSON.stringify({
      id: "evt_sandbox_2",
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_1", dueDate: "2026-06-15", nextDueDate: "2026-07-01" },
    });
    expect(provider.parseEvent(raw).nextDueDate).toEqual(new Date("2026-07-01"));
  });

  it("retorna null sem dueDate nem nextDueDate (evento não-pagamento)", () => {
    const raw = JSON.stringify({ id: "evt_3", event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } });
    expect(provider.parseEvent(raw).nextDueDate).toBeNull();
  });
});
