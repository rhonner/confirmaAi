import { describe, it, expect } from "vitest";
import {
  accessTokenIsFresh,
  appOriginEventId,
  APP_ORIGIN_TAG,
  APP_ORIGIN_VALUE,
  buildEventResource,
  is403Transient,
  isAppOriginRaw,
  mapGoogleEvent,
  mapGoogleEventDetail,
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

// ---------------------------------------------------------------------------
// Fase C — firewall app→Google (loop-prevention) + builder do evento espelho
// ---------------------------------------------------------------------------

const appOriginRaw = (over: Partial<RawGoogleEvent> = {}): RawGoogleEvent => ({
  id: "mirror-1",
  status: "confirmed",
  summary: "João Silva",
  start: { dateTime: "2026-07-07T14:00:00-03:00" },
  end: { dateTime: "2026-07-07T15:00:00-03:00" },
  eventType: "default",
  extendedProperties: { private: { [APP_ORIGIN_TAG]: APP_ORIGIN_VALUE } },
  ...over,
});

describe("firewall Fase C — eventos de origem-app somem do overlay/prefill", () => {
  it("isAppOriginRaw detecta a tag", () => {
    expect(isAppOriginRaw(appOriginRaw())).toBe(true);
    expect(isAppOriginRaw({ id: "x", extendedProperties: { private: {} } })).toBe(false);
    expect(isAppOriginRaw({ id: "x" })).toBe(false);
  });

  it("mapGoogleEvent descarta um evento origem-app (não vira bloco promovível)", () => {
    expect(mapGoogleEvent(appOriginRaw())).toBeNull();
  });

  it("mapGoogleEventDetail descarta um evento origem-app (não prefilla a promoção)", () => {
    expect(mapGoogleEventDetail(appOriginRaw())).toBeNull();
  });

  it("evento de terceiro (sem a tag) continua passando", () => {
    expect(mapGoogleEvent(appOriginRaw({ extendedProperties: undefined }))).not.toBeNull();
  });
});

describe("appOriginEventId — id determinístico e válido no Google (base32hex)", () => {
  it("determinístico: mesmo appointmentId → mesmo id", () => {
    expect(appOriginEventId("appt-abc")).toBe(appOriginEventId("appt-abc"));
  });

  it("ids diferentes para agendamentos diferentes", () => {
    expect(appOriginEventId("appt-a")).not.toBe(appOriginEventId("appt-b"));
  });

  it("respeita a regra do Google: base32hex (a-v + 0-9), 5–1024 chars", () => {
    const id = appOriginEventId("cmxyz123-appointment-cuid");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});

describe("buildEventResource — recurso do evento espelho", () => {
  const base = {
    appointmentId: "appt-1",
    userId: "user-1",
    summary: "Maria Souza",
    start: new Date("2026-07-07T17:00:00.000Z"),
    durationMinutes: 45,
  };

  it("usa o id determinístico, status confirmed, o fuso BR e calcula o fim por duração", () => {
    const r = buildEventResource({ ...base, description: "obs" }) as Record<string, any>;
    expect(r.id).toBe(appOriginEventId("appt-1"));
    expect(r.status).toBe("confirmed");
    expect(r.summary).toBe("Maria Souza");
    expect(r.description).toBe("obs");
    expect(r.start).toEqual({ dateTime: "2026-07-07T17:00:00.000Z", timeZone: "America/Sao_Paulo" });
    expect(r.end).toEqual({ dateTime: "2026-07-07T17:45:00.000Z", timeZone: "America/Sao_Paulo" });
  });

  it("carrega a tag de origem-app e NÃO adiciona convidados (não emailar o paciente)", () => {
    const r = buildEventResource(base) as Record<string, any>;
    expect(r.extendedProperties.private[APP_ORIGIN_TAG]).toBe(APP_ORIGIN_VALUE);
    expect(r.extendedProperties.private.confirmaaiAppointmentId).toBe("appt-1");
    expect("attendees" in r).toBe(false);
  });

  it("description SEMPRE presente (vazia quando nula/vazia) — merge do patch precisa de \"\" p/ limpar", () => {
    // Omitir a chave não limpa no events.patch (merge). Enviar "" limpa.
    expect((buildEventResource(base) as Record<string, any>).description).toBe("");
    expect((buildEventResource({ ...base, description: null }) as Record<string, any>).description).toBe(
      "",
    );
    expect((buildEventResource({ ...base, description: "" }) as Record<string, any>).description).toBe(
      "",
    );
  });

  it("status confirmed permite RESSUSCITAR um evento cancelado (reabertura de agendamento)", () => {
    // O patch com este resource sobre um tombstone 'cancelled' o traz de volta.
    expect((buildEventResource(base) as Record<string, any>).status).toBe("confirmed");
  });
});
