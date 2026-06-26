import { describe, it, expect } from "vitest";
import { effectivePlanTier, hasAdminOverride } from "@/lib/billing/plans";

const NOW = new Date("2026-06-26T12:00:00.000Z");
const FUTURE = new Date("2099-12-31T00:00:00.000Z");
const PAST = new Date("2020-01-01T00:00:00.000Z");

describe("effectivePlanTier (override admin / beta)", () => {
  it("FREE sem override → FREE", () => {
    expect(effectivePlanTier({ plan: "FREE", adminOverrideUntil: null }, NOW)).toBe("FREE");
  });

  it("FREE com override futuro → PREMIUM (acesso cortesia)", () => {
    expect(effectivePlanTier({ plan: "FREE", adminOverrideUntil: FUTURE }, NOW)).toBe("PREMIUM");
  });

  it("override expirado → volta ao plano real", () => {
    expect(effectivePlanTier({ plan: "FREE", adminOverrideUntil: PAST }, NOW)).toBe("FREE");
    expect(effectivePlanTier({ plan: "PRO", adminOverrideUntil: PAST }, NOW)).toBe("PRO");
  });

  it("não rebaixa quem é pago", () => {
    expect(effectivePlanTier({ plan: "PRO", adminOverrideUntil: null }, NOW)).toBe("PRO");
  });

  it("sub ausente → FREE", () => {
    expect(effectivePlanTier(null, NOW)).toBe("FREE");
    expect(effectivePlanTier(undefined, NOW)).toBe("FREE");
  });
});

describe("hasAdminOverride", () => {
  it("futuro → true; passado/null/ausente → false", () => {
    expect(hasAdminOverride({ adminOverrideUntil: FUTURE }, NOW)).toBe(true);
    expect(hasAdminOverride({ adminOverrideUntil: PAST }, NOW)).toBe(false);
    expect(hasAdminOverride({ adminOverrideUntil: null }, NOW)).toBe(false);
    expect(hasAdminOverride(null, NOW)).toBe(false);
  });
});
