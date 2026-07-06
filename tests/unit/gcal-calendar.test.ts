import { describe, it, expect } from "vitest";
import {
  accessTokenIsFresh,
  is403Transient,
  mapGoogleEvent,
  type RawGoogleEvent,
} from "@/lib/services/google/calendar";

const timed = (over: Partial<RawGoogleEvent> = {}): RawGoogleEvent => ({
  id: "ev-1",
  status: "confirmed",
  summary: "Consulta João",
  start: { dateTime: "2026-07-07T14:00:00-03:00" },
  end: { dateTime: "2026-07-07T15:00:00-03:00" },
  eventType: "default",
  htmlLink: "https://calendar.google.com/event?eid=abc",
  ...over,
});

describe("mapGoogleEvent (matriz 'formato do evento')", () => {
  it("evento cronometrado vira DTO com horários e link", () => {
    const dto = mapGoogleEvent(timed());
    expect(dto).toEqual({
      id: "ev-1",
      title: "Consulta João",
      start: "2026-07-07T14:00:00-03:00",
      end: "2026-07-07T15:00:00-03:00",
      allDay: false,
      htmlLink: "https://calendar.google.com/event?eid=abc",
    });
  });

  it("evento de dia inteiro preserva datas (end exclusivo do Google)", () => {
    const dto = mapGoogleEvent(
      timed({ start: { date: "2026-07-07" }, end: { date: "2026-07-08" } }),
    );
    expect(dto?.allDay).toBe(true);
    expect(dto?.start).toBe("2026-07-07");
    expect(dto?.end).toBe("2026-07-08");
  });

  it("cancelado (soft-delete do Google) é filtrado", () => {
    expect(mapGoogleEvent(timed({ status: "cancelled" }))).toBeNull();
  });

  it("tipos de evento que são ruído (OOO/focus/aniversário/local) são filtrados", () => {
    for (const eventType of ["outOfOffice", "focusTime", "workingLocation", "birthday"]) {
      expect(mapGoogleEvent(timed({ eventType }))).toBeNull();
    }
  });

  it("default e fromGmail passam", () => {
    expect(mapGoogleEvent(timed({ eventType: "default" }))).not.toBeNull();
    expect(mapGoogleEvent(timed({ eventType: "fromGmail" }))).not.toBeNull();
  });

  it("privado/confidencial não vaza o título — vira 'Ocupado'", () => {
    expect(mapGoogleEvent(timed({ visibility: "private" }))?.title).toBe("Ocupado");
    expect(mapGoogleEvent(timed({ visibility: "confidential" }))?.title).toBe("Ocupado");
    expect(mapGoogleEvent(timed({ visibility: "public" }))?.title).toBe("Consulta João");
  });

  it("sem título vira '(Sem título)'", () => {
    expect(mapGoogleEvent(timed({ summary: undefined }))?.title).toBe("(Sem título)");
    expect(mapGoogleEvent(timed({ summary: "   " }))?.title).toBe("(Sem título)");
  });

  it("sem id ou sem horários é descartado", () => {
    expect(mapGoogleEvent(timed({ id: undefined }))).toBeNull();
    expect(mapGoogleEvent(timed({ start: undefined, end: undefined }))).toBeNull();
    expect(mapGoogleEvent(timed({ end: {} }))).toBeNull();
  });
});

describe("is403Transient (rate-limit ≠ permissão revogada)", () => {
  const body = (...reasons: string[]) => ({
    error: { errors: reasons.map((reason) => ({ reason })) },
  });

  it("rate-limit/quota são transitórios (não pedem reconsent)", () => {
    expect(is403Transient(body("rateLimitExceeded"))).toBe(true);
    expect(is403Transient(body("userRateLimitExceeded"))).toBe(true);
    expect(is403Transient(body("dailyLimitExceeded"))).toBe(true);
    expect(is403Transient(body("quotaExceeded"))).toBe(true);
    expect(is403Transient(body("forbidden", "rateLimitExceeded"))).toBe(true);
  });

  it("permissão revogada/insuficiente NÃO é transitório", () => {
    expect(is403Transient(body("insufficientPermissions"))).toBe(false);
    expect(is403Transient(body("forbidden"))).toBe(false);
    expect(is403Transient(body("accessNotConfigured"))).toBe(false);
  });

  it("corpo ilegível/vazio → trata como permissão (reconsent é recuperável)", () => {
    expect(is403Transient(null)).toBe(false);
    expect(is403Transient({})).toBe(false);
    expect(is403Transient({ error: {} })).toBe(false);
    expect(is403Transient({ error: { errors: [] } })).toBe(false);
  });
});

describe("accessTokenIsFresh", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const inSeconds = (s: number) => new Date(now.getTime() + s * 1000);

  it("sem expiração registrada → não é fresco (força refresh)", () => {
    expect(accessTokenIsFresh(null, now)).toBe(false);
    expect(accessTokenIsFresh(undefined, now)).toBe(false);
  });

  it("expirado ou dentro do buffer de 60s → não é fresco", () => {
    expect(accessTokenIsFresh(inSeconds(-10), now)).toBe(false);
    expect(accessTokenIsFresh(inSeconds(30), now)).toBe(false);
    expect(accessTokenIsFresh(inSeconds(60), now)).toBe(false);
  });

  it("com folga além do buffer → fresco", () => {
    expect(accessTokenIsFresh(inSeconds(61), now)).toBe(true);
    expect(accessTokenIsFresh(inSeconds(3600), now)).toBe(true);
  });
});
