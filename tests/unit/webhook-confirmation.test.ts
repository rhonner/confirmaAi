import { describe, it, expect } from "vitest";
import { buildConfirmationAck } from "@/lib/services/webhook-confirmation";

// 2026-06-27 23:30 em America/Sao_Paulo (UTC-3) = 2026-06-28T02:30:00Z.
// Igual ao agendamento do print de teste da sócia (sábado, 27/06 às 23:30).
const SAT_2330 = new Date("2026-06-28T02:30:00.000Z");

describe("buildConfirmationAck", () => {
  it("ack de confirmação nomeia data e hora do agendamento (timezone BRT)", () => {
    const msg = buildConfirmationAck("CONFIRMED", SAT_2330);
    expect(msg).toContain("✅");
    expect(msg).toContain("confirmada");
    expect(msg).toContain("27 de junho");
    expect(msg).toContain("23:30");
  });

  it("ack de cancelamento nomeia data e hora e orienta remarcar", () => {
    const msg = buildConfirmationAck("CANCELED", SAT_2330);
    expect(msg).toContain("❌");
    expect(msg).toContain("cancelada");
    expect(msg).toContain("27 de junho");
    expect(msg).toContain("23:30");
    expect(msg).toContain("remarcar");
  });

  it("confirmação e cancelamento produzem textos distintos", () => {
    expect(buildConfirmationAck("CONFIRMED", SAT_2330)).not.toBe(
      buildConfirmationAck("CANCELED", SAT_2330),
    );
  });
});
