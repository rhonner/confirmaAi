import { describe, it, expect } from "vitest";
import {
  isoToBr,
  brToIso,
  maskBrDate,
  isValidIsoDate,
  isLeapYear,
  isBirthdayOn,
  ageOn,
  daysUntilBirthday,
  occurrenceInYear,
  splitBirthdays,
} from "@/lib/birthday";
import { todayIsoInAppTz } from "@/lib/timezone";

// `Patient.birthDate` é DATA CIVIL em string "yyyy-MM-dd" — de propósito, para
// nenhum aniversário deslizar de dia por fuso. Ver src/lib/birthday.ts.

describe("isValidIsoDate", () => {
  it("aceita data real", () => {
    expect(isValidIsoDate("1990-03-15")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // bissexto
  });

  it("rejeita data que não existe no calendário", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false); // 2026 não é bissexto
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
  });

  it("rejeita formato errado (o campo NÃO é ISO com hora)", () => {
    expect(isValidIsoDate("15/03/1990")).toBe(false);
    expect(isValidIsoDate("1990-3-15")).toBe(false);
    expect(isValidIsoDate("1990-03-15T00:00:00.000Z")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("isLeapYear", () => {
  it("segue a regra dos séculos", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // divisível por 100 e não por 400
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe("isBirthdayOn", () => {
  it("casa por mês/dia, ignorando o ano", () => {
    expect(isBirthdayOn("1990-07-24", "2026-07-24")).toBe(true);
    expect(isBirthdayOn("1990-07-24", "2026-07-25")).toBe(false);
  });

  it("29/02 ANTECIPA para 28/02 em ano não-bissexto", () => {
    expect(isBirthdayOn("2000-02-29", "2026-02-28")).toBe(true);
    expect(isBirthdayOn("2000-02-29", "2026-03-01")).toBe(false);
  });

  it("29/02 cai no próprio dia em ano bissexto (e NÃO no 28)", () => {
    expect(isBirthdayOn("2000-02-29", "2024-02-29")).toBe(true);
    expect(isBirthdayOn("2000-02-29", "2024-02-28")).toBe(false);
  });

  it("quem nasceu em 28/02 não vira aniversariante do 29", () => {
    expect(isBirthdayOn("1990-02-28", "2024-02-29")).toBe(false);
    expect(isBirthdayOn("1990-02-28", "2026-02-28")).toBe(true);
  });

  it("data inválida nunca faz aniversário (não explode)", () => {
    expect(isBirthdayOn("", "2026-07-24")).toBe(false);
    expect(isBirthdayOn("1990-02-30", "2026-07-24")).toBe(false);
  });
});

describe("ageOn", () => {
  it("conta ano completo", () => {
    expect(ageOn("1990-07-24", "2026-07-24")).toBe(36); // fez hoje
    expect(ageOn("1990-07-25", "2026-07-24")).toBe(35); // faz amanhã
    expect(ageOn("1990-12-31", "2026-01-01")).toBe(35);
  });

  it("recém-nascido tem 0, e data futura devolve null", () => {
    expect(ageOn("2026-07-24", "2026-07-24")).toBe(0);
    expect(ageOn("2030-01-01", "2026-07-24")).toBeNull();
  });
});

describe("daysUntilBirthday", () => {
  it("0 quando é hoje", () => {
    expect(daysUntilBirthday("1990-07-24", "2026-07-24")).toBe(0);
  });

  it("conta os dias que faltam no mesmo ano", () => {
    expect(daysUntilBirthday("1990-07-31", "2026-07-24")).toBe(7);
    expect(daysUntilBirthday("1990-08-01", "2026-07-24")).toBe(8);
  });

  it("atravessa a virada do ano", () => {
    expect(daysUntilBirthday("1990-01-01", "2026-12-31")).toBe(1);
  });

  it("29/02 usa 28/02 quando o próximo ano não é bissexto", () => {
    expect(occurrenceInYear("2000-02-29", 2026)).toBe("2026-02-28");
    expect(occurrenceInYear("2000-02-29", 2028)).toBe("2028-02-29");
    expect(daysUntilBirthday("2000-02-29", "2026-02-26")).toBe(2);
  });
});

describe("splitBirthdays", () => {
  const people = [
    { id: "1", name: "Zoe", phone: "+5511999990001", birthDate: "1990-07-24" },
    { id: "2", name: "Ana", phone: "+5511999990002", birthDate: "1985-07-24" },
    { id: "3", name: "Bruno", phone: "+5511999990003", birthDate: "1979-07-27" },
    { id: "4", name: "Carla", phone: "+5511999990004", birthDate: "1992-08-20" },
    { id: "5", name: "Dan", phone: "+5511999990005", birthDate: "" },
  ];

  it("separa hoje × próximos 7 dias, ordenando por proximidade e nome", () => {
    const { today, upcoming } = splitBirthdays(people, "2026-07-24");
    expect(today.map((p) => p.name)).toEqual(["Ana", "Zoe"]); // alfabético
    expect(upcoming.map((p) => [p.name, p.inDays])).toEqual([["Bruno", 3]]);
  });

  it("ignora quem não tem data e quem está fora da janela", () => {
    const { today, upcoming } = splitBirthdays(people, "2026-08-01");
    expect(today).toEqual([]);
    expect(upcoming).toEqual([]); // Carla (20/08) está a 19 dias
  });

  it("janela configurável alcança quem está mais longe", () => {
    const { upcoming } = splitBirthdays(people, "2026-08-01", 30);
    expect(upcoming.map((p) => p.name)).toEqual(["Carla"]);
  });
});

describe("integração com o fuso do app", () => {
  it("todayIsoInAppTz devolve 'yyyy-MM-dd' válido (é o único produtor de hoje)", () => {
    const today = todayIsoInAppTz();
    expect(isValidIsoDate(today)).toBe(true);
  });

  it("REGRESSÃO de fuso: 02:30Z do dia 25 ainda é dia 24 em São Paulo", () => {
    // Com `new Date().getDate()` no servidor (UTC) o card viraria de dia às
    // 21:00 BRT — mesma classe de bug do dashboard. Aqui provamos a regra
    // usando a data que o helper de fuso produziria para esse instante.
    const instant = new Date("2026-07-25T02:30:00.000Z");
    const spDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
    expect(spDate).toBe("2026-07-24");
    expect(isBirthdayOn("1990-07-24", spDate)).toBe(true);
    expect(isBirthdayOn("1990-07-25", spDate)).toBe(false);
  });
});

describe("conversores de exibição (dd/mm/aaaa ↔ yyyy-MM-dd)", () => {
  it("isoToBr formata por fatia, sem Date", () => {
    expect(isoToBr("1990-03-15")).toBe("15/03/1990");
    expect(isoToBr(null)).toBe("");
    expect(isoToBr("15/03/1990")).toBe(""); // já formatado não é ISO
  });

  it("brToIso converte só quando a data existe de verdade", () => {
    expect(brToIso("15/03/1990")).toBe("1990-03-15");
    expect(brToIso("15031990")).toBe("1990-03-15"); // aceita sem barras
    expect(brToIso("29/02/2024")).toBe("2024-02-29");
    expect(brToIso("29/02/2026")).toBe(""); // 2026 não é bissexto
    expect(brToIso("31/04/2020")).toBe("");
    expect(brToIso("15/03/19")).toBe(""); // incompleto
    expect(brToIso("")).toBe("");
  });

  it("round-trip preserva o dia (é o ponto do formato civil)", () => {
    for (const iso of ["1990-03-15", "2000-02-29", "1978-12-31", "2026-01-01"]) {
      expect(brToIso(isoToBr(iso))).toBe(iso);
    }
  });

  it("maskBrDate formata progressivamente enquanto digita", () => {
    expect(maskBrDate("1")).toBe("1");
    expect(maskBrDate("15")).toBe("15");
    expect(maskBrDate("153")).toBe("15/3");
    expect(maskBrDate("1503")).toBe("15/03");
    expect(maskBrDate("150319")).toBe("15/03/19");
    expect(maskBrDate("15031990")).toBe("15/03/1990");
    expect(maskBrDate("15/03/1990")).toBe("15/03/1990"); // idempotente
    expect(maskBrDate("150319901234")).toBe("15/03/1990"); // cap em 8 dígitos
    expect(maskBrDate("abc15xx03")).toBe("15/03");
  });
});
