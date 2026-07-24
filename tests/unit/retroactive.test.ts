import { describe, it, expect } from "vitest";
import { isRetroactive } from "@/lib/retroactive";

// Regra do agendamento RETROATIVO (2026-07-24): lançar no passado é permitido
// (organização), mas o registro sai da automação. Ver
// .context/features/appointments.md § Retroativo.

describe("isRetroactive", () => {
  const now = new Date("2026-07-24T15:00:00.000Z");

  it("horário no passado → retroativo", () => {
    expect(isRetroactive(new Date("2026-07-24T14:59:59.000Z"), now)).toBe(true);
    expect(isRetroactive(new Date("2026-07-01T09:00:00.000Z"), now)).toBe(true);
  });

  it("horário no futuro → NÃO retroativo (fluxo normal de confirmação/no-show)", () => {
    expect(isRetroactive(new Date("2026-07-24T15:00:01.000Z"), now)).toBe(false);
    expect(isRetroactive(new Date("2026-08-01T09:00:00.000Z"), now)).toBe(false);
  });

  it("exatamente agora → NÃO retroativo (comparação estrita)", () => {
    expect(isRetroactive(new Date(now.getTime()), now)).toBe(false);
  });

  it("usa o relógio real quando `now` é omitido", () => {
    expect(isRetroactive(new Date(Date.now() - 60_000))).toBe(true);
    expect(isRetroactive(new Date(Date.now() + 60_000))).toBe(false);
  });
});
