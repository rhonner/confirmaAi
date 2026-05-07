import { describe, it, expect } from "vitest";
import {
  formatMessage,
  formatAppointmentDate,
  formatAppointmentTime,
} from "@/lib/services/message-template";

describe("formatMessage", () => {
  it("replaces all placeholders correctly", () => {
    const template =
      "Olá {nome}, sua consulta na {clinica} está marcada para {data} às {hora}";
    const data = {
      nome: "João Silva",
      data: "segunda-feira, 17 de fevereiro",
      hora: "14:30",
      clinica: "Clínica Vida",
    };

    const result = formatMessage(template, data);

    expect(result).toBe(
      "Olá João Silva, sua consulta na Clínica Vida está marcada para segunda-feira, 17 de fevereiro às 14:30"
    );
  });

  it("handles missing variables by leaving placeholder", () => {
    const template = "Olá {nome}, sua consulta é em {data} às {hora}";
    const data = {
      nome: "Maria",
      data: "",
      hora: "15:00",
      clinica: "Clínica X",
    };

    const result = formatMessage(template, data);

    expect(result).toBe("Olá Maria, sua consulta é em  às 15:00");
  });

  it("handles multiple occurrences of same variable", () => {
    const template = "{nome}, confirme sua presença. Obrigado, {nome}!";
    const data = {
      nome: "Pedro",
      data: "hoje",
      hora: "10:00",
      clinica: "Clínica ABC",
    };

    const result = formatMessage(template, data);

    expect(result).toBe("Pedro, confirme sua presença. Obrigado, Pedro!");
  });

  it("replaces all variable types", () => {
    const template = "{nome} {data} {hora} {clinica}";
    const data = {
      nome: "A",
      data: "B",
      hora: "C",
      clinica: "D",
    };

    const result = formatMessage(template, data);

    expect(result).toBe("A B C D");
  });
});

describe("formatAppointmentDate", () => {
  it("formats date in pt-BR with weekday and month name", () => {
    // Tuesday, February 17, 2026 at 14:30
    const date = new Date("2026-02-17T14:30:00-03:00");

    const result = formatAppointmentDate(date);

    expect(result).toBe("terça-feira, 17 de fevereiro");
  });

  it("handles different months correctly", () => {
    // Thursday, January 1, 2026
    const date = new Date("2026-01-01T10:00:00-03:00");

    const result = formatAppointmentDate(date);

    expect(result).toBe("quinta-feira, 1 de janeiro");
  });

  it("formats end of month date", () => {
    // Wednesday, December 31, 2025
    const date = new Date("2025-12-31T23:59:00-03:00");

    const result = formatAppointmentDate(date);

    expect(result).toBe("quarta-feira, 31 de dezembro");
  });
});

describe("formatAppointmentTime", () => {
  it("formats time as HH:mm", () => {
    const date = new Date("2026-02-17T14:30:00-03:00");

    const result = formatAppointmentTime(date);

    expect(result).toBe("14:30");
  });

  it("handles morning times with leading zeros", () => {
    const date = new Date("2026-02-17T09:05:00-03:00");

    const result = formatAppointmentTime(date);

    expect(result).toBe("09:05");
  });

  it("handles midnight correctly", () => {
    const date = new Date("2026-02-17T00:00:00-03:00");

    const result = formatAppointmentTime(date);

    expect(result).toBe("00:00");
  });

  it("handles late evening times", () => {
    const date = new Date("2026-02-17T23:45:00-03:00");

    const result = formatAppointmentTime(date);

    expect(result).toBe("23:45");
  });

  // Regression: appointment stored as the UTC instant of "14:00 BRT"
  // should render as "14:00", not "17:00" (which was the bug on Vercel UTC).
  it("renders BRT wall-clock regardless of process timezone", () => {
    const utcInstantOf14hBrt = new Date("2026-05-07T17:00:00Z");

    expect(formatAppointmentTime(utcInstantOf14hBrt)).toBe("14:00");
    expect(formatAppointmentDate(utcInstantOf14hBrt)).toBe("quinta-feira, 7 de maio");
  });
});
