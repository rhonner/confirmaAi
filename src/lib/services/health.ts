import { prisma } from "@/lib/prisma";
import { checkEvolutionHealth, type EvolutionHealth } from "./evolution";

/**
 * Health aggregation for `GET /api/health` (Sprint 9 — observabilidade).
 *
 * Filosofia: "não me preocupar" = ser alertado SÓ quando algo quebra. Este
 * endpoint é o alvo de um uptime monitor externo (UptimeRobot/BetterStack):
 * 2xx = tudo certo, 503 = algo degradou e alguém precisa olhar.
 *
 * A avaliação é separada em duas peças para ser testável sem IO:
 * - `evaluateHealth(inputs)`  — PURA: sinais crus → laudo. Unit-testável.
 * - `runHealthChecks()`       — coleta os sinais (DB + Evolution) e delega.
 */

/** Sem `cron.run` auditado nos últimos 90 min → cron morto (cadência é 30 min). */
export const CRON_STALE_MINUTES = 90;
/** `BillingEvent.processedAt = null` há mais de 1h → webhook de pagamento travado. */
export const BILLING_STUCK_MINUTES = 60;

export type HealthStatus = "ok" | "degraded";

export type HealthReport = {
  status: HealthStatus;
  timestamp: string;
  checks: {
    database: { ok: boolean };
    cron: { ok: boolean; lastRunMinutesAgo: number | null; thresholdMinutes: number };
    billing: { ok: boolean; stuckEvents: number };
    evolution: { ok: boolean; health: EvolutionHealth };
  };
};

export type HealthInputs = {
  now: Date;
  databaseOk: boolean;
  /** `createdAt` do último audit `cron.run`, ou null se nunca rodou. */
  lastCronRunAt: Date | null;
  /** Quantos `BillingEvent` não-processados estão mais velhos que o limite. */
  stuckBillingEvents: number;
  evolutionHealth: EvolutionHealth;
};

/**
 * PURA: mapeia sinais crus em um laudo. Sem IO — toda a regra de "o que conta
 * como degradado" vive aqui, então o teste não precisa de rede nem de banco.
 */
export function evaluateHealth(input: HealthInputs): HealthReport {
  const { now, databaseOk, lastCronRunAt, stuckBillingEvents, evolutionHealth } = input;

  const lastRunMinutesAgo = lastCronRunAt
    ? Math.floor((now.getTime() - lastCronRunAt.getTime()) / 60_000)
    : null;
  const cronOk = lastRunMinutesAgo !== null && lastRunMinutesAgo <= CRON_STALE_MINUTES;

  const billingOk = stuckBillingEvents === 0;

  // NOT_CONFIGURED não é falha: é o estado de dev e de tenant que ainda não
  // conectou o WhatsApp. Só DOWN (configurado mas inacessível) derruba a saúde.
  const evolutionOk = evolutionHealth !== "DOWN";

  const checks: HealthReport["checks"] = {
    database: { ok: databaseOk },
    cron: { ok: cronOk, lastRunMinutesAgo, thresholdMinutes: CRON_STALE_MINUTES },
    billing: { ok: billingOk, stuckEvents: stuckBillingEvents },
    evolution: { ok: evolutionOk, health: evolutionHealth },
  };

  const status: HealthStatus = Object.values(checks).every((c) => c.ok) ? "ok" : "degraded";
  return { status, timestamp: now.toISOString(), checks };
}

/** Coleta os sinais reais (Postgres + Evolution) e produz o laudo. */
export async function runHealthChecks(now = new Date()): Promise<HealthReport> {
  let databaseOk = true;
  let lastCronRunAt: Date | null = null;
  let stuckBillingEvents = 0;

  try {
    const lastCron = await prisma.auditLog.findFirst({
      where: { action: "cron.run" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    lastCronRunAt = lastCron?.createdAt ?? null;

    stuckBillingEvents = await prisma.billingEvent.count({
      where: {
        processedAt: null,
        createdAt: { lt: new Date(now.getTime() - BILLING_STUCK_MINUTES * 60_000) },
      },
    });
  } catch {
    // Se o Postgres não responde, o resto não importa: degradado por DB.
    databaseOk = false;
  }

  let evolutionHealth: EvolutionHealth;
  try {
    evolutionHealth = await checkEvolutionHealth();
  } catch {
    evolutionHealth = "DOWN";
  }

  return evaluateHealth({ now, databaseOk, lastCronRunAt, stuckBillingEvents, evolutionHealth });
}
