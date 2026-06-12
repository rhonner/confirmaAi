import { describe, it, expect } from "vitest";
import { actionLabel, knownActions } from "@/lib/audit/labels";

describe("actionLabel", () => {
  it("returns PT-BR label for known actions", () => {
    expect(actionLabel("auth.login.success")).toBe("Login realizado");
    expect(actionLabel("patient.create")).toBe("Paciente criado");
    expect(actionLabel("quota.patient_blocked")).toContain("limite do plano");
  });

  it("falls back to the raw key for unknown actions", () => {
    expect(actionLabel("foo.bar.unknown")).toBe("foo.bar.unknown");
  });

  it("known actions cover the main domains", () => {
    const all = knownActions();
    expect(all).toContain("auth.login.success");
    expect(all).toContain("subscription.created");
    expect(all).toContain("billing.webhook.invalid_signature");
    expect(all).toContain("quota.patient_blocked");
  });
});
