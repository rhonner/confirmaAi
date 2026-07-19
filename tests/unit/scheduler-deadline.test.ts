import { describe, it, expect } from "vitest";
import { effectiveDeadlineMs } from "../../src/lib/services/scheduler";

const H = 3_600_000;
// Consulta em t0; helper monta o Date do agendamento.
const t0 = 1_800_000_000_000;
const appt = new Date(t0);

describe("effectiveDeadlineMs (deadline do link / auto-cancelamento)", () => {
  it("envio no prazo normal: deadline = dateTime - reminderHoursBefore", () => {
    // Enviado 24h antes, reminderHoursBefore=6 → deadline = t0 - 6h.
    const sentAt = t0 - 24 * H;
    expect(effectiveDeadlineMs(appt, 6, sentAt)).toBe(t0 - 6 * H);
  });

  it("envio TARDE (nominal já passou): ganha piso de 2h de GRACE — não expira na hora", () => {
    // Agendamento de última hora: enviado só 2h antes, reminderHoursBefore=6.
    // Nominal = t0-6h (4h no passado em relação ao envio). Sem GRACE o link
    // nasceria expirado e seria auto-cancelado. Com GRACE: sentAt+2h = t0.
    const sentAt = t0 - 2 * H;
    const d = effectiveDeadlineMs(appt, 6, sentAt);
    expect(d).toBe(t0); // capped no dateTime (sentAt+2h == t0)
    expect(d).toBeGreaterThan(sentAt); // NÃO expirado no envio
  });

  it("envio tardo com folga: deadline = sentAt + GRACE quando abaixo do dateTime", () => {
    // Enviado 5h antes, reminderHoursBefore=6 → nominal t0-6h (1h antes do envio).
    // GRACE floor = sentAt+2h = t0-3h, abaixo do dateTime → deadline = t0-3h.
    const sentAt = t0 - 5 * H;
    expect(effectiveDeadlineMs(appt, 6, sentAt)).toBe(t0 - 3 * H);
  });

  it("nunca passa do horário da consulta (teto = dateTime)", () => {
    // Enviado 30min antes; GRACE empurraria além do dateTime → capado no dateTime.
    const sentAt = t0 - 0.5 * H;
    expect(effectiveDeadlineMs(appt, 6, sentAt)).toBe(t0);
  });
});
