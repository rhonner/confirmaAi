import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sendEmail, escapeHtml } from "@/lib/email";
import { checkEvolutionHealth } from "./evolution";

/**
 * Sprint 8 — Resiliência WhatsApp (anti-churn silencioso).
 *
 * Problema: a instância Evolution do tenant desconecta → o scheduler filtra
 * `whatsappStatus != CONNECTED` pra fora → confirmações param SILENCIOSAMENTE
 * → cliente paga por um produto que não faz nada. Ninguém era avisado.
 *
 * Camadas:
 * 1. Detecção na transição (webhook `connection.update` close + downgrade do
 *    poll de status) → `markWhatsappDisconnected`: timestamps + audit + email
 *    imediato.
 * 2. Sweep no cron (`runWhatsappResilience`) → reforço em 24h, renotificação
 *    diária enquanto houver agendamentos futuros em risco, health-check da
 *    Evolution e métrica de % de tenants conectados.
 * 3. Banner vermelho no dashboard (componente `WhatsappDisconnectedBanner`).
 */

const HOUR_MS = 60 * 60 * 1000;

export type RenotifyInput = {
  disconnectedAt: Date | null;
  notifiedAt: Date | null;
  hasFutureAppointments: boolean;
  now: Date;
};

/**
 * Decide se o sweep deve (re)notificar um tenant desconectado.
 *
 * - Nunca mais de 1 email por 24h (dedup por `notifiedAt`).
 * - Com agendamentos futuros: renotifica diariamente (é quem está perdendo
 *   valor AGORA).
 * - Sem agendamentos: só o reforço único de 24h (janela 24-48h após a queda);
 *   depois silencia — Sprint 10 (admin) cobre o follow-up humano.
 */
export function shouldRenotifyDisconnected(input: RenotifyInput): boolean {
  if (!input.disconnectedAt) return false;
  const hoursSinceNotified = input.notifiedAt
    ? (input.now.getTime() - input.notifiedAt.getTime()) / HOUR_MS
    : Infinity;
  if (hoursSinceNotified < 24) return false;
  if (input.hasFutureAppointments) return true;
  const hoursSinceDisconnect =
    (input.now.getTime() - input.disconnectedAt.getTime()) / HOUR_MS;
  return hoursSinceDisconnect <= 48;
}

