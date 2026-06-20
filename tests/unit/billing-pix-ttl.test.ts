import { describe, it, expect } from "vitest";
import { computePixExpiresAt, PIX_QR_TTL_SECONDS } from "@/lib/billing/pix-ttl";

describe("computePixExpiresAt", () => {
  const now = new Date("2026-06-20T12:00:00.000Z");

  it("soma o TTL informado (segundos) ao now", () => {
    expect(computePixExpiresAt(now, 300).getTime()).toBe(now.getTime() + 300_000);
    expect(computePixExpiresAt(now, 60).getTime()).toBe(now.getTime() + 60_000);
  });

  it("usa PIX_QR_TTL_SECONDS como default", () => {
    expect(computePixExpiresAt(now).getTime()).toBe(now.getTime() + PIX_QR_TTL_SECONDS * 1000);
  });

  it("default é curto (≤ 10 min) — TTL de produto, não os ~12 meses do gateway", () => {
    expect(PIX_QR_TTL_SECONDS).toBeGreaterThan(0);
    expect(PIX_QR_TTL_SECONDS).toBeLessThanOrEqual(600);
  });
});
