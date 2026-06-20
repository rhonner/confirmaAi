import { describe, it, expect } from "vitest";
import { resetEligibility, resetBlockMessage } from "@/lib/account/reset-eligibility";

describe("resetEligibility", () => {
  it("permite FREE sem agendamentos e sem reset prévio", () => {
    expect(resetEligibility({ plan: "FREE", appointmentCount: 0, priorResetCount: 0 })).toEqual({
      allowed: true,
    });
  });

  it("bloqueia plano pago", () => {
    expect(resetEligibility({ plan: "PRO", appointmentCount: 0, priorResetCount: 0 })).toEqual({
      allowed: false,
      reason: "PLAN_NOT_FREE",
    });
    expect(resetEligibility({ plan: "PREMIUM", appointmentCount: 0, priorResetCount: 0 }).allowed).toBe(false);
  });

  it("bloqueia se há QUALQUER agendamento (qualquer status)", () => {
    expect(resetEligibility({ plan: "FREE", appointmentCount: 1, priorResetCount: 0 })).toEqual({
      allowed: false,
      reason: "HAS_APPOINTMENTS",
    });
  });

  it("bloqueia segundo reset (1× vitalício)", () => {
    expect(resetEligibility({ plan: "FREE", appointmentCount: 0, priorResetCount: 1 })).toEqual({
      allowed: false,
      reason: "ALREADY_RESET",
    });
  });

  it("precedência: plano pago vence antes de checar agendamentos/reset", () => {
    expect(resetEligibility({ plan: "PRO", appointmentCount: 9, priorResetCount: 5 }).allowed).toBe(false);
    const r = resetEligibility({ plan: "PRO", appointmentCount: 9, priorResetCount: 5 });
    if (!r.allowed) expect(r.reason).toBe("PLAN_NOT_FREE");
  });

  it("toda razão tem mensagem PT-BR", () => {
    for (const reason of ["PLAN_NOT_FREE", "HAS_APPOINTMENTS", "ALREADY_RESET"] as const) {
      expect(resetBlockMessage(reason).length).toBeGreaterThan(10);
    }
  });
});
