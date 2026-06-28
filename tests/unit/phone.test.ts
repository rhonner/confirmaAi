import { describe, it, expect } from "vitest";
import {
  getLocalDigits,
  formatPhoneDisplay,
  toCanonicalPhone,
  isValidPhone,
  brPhoneCandidates,
} from "@/lib/phone";

// Simula o round-trip controlado do <PhoneInput>: o value é canônico
// ("+55..."), o display é o local formatado, e cada tecla acrescenta um dígito
// ao display antes de reconverter para canônico. Reproduz o caminho do bug.
function typeSequence(digits: string): { canonical: string; display: string } {
  let canonical = "";
  for (const ch of digits) {
    const display = formatPhoneDisplay(canonical);
    canonical = toCanonicalPhone(display + ch);
  }
  return { canonical, display: formatPhoneDisplay(canonical) };
}

describe("getLocalDigits", () => {
  it("tira o +55 de um valor canônico mesmo curto (sinal de +)", () => {
    expect(getLocalDigits("+551")).toBe("1");
    expect(getLocalDigits("+5511")).toBe("11");
    expect(getLocalDigits("+5511999999999")).toBe("11999999999");
  });

  it("tira o 55 de string longa sem + (número colado com DDI)", () => {
    expect(getLocalDigits("5511999999999")).toBe("11999999999");
  });

  it("NÃO tira o 55 de DDD-55 local (sem + e curto)", () => {
    // (55) 99999-8888 digitado pelo usuário, sem DDI.
    expect(getLocalDigits("(55) 99999-8888")).toBe("55999998888");
    expect(getLocalDigits("11999999999")).toBe("11999999999");
  });
});

describe("PhoneInput round-trip (regressão do bug '+55' acumulando)", () => {
  it("digitar 1 dígito não vira '(55) 1'", () => {
    const { display, canonical } = typeSequence("1");
    expect(display).toBe("(1");
    expect(canonical).toBe("+551");
  });

  it("digitar um celular completo formata certo e não duplica 5", () => {
    const { display, canonical } = typeSequence("11987654321");
    expect(display).toBe("(11) 98765-4321");
    expect(canonical).toBe("+5511987654321");
  });

  it("digitar um número de DDD 55 (Santa Maria/RS) funciona", () => {
    const { display, canonical } = typeSequence("55999998888");
    expect(display).toBe("(55) 99999-8888");
    expect(canonical).toBe("+5555999998888");
  });

  it("formatPhoneDisplay e toCanonicalPhone são idempotentes no canônico", () => {
    for (const c of ["+5511987654321", "+5541999990000", "+555599999888"]) {
      expect(toCanonicalPhone(formatPhoneDisplay(c))).toBe(c);
    }
  });
});

describe("validação e candidatos (inalterados pelo fix)", () => {
  it("isValidPhone aceita 10 e 11 dígitos locais", () => {
    expect(isValidPhone("+5511999999999")).toBe(true); // celular (11)
    expect(isValidPhone("+551133334444")).toBe(true); // fixo (10)
    expect(isValidPhone("+5511")).toBe(false);
  });

  it("brPhoneCandidates gera a variante do nono dígito", () => {
    expect(brPhoneCandidates("+5541997974990")).toContain("+554197974990");
    expect(brPhoneCandidates("+554197974990")).toContain("+5541997974990");
  });
});
