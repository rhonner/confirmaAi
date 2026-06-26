import { describe, it, expect } from "vitest";
import { centsToDisplay, rawToCents } from "@/lib/currency-mask";

describe("máscara monetária acumuladora (centavos, RTL)", () => {
  it("formata centavos em pt-BR (vazio quando 0)", () => {
    expect(centsToDisplay(0)).toBe("");
    expect(centsToDisplay(5)).toBe("0,05");
    expect(centsToDisplay(57)).toBe("0,57");
    expect(centsToDisplay(573)).toBe("5,73");
    expect(centsToDisplay(5731)).toBe("57,31");
    expect(centsToDisplay(57312)).toBe("573,12");
    expect(centsToDisplay(573128)).toBe("5.731,28");
    expect(centsToDisplay(9999999)).toBe("99.999,99");
  });

  it("acumula da direita conforme o usuário digita (sequência do exemplo)", () => {
    // Cada passo = display anterior + novo dígito → re-extrai os centavos.
    let display = "";
    const type = (d: string) => {
      const cents = rawToCents(display + d);
      display = centsToDisplay(cents);
      return display;
    };
    expect(type("5")).toBe("0,05");
    expect(type("7")).toBe("0,57");
    expect(type("3")).toBe("5,73");
    expect(type("1")).toBe("57,31");
    expect(type("2")).toBe("573,12");
    expect(type("8")).toBe("5.731,28");
  });

  it("limita a 7 dígitos (99.999,99)", () => {
    expect(rawToCents("99999999")).toBe(9999999); // 8 dígitos → trunca em 7
    expect(rawToCents("1234567890")).toBe(1234567);
    expect(centsToDisplay(rawToCents("123456789"))).toBe("12.345,67");
  });

  it("backspace remove 1 dígito (re-extração do texto encurtado)", () => {
    expect(rawToCents("5.731,28")).toBe(573128);
    expect(rawToCents("5.731,2")).toBe(57312); // apagou o último char → 1 dígito a menos
    expect(rawToCents("0,0")).toBe(0);
    expect(rawToCents("")).toBe(0);
  });

  it("ignora caracteres não-numéricos (paste sujo)", () => {
    expect(rawToCents("R$ 12.345,67")).toBe(1234567);
    expect(rawToCents("abc")).toBe(0);
  });
});
