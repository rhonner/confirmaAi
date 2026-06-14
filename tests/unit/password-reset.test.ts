import { describe, it, expect, beforeAll } from "vitest";
import { makeResetToken, parseAndVerify } from "../../src/lib/anti-fraud/password-reset";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-for-reset";
});

const HASH = "$2a$10$abcdefghijklmnopqrstuv"; // hash de senha fake (estável)
const UID = "user_abc123";

describe("password-reset token (puro)", () => {
  it("round-trip: token gerado valida com o mesmo hash", () => {
    const t = makeResetToken(UID, HASH);
    const r = parseAndVerify(t, HASH);
    expect(r).toEqual({ ok: true, userId: UID });
  });

  it("single-use: hash diferente (senha trocada) invalida o token", () => {
    const t = makeResetToken(UID, HASH);
    const r = parseAndVerify(t, "$2a$10$OUTROhashdepoisDoReset");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID");
  });

  it("expirado: now além do TTL → EXPIRED", () => {
    const issuedAt = 1_000_000;
    const t = makeResetToken(UID, HASH, issuedAt);
    const r = parseAndVerify(t, HASH, issuedAt + 61 * 60_000); // 61min depois
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXPIRED");
  });

  it("dentro do TTL (59min) ainda vale", () => {
    const issuedAt = 1_000_000;
    const t = makeResetToken(UID, HASH, issuedAt);
    const r = parseAndVerify(t, HASH, issuedAt + 59 * 60_000);
    expect(r.ok).toBe(true);
  });

  it("token adulterado (assinatura trocada) → INVALID", () => {
    const t = makeResetToken(UID, HASH);
    const [body] = t.split(".");
    const r = parseAndVerify(`${body}.assinaturafalsa`, HASH);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["INVALID", "MALFORMED"]).toContain(r.reason);
  });

  it("formato inválido → MALFORMED", () => {
    expect(parseAndVerify("xxxxx", HASH).ok).toBe(false);
    expect(parseAndVerify("a.b.c", HASH).ok).toBe(false);
  });

  it("userId é preservado no token", () => {
    const t = makeResetToken("cuid_xyz_789", HASH);
    const r = parseAndVerify(t, HASH);
    expect(r.ok && r.userId).toBe("cuid_xyz_789");
  });
});
