import { describe, it, expect } from "vitest";
import { shouldRenotifyDisconnected } from "@/lib/services/whatsapp-alerts";

const h = (hours: number, from: Date) => new Date(from.getTime() + hours * 3_600_000);
const NOW = new Date("2026-06-13T12:00:00Z");

describe("shouldRenotifyDisconnected (Sprint 8 — anti-churn silencioso)", () => {
  it("não notifica sem disconnectedAt (tracking limpo = conectado ou desconexão intencional)", () => {
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt: null,
        notifiedAt: null,
        hasFutureAppointments: true,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("dedup de 24h: notificado há menos de 24h → silêncio, mesmo com pending", () => {
    const disconnectedAt = h(-30, NOW);
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt,
        notifiedAt: h(-23, NOW),
        hasFutureAppointments: true,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("reforço de 24h: sem pending, notificação imediata há 25h → manda o reforço", () => {
    const disconnectedAt = h(-25, NOW);
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt,
        notifiedAt: disconnectedAt, // email imediato da transição
        hasFutureAppointments: false,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("sem pending, após a janela de 48h → silencia (não vira spam eterno)", () => {
    const disconnectedAt = h(-72, NOW);
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt,
        notifiedAt: h(-25, NOW), // reforço de 24h já foi
        hasFutureAppointments: false,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("com pending: renotifica diariamente mesmo muito depois da queda", () => {
    const disconnectedAt = h(-24 * 10, NOW); // caiu há 10 dias
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt,
        notifiedAt: h(-25, NOW),
        hasFutureAppointments: true,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("nunca notificado (transição perdida): manda dentro da janela de 48h", () => {
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt: h(-2, NOW),
        notifiedAt: null,
        hasFutureAppointments: false,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("nunca notificado, sem pending, fora da janela → silencia", () => {
    expect(
      shouldRenotifyDisconnected({
        disconnectedAt: h(-60, NOW),
        notifiedAt: null,
        hasFutureAppointments: false,
        now: NOW,
      }),
    ).toBe(false);
  });
});
