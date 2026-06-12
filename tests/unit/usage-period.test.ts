import { describe, it, expect } from "vitest";
import { currentPeriodFor } from "@/lib/billing/usage";
import type { Subscription } from "@/generated/prisma/client";

function subWith(overrides: Partial<Subscription>): Subscription {
  return {
    id: "sub_test",
    userId: "user_test",
    plan: "PRO",
    status: "ACTIVE",
    currentPeriodStart: new Date("2026-06-05T00:00:00Z"),
    currentPeriodEnd: new Date("2026-07-05T00:00:00Z"),
    cancelAtPeriodEnd: false,
    provider: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    adminOverrideUntil: null,
    adminOverrideReason: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("currentPeriodFor", () => {
  const now = new Date("2026-06-10T15:30:00Z");

  it("uses the billing cycle for paid subscription with valid period", () => {
    const period = currentPeriodFor(subWith({}), now);
    expect(period.periodStart.toISOString()).toBe("2026-06-05T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  it("falls back to calendar month for FREE (no currentPeriodEnd)", () => {
    const period = currentPeriodFor(subWith({ plan: "FREE", currentPeriodEnd: null }), now);
    expect(period.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("falls back to calendar month when sub is null", () => {
    const period = currentPeriodFor(null, now);
    expect(period.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("falls back to calendar month when paid cycle expired (lost renewal webhook)", () => {
    const period = currentPeriodFor(
      subWith({
        currentPeriodStart: new Date("2026-04-05T00:00:00Z"),
        currentPeriodEnd: new Date("2026-05-05T00:00:00Z"), // já passou
      }),
      now,
    );
    expect(period.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("calendar month rolls over the year boundary", () => {
    const dec = new Date("2026-12-15T10:00:00Z");
    const period = currentPeriodFor(null, dec);
    expect(period.periodStart.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is timezone-independent (keyed on UTC month)", () => {
    // 2026-06-30 23:30 UTC ainda é junho em UTC, mesmo que já seja julho em UTC+1.
    const edge = new Date("2026-06-30T23:30:00Z");
    const period = currentPeriodFor(null, edge);
    expect(period.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
