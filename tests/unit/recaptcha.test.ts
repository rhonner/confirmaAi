import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyRecaptchaToken } from "@/lib/anti-fraud/recaptcha";

describe("verifyRecaptchaToken — fallback dev sem chave", () => {
  const originalSecret = process.env.RECAPTCHA_SECRET_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.RECAPTCHA_SECRET_KEY;
  });

  afterEach(() => {
    if (originalSecret) process.env.RECAPTCHA_SECRET_KEY = originalSecret;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  it("dev sem secret → bypass com mode DEV_BYPASS", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const r = await verifyRecaptchaToken("any-token");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("DEV_BYPASS");
  });

  it("prod sem secret → MISCONFIGURED", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const r = await verifyRecaptchaToken("any-token");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISCONFIGURED");
  });

  it("dev sem secret + token vazio → ainda bypass (não chega a checar token)", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const r = await verifyRecaptchaToken(null);
    expect(r.ok).toBe(true);
  });
});

describe("verifyRecaptchaToken — com secret simulado", () => {
  it("token vazio com secret presente → MISSING_TOKEN", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "fake-secret-for-test";
    const r = await verifyRecaptchaToken(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_TOKEN");
    delete process.env.RECAPTCHA_SECRET_KEY;
  });
});