function disconnectedEmailHtml(name: string, opts: { reinforcement: boolean; pendingCount?: number }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/configuracoes`;
  const pendingLine =
    opts.pendingCount && opts.pendingCount > 0
      ? `<p><strong>Você tem ${opts.pendingCount} agendamento(s) futuro(s)</strong> que não receberão confirmação automática enquanto o WhatsApp estiver desconectado.</p>`
      : "";
  return `
    <p>Olá ${escapeHtml(name)},</p>
    <p>${opts.reinforcement ? "Seu WhatsApp continua desconectado" : "Seu WhatsApp desconectou"} da Clínica Organizada — <strong>as confirmações automáticas dos seus agendamentos estão pausadas</strong>.</p>
    ${pendingLine}
    <p>Para reativar, basta escanear o QR code novamente:</p>
    <p><a href="${link}">Reconectar meu WhatsApp</a></p>
    <p>Se você desconectou de propósito, ignore este email.</p>
  `;
}

/**
 * Chamar na TRANSIÇÃO para desconectado (webhook `close` / downgrade do poll),
 * nunca em estado repetido — o caller verifica que o status anterior era
 * CONNECTED. Email imediato + audit. Nunca lança (resiliência > notificação).
 */
export async function markWhatsappDisconnected(
  userId: string,
  source: "webhook" | "status_poll",
): Promise<void> {
  try {
    const now = new Date();
    const user = await prisma.user.update({
      where: { id: userId },
      data: { whatsappDisconnectedAt: now },
      select: { email: true, name: true },
    });

    await audit({
      action: "whatsapp.disconnected",
      entityType: "User",
      entityId: userId,
      tenantUserId: userId,
      metadata: { source },
    });

    const sent = await sendEmail({
      to: user.email,
      subject: "Seu WhatsApp desconectou — confirmações pausadas",
      html: disconnectedEmailHtml(user.name, { reinforcement: false }),
    });
    if (sent.ok) {
      await prisma.user.update({
        where: { id: userId },
        data: { whatsappDisconnectNotifiedAt: now },
      });
    }
  } catch (error) {
    console.error("markWhatsappDisconnected failed:", error);
  }
}

/** Chamar na transição para CONNECTED — zera o tracking de desconexão. */
export function whatsappReconnectedPatch() {
  return { whatsappDisconnectedAt: null, whatsappDisconnectNotifiedAt: null };
}

export type WhatsappResilienceStats = {
  /** Emails de reforço/renotificação enviados pelo sweep. */
  whatsappRenotified: number;
  /** Tenants desconectados com agendamentos futuros (valor em risco agora). */
  whatsappDisconnectedWithPending: number;
  /** Health-check da Evolution API ("OK" | "DOWN" | "NOT_CONFIGURED"). */
  evolutionHealth: string;
  /** % de tenants com instância configurada que estão CONNECTED (0-100). */
  whatsappConnectedPct: number | null;
};

/**
 * Roda dentro do cron (`runSchedulerJobs`). Cadência real: a cada execução do
 * cron (30 min) — a dedup de 24h em `shouldRenotifyDisconnected` garante no
 * máximo 1 email/dia por tenant.
 */
export async function runWhatsappResilience(): Promise<WhatsappResilienceStats> {
  const stats: WhatsappResilienceStats = {
    whatsappRenotified: 0,
    whatsappDisconnectedWithPending: 0,
    evolutionHealth: "NOT_CONFIGURED",
    whatsappConnectedPct: null,
  };
  const now = new Date();

  // 1. Health-check da Evolution API (consumido pelo /api/health da Sprint 9).
  try {
    stats.evolutionHealth = await checkEvolutionHealth();
    if (stats.evolutionHealth === "DOWN") {
      await audit({
        action: "evolution.health_failed",
        metadata: { url: process.env.EVOLUTION_API_URL ?? null },
      });
    }
  } catch (error) {
    console.error("evolution health-check failed:", error);
  }

  // 2. Métrica agregada: % de tenants conectados (admin na Sprint 10).
  try {
    const [withInstance, connected] = await Promise.all([
      prisma.user.count({ where: { evolutionInstanceName: { not: null } } }),
      prisma.user.count({
        where: { evolutionInstanceName: { not: null }, whatsappStatus: "CONNECTED" },
      }),
    ]);
    stats.whatsappConnectedPct =
      withInstance > 0 ? Math.round((connected / withInstance) * 100) : null;
  } catch (error) {
    console.error("whatsapp connected metric failed:", error);
  }

  // 3. Sweep de desconectados: reforço 24h + renotificação diária com pending.
  try {
    const disconnected = await prisma.user.findMany({
      where: {
        whatsappStatus: { in: ["DISCONNECTED", "FAILED"] },
        whatsappDisconnectedAt: { not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
        whatsappDisconnectedAt: true,
        whatsappDisconnectNotifiedAt: true,
      },
    });

    for (const user of disconnected) {
      const pendingCount = await prisma.appointment.count({
        where: {
          userId: user.id,
          dateTime: { gt: now },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      });

      if (pendingCount > 0) {
        stats.whatsappDisconnectedWithPending++;
      }

      const notify = shouldRenotifyDisconnected({
        disconnectedAt: user.whatsappDisconnectedAt,
        notifiedAt: user.whatsappDisconnectNotifiedAt,
        hasFutureAppointments: pendingCount > 0,
        now,
      });
      if (!notify) continue;

      if (pendingCount > 0) {
        await audit({
          action: "whatsapp.disconnected_with_pending",
          entityType: "User",
          entityId: user.id,
          tenantUserId: user.id,
          metadata: { pendingCount, disconnectedAt: user.whatsappDisconnectedAt },
        });
      }

      const sent = await sendEmail({
        to: user.email,
        subject:
          pendingCount > 0
            ? "WhatsApp desconectado — você tem agendamentos sem confirmação automática"
            : "Seu WhatsApp continua desconectado — confirmações pausadas",
        html: disconnectedEmailHtml(user.name, {
          reinforcement: true,
          pendingCount,
        }),
      });
      if (sent.ok) {
        stats.whatsappRenotified++;
        await prisma.user.update({
          where: { id: user.id },
          data: { whatsappDisconnectNotifiedAt: now },
        });
      }
    }
  } catch (error) {
    console.error("whatsapp disconnection sweep failed:", error);
  }

  return stats;
}
