import { describe, it, expect } from "vitest";
import {
  evaluateHealth,
  CRON_STALE_MINUTES,
  BILLING_STUCK_MINUTES,
  type HealthInputs,
} from "../../src/lib/services/health";

const NOW = new Date("2026-06-13T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function baseInputs(): HealthInputs {
  return {
    now: NOW,
    databaseOk: true,
    lastCronRunAt: minutesAgo(10), // recente
    stuckBillingEvents: 0,
    evolutionHealth: "OK",
  };
}

describe("evaluateHealth", () => {
  it("tudo saudável → status ok e todos os checks ok", () => {
    const r = evaluateHealth(baseInputs());
    expect(r.status).toBe("ok");
    expect(r.checks.database.ok).toBe(true);
    expect(r.checks.cron.ok).toBe(true);
    expect(r.checks.billing.ok).toBe(true);
    expect(r.checks.evolution.ok).toBe(true);
    expect(r.checks.cron.lastRunMinutesAgo).toBe(10);
    expect(r.timestamp).toBe(NOW.toISOString());
  });

  it("cron parado além do limite → degraded", () => {
    const r = evaluateHealth({ ...baseInputs(), lastCronRunAt: minutesAgo(CRON_STALE_MINUTES + 1) });
    expect(r.checks.cron.ok).toBe(false);
    expect(r.status).toBe("degraded");
  });

  it("cron exatamente no limite ainda é ok (limite inclusivo)", () => {
    const r = evaluateHealth({ ...baseInputs(), lastCronRunAt: minutesAgo(CRON_STALE_MINUTES) });
    expect(r.checks.cron.ok).toBe(true);
    expect(r.status).toBe("ok");
  });

  it("nunca rodou (lastCronRunAt null) → cron degradado, minutesAgo null", () => {
    const r = evaluateHealth({ ...baseInputs(), lastCronRunAt: null });
    expect(r.checks.cron.ok).toBe(false);
    expect(r.checks.cron.lastRunMinutesAgo).toBeNull();
    expect(r.status).toBe("degraded");
  });

  it("BillingEvent travado → billing degradado", () => {
    const r = evaluateHealth({ ...baseInputs(), stuckBillingEvents: 2 });
    expect(r.checks.billing.ok).toBe(false);
    expect(r.checks.billing.stuckEvents).toBe(2);
    expect(r.status).toBe("degraded");
  });

  it("Evolution DOWN → degraded; NOT_CONFIGURED e OK → ok", () => {
    expect(evaluateHealth({ ...baseInputs(), evolutionHealth: "DOWN" }).status).toBe("degraded");
    expect(evaluateHealth({ ...baseInputs(), evolutionHealth: "NOT_CONFIGURED" }).status).toBe("ok");
    expect(evaluateHealth({ ...baseInputs(), evolutionHealth: "OK" }).status).toBe("ok");
  });

  it("banco fora → database degradado", () => {
    const r = evaluateHealth({ ...baseInputs(), databaseOk: false });
    expect(r.checks.database.ok).toBe(false);
    expect(r.status).toBe("degraded");
  });

  it("expõe o threshold de billing para o consumidor (documentação viva)", () => {
    expect(BILLING_STUCK_MINUTES).toBe(60);
  });
});
