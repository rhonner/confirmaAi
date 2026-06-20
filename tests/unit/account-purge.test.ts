import { describe, it, expect } from "vitest";
import { isPatientPurgeDue } from "@/lib/account/account-purge";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-07-01T00:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe("isPatientPurgeDue", () => {
  it("conta não deletada → false", () => {
    expect(isPatientPurgeDue({ deletedAt: null, patientsPurgedAt: null, now })).toBe(false);
  });
  it("já purgada → false (idempotência)", () => {
    expect(isPatientPurgeDue({ deletedAt: ago(40), patientsPurgedAt: new Date(), now })).toBe(false);
  });
  it("deletada há 29 dias → false (dentro da carência)", () => {
    expect(isPatientPurgeDue({ deletedAt: ago(29), patientsPurgedAt: null, now })).toBe(false);
  });
  it("deletada há 30 dias → true", () => {
    expect(isPatientPurgeDue({ deletedAt: ago(30), patientsPurgedAt: null, now })).toBe(true);
  });
  it("respeita graceDays custom", () => {
    expect(isPatientPurgeDue({ deletedAt: ago(5), patientsPurgedAt: null, now, graceDays: 3 })).toBe(true);
    expect(isPatientPurgeDue({ deletedAt: ago(2), patientsPurgedAt: null, now, graceDays: 3 })).toBe(false);
  });
});
