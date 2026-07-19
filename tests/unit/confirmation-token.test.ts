import { describe, it, expect, beforeAll } from "vitest";
import {
  makeConfirmationToken,
  verifyConfirmationToken,
} from "../../src/lib/services/confirmation-token";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-secret-for-confirm";
});

const AID = "appt_abc123";
const NOW = 1_000_000_000_000;
const EXP = NOW + 6 * 60 * 60_000; // deadline 6h à frente

describe("confirmation-token (puro)", () => {
  it("round-trip: token gerado valida e devolve appointmentId + exp", () => {
    const t = makeConfirmationToken(AID, EXP);
    const r = verifyConfirmationToken(t, NOW);
    expect(r).toEqual({ ok: true, appointmentId: AID, exp: EXP });
  });

  it("expirado: now além do exp → EXPIRED", () => {
    const t = makeConfirmationToken(AID, EXP);
    const r = verifyConfirmationToken(t, EXP + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXPIRED");
  });

  it("no limite do exp ainda vale (exp === now não é passado)", () => {
    const t = makeConfirmationToken(AID, EXP);
    const r = verifyConfirmationToken(t, EXP);
    expect(r.ok).toBe(true);
  });

  it("adulterado (assinatura trocada) → INVALID, não EXPIRED", () => {
    // Mesmo com um token 'expirado', assinatura inválida vem primeiro.
    const t = makeConfirmationToken(AID, NOW - 1);
    const [body] = t.split(".");
    const r = verifyConfirmationToken(`${body}.assinaturafalsa`, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["INVALID", "MALFORMED"]).toContain(r.reason);
  });

  it("corpo adulterado (troca de appointmentId) invalida a assinatura", () => {
    const t = makeConfirmationToken(AID, EXP);
    const sig = t.split(".")[1];
    const forgedBody = Buffer.from(`appt_OUTRO.${EXP}`, "utf8").toString("base64url");
    const r = verifyConfirmationToken(`${forgedBody}.${sig}`, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID");
  });

  it("formato inválido → MALFORMED", () => {
    expect(verifyConfirmationToken("xxxxx", NOW).ok).toBe(false);
    expect(verifyConfirmationToken("a.b.c", NOW).ok).toBe(false);
    expect(verifyConfirmationToken("", NOW).ok).toBe(false);
  });

  it("appointmentId (cuid) é preservado", () => {
    const t = makeConfirmationToken("cmabc123xyz789", EXP);
    const r = verifyConfirmationToken(t, NOW);
    expect(r.ok && r.appointmentId).toBe("cmabc123xyz789");
  });
});
