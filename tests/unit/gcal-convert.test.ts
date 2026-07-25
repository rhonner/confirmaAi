import { describe, it, expect } from "vitest";
import { extractPhone, parseEventSignals } from "@/lib/services/google/promote-signals";
import { mapGoogleEventDetail } from "@/lib/services/google/calendar";

describe("extractPhone", () => {
  it("aceita o formato canônico +55", () => {
    expect(extractPhone("+5511999998888")).toBe("+5511999998888");
  });

  it("aceita display com DDD, parênteses e hífen (11 dígitos)", () => {
    expect(extractPhone("(11) 99999-8888")).toBe("+5511999998888");
  });

  it("aceita fixo de 10 dígitos (sem nono)", () => {
    expect(extractPhone("(11) 3333-4444")).toBe("+551133334444");
  });

  it("aceita dígitos crus e com +55 na frente", () => {
    expect(extractPhone("11999998888")).toBe("+5511999998888");
    expect(extractPhone("+55 11 99999-8888")).toBe("+5511999998888");
  });

  it("acha o telefone no meio de uma frase (título típico de agenda)", () => {
    expect(extractPhone("Consulta João 11 99999-8888 amanhã")).toBe("+5511999998888");
  });

  it("retorna undefined quando não há telefone válido", () => {
    expect(extractPhone("Reunião de equipe")).toBeUndefined();
    expect(extractPhone("liga pro 123")).toBeUndefined();
    expect(extractPhone("")).toBeUndefined();
  });
});

describe("parseEventSignals", () => {
  it("extrai telefone + nome do título, removendo o prefixo de agenda", () => {
    const s = parseEventSignals({ title: "Consulta João 11 99999-8888" });
    expect(s.suggestedPhone).toBe("+5511999998888");
    expect(s.suggestedName).toBe("João");
  });

  it("usa o título como nome quando não há telefone", () => {
    const s = parseEventSignals({ title: "Maria Silva" });
    expect(s.suggestedName).toBe("Maria Silva");
    expect(s.suggestedPhone).toBeUndefined();
  });

  it("não sugere nome para evento privado — decide por isPrivate, não pelo rótulo", () => {
    const s = parseEventSignals({ title: "Ocupado", isPrivate: true });
    expect(s.suggestedName).toBeUndefined();
    expect(s.suggestedPhone).toBeUndefined();
  });

  it("privado com rótulo RENOMEADO continua sem sugerir nome (regressão: rótulo é copy)", () => {
    // Se alguém trocar a redação de "Ocupado" para outra coisa, o guard não
    // pode depender do texto — senão o rótulo vira nome de paciente e queima
    // uma vaga vitalícia de quota.
    const s = parseEventSignals({ title: "Reservado", isPrivate: true });
    expect(s.suggestedName).toBeUndefined();
  });

  it("evento NÃO privado com título 'Ocupado' é tratado como título normal", () => {
    // Contraprova: o rótulo em si não tem poder — só o booleano tem.
    const s = parseEventSignals({ title: "Ocupado", isPrivate: false });
    expect(s.suggestedName).toBe("Ocupado");
  });

  it("não sugere o prefixo de agenda como nome quando o título é só prefixo + telefone", () => {
    const s = parseEventSignals({ title: "Consulta 11 99999-8888" });
    expect(s.suggestedPhone).toBe("+5511999998888");
    expect(s.suggestedName).toBeUndefined();
  });

  it("não sugere nome quando o título é só a palavra do prefixo", () => {
    expect(parseEventSignals({ title: "Consulta" }).suggestedName).toBeUndefined();
    expect(parseEventSignals({ title: "Avaliação" }).suggestedName).toBeUndefined();
  });

  it("pega o telefone da descrição quando não está no título", () => {
    const s = parseEventSignals({ title: "Consulta Ana", description: "contato: 11999998888" });
    expect(s.suggestedPhone).toBe("+5511999998888");
    expect(s.suggestedName).toBe("Ana");
  });

  it("prefere o e-mail do 1º convidado (normalizado em minúsculas)", () => {
    const s = parseEventSignals({ title: "X", attendeeEmails: ["Fulano@Example.COM"] });
    expect(s.suggestedEmail).toBe("fulano@example.com");
  });

  it("acha e-mail no texto quando não há convidados", () => {
    const s = parseEventSignals({ title: "Retorno", description: "paciente@dominio.com.br" });
    expect(s.suggestedEmail).toBe("paciente@dominio.com.br");
  });

  it("objeto vazio para entrada vazia", () => {
    expect(parseEventSignals({})).toEqual({});
  });
});

describe("mapGoogleEventDetail (privacidade + formato)", () => {
  it("evento cronometrado normal traz descrição e convidados", () => {
    const d = mapGoogleEventDetail({
      id: "e1",
      summary: "Consulta João",
      description: "tel 11999998888",
      start: { dateTime: "2026-07-20T13:00:00-03:00" },
      end: { dateTime: "2026-07-20T14:00:00-03:00" },
      attendees: [{ email: "joao@x.com" }, { email: "" }, {}],
      htmlLink: "https://g/e1",
    });
    expect(d).not.toBeNull();
    expect(d!.title).toBe("Consulta João");
    expect(d!.description).toBe("tel 11999998888");
    expect(d!.allDay).toBe(false);
    expect(d!.isPrivate).toBe(false);
    expect(d!.attendeeEmails).toEqual(["joao@x.com"]); // vazios/ausentes filtrados
  });

  it("evento privado NÃO vaza título, descrição nem convidados", () => {
    const d = mapGoogleEventDetail({
      id: "e2",
      summary: "Sessão confidencial do paciente",
      description: "dados sensíveis",
      visibility: "private",
      start: { dateTime: "2026-07-20T13:00:00-03:00" },
      end: { dateTime: "2026-07-20T14:00:00-03:00" },
      attendees: [{ email: "secreto@x.com" }],
    });
    expect(d!.title).toBe("Ocupado");
    expect(d!.description).toBeNull();
    expect(d!.attendeeEmails).toEqual([]);
    expect(d!.isPrivate).toBe(true);
  });

  it("cancelado e sem horário → null", () => {
    expect(mapGoogleEventDetail({ id: "e3", status: "cancelled", start: { dateTime: "x" }, end: { dateTime: "y" } })).toBeNull();
    expect(mapGoogleEventDetail({ id: "e4", summary: "sem horário" })).toBeNull();
  });

  it("evento de dia inteiro marca allDay", () => {
    const d = mapGoogleEventDetail({
      id: "e5",
      summary: "Feriado",
      start: { date: "2026-07-20" },
      end: { date: "2026-07-21" },
    });
    expect(d!.allDay).toBe(true);
  });
});
