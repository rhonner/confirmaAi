import { describe, it, expect } from "vitest";
import { dunningStageDue, usageThresholdDue } from "@/lib/services/billing-notifications";

const BASE = new Date("2026-06-01T00:00:00.000Z");
const day = (n: number) => new Date(BASE.getTime() + n * 24 * 60 * 60 * 1000);

describe("dunningStageDue", () => {
  it("dia 0 → null (nada vencido)", () => {
    expect(dunningStageDue({ pastDueSince: BASE, now: day(0), alreadySentStages: [] })).toBeNull();
  });

  it("dia 1 → DAY_1 (suspendsInDays 6)", () => {
    const r = dunningStageDue({ pastDueSince: BASE, now: day(1), alreadySentStages: [] });
    expect(r?.stage).toBe("DAY_1");
    expect(r?.suspendsInDays).toBe(6);
  });

  it("dia 2 sem nada enviado → DAY_1 (maior vencido)", () => {
    expect(dunningStageDue({ pastDueSince: BASE, now: day(2), alreadySentStages: [] })?.stage).toBe("DAY_1");
  });

  it("dia 3 → DAY_3", () => {
    expect(dunningStageDue({ pastDueSince: BASE, now: day(3), alreadySentStages: ["DAY_1"] })?.stage).toBe("DAY_3");
  });

  it("dia 4 com DAY_3 já enviado → null (não regride nem reenvia)", () => {
    expect(dunningStageDue({ pastDueSince: BASE, now: day(4), alreadySentStages: ["DAY_1", "DAY_3"] })).toBeNull();
  });

  it("dia 7 → DAY_7 (suspendsInDays 0, iminente)", () => {
    const r = dunningStageDue({ pastDueSince: BASE, now: day(7), alreadySentStages: ["DAY_1", "DAY_3"] });
    expect(r?.stage).toBe("DAY_7");
    expect(r?.suspendsInDays).toBe(0);
  });

  it("dia 9 sem nada enviado → DAY_7 (pula 1/3, manda só o mais urgente)", () => {
    expect(dunningStageDue({ pastDueSince: BASE, now: day(9), alreadySentStages: [] })?.stage).toBe("DAY_7");
  });

  it("dia 7 com DAY_7 já enviado → null", () => {
    expect(dunningStageDue({ pastDueSince: BASE, now: day(7), alreadySentStages: ["DAY_7"] })).toBeNull();
  });
});

describe("usageThresholdDue", () => {
  const inc = 1000;
  it("79% → null", () => {
    expect(usageThresholdDue({ messagesSent: 790, messagesIncluded: inc, alreadyNotified: [] })).toBeNull();
  });
  it("80% → 80", () => {
    expect(usageThresholdDue({ messagesSent: 800, messagesIncluded: inc, alreadyNotified: [] })).toBe(80);
  });
  it("80% já notificado → null", () => {
    expect(usageThresholdDue({ messagesSent: 850, messagesIncluded: inc, alreadyNotified: [80] })).toBeNull();
  });
  it("100% → 100", () => {
    expect(usageThresholdDue({ messagesSent: 1000, messagesIncluded: inc, alreadyNotified: [] })).toBe(100);
  });
  it("100% com 80 já notificado → 100 (precedência do 100)", () => {
    expect(usageThresholdDue({ messagesSent: 1000, messagesIncluded: inc, alreadyNotified: [80] })).toBe(100);
  });
  it("100% já notificado → null", () => {
    expect(usageThresholdDue({ messagesSent: 1200, messagesIncluded: inc, alreadyNotified: [80, 100] })).toBeNull();
  });
  it("messagesIncluded 0 → null (sem teto)", () => {
    expect(usageThresholdDue({ messagesSent: 10, messagesIncluded: 0, alreadyNotified: [] })).toBeNull();
  });
});
