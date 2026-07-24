import { describe, it, expect } from "vitest";
import {
  GENDER_LABELS,
  GENDER_OPTIONS,
  SEX_LABELS,
  SEX_OPTIONS,
  formatGender,
  formatSex,
  normalizeGender,
} from "@/lib/gender";
import { Gender, Sex } from "@/generated/prisma/client";

// SEXO (clínico) e IDENTIDADE DE GÊNERO são campos separados de propósito
// (esclarecimento do dono, 2026-07-24). Ver src/lib/gender.ts.

describe("catálogo de sexo (clínico)", () => {
  it("toda opção do enum tem rótulo em pt-BR", () => {
    for (const value of Object.values(Sex)) {
      expect(SEX_LABELS[value], `sem rótulo para ${value}`).toBeTruthy();
    }
  });

  it("a ordem de exibição cobre o enum inteiro, sem repetição", () => {
    expect(new Set(SEX_OPTIONS).size).toBe(SEX_OPTIONS.length);
    expect(new Set(SEX_OPTIONS)).toEqual(new Set(Object.values(Sex)));
  });

  it("formatSex devolve rótulo, e vazio quando não informado no cadastro", () => {
    expect(formatSex("FEMALE")).toBe("Feminino");
    expect(formatSex("INTERSEX")).toBe("Intersexo");
    expect(formatSex(null)).toBe("");
  });

  it("NÃO mistura as categorias: sexo não tem opção de identidade e vice-versa", () => {
    expect(SEX_OPTIONS).not.toContain("TRANS_WOMAN" as never);
    expect(SEX_OPTIONS).not.toContain("SELF_DESCRIBED" as never);
    expect(GENDER_OPTIONS).not.toContain("INTERSEX" as never);
  });
});

describe("catálogo de gênero", () => {
  it("toda opção do enum tem rótulo em pt-BR", () => {
    for (const value of Object.values(Gender)) {
      expect(GENDER_LABELS[value], `sem rótulo para ${value}`).toBeTruthy();
    }
  });

  it("a ordem de exibição cobre o enum inteiro, sem repetição", () => {
    expect(new Set(GENDER_OPTIONS).size).toBe(GENDER_OPTIONS.length);
    expect(new Set(GENDER_OPTIONS)).toEqual(new Set(Object.values(Gender)));
  });

  it("termina nas duas meta-opções (autodescrever, não informar)", () => {
    expect(GENDER_OPTIONS.slice(-2)).toEqual(["SELF_DESCRIBED", "NOT_INFORMED"]);
  });
});

describe("formatGender", () => {
  it("usa o rótulo do enum", () => {
    expect(formatGender("TRAVESTI")).toBe("Travesti");
    expect(formatGender("NON_BINARY")).toBe("Não binário");
    expect(formatGender("CIS_WOMAN")).toBe("Mulher cisgênero");
  });

  it("autodescrição VENCE o rótulo genérico", () => {
    expect(formatGender("SELF_DESCRIBED", "Agênero fluido")).toBe("Agênero fluido");
  });

  it("autodescrição vazia cai no rótulo, não em string vazia", () => {
    expect(formatGender("SELF_DESCRIBED", "   ")).toBe("Prefiro me autodescrever");
    expect(formatGender("SELF_DESCRIBED", null)).toBe("Prefiro me autodescrever");
  });

  it("sem gênero → string vazia (campo é sempre opcional)", () => {
    expect(formatGender(null)).toBe("");
    expect(formatGender(undefined)).toBe("");
  });

  it("NOT_INFORMED é um valor exibível, diferente de vazio", () => {
    expect(formatGender("NOT_INFORMED")).toBe("Prefiro não informar");
  });
});

describe("normalizeGender", () => {
  it("APAGA a autodescrição ao sair de SELF_DESCRIBED (privacidade)", () => {
    expect(
      normalizeGender({ gender: "CIS_WOMAN", genderSelfDescribed: "Mulher trans não binária" }),
    ).toEqual({ gender: "CIS_WOMAN", genderSelfDescribed: null });
  });

  it("mantém e apara a autodescrição quando é SELF_DESCRIBED", () => {
    expect(normalizeGender({ gender: "SELF_DESCRIBED", genderSelfDescribed: "  Agênero  " })).toEqual({
      gender: "SELF_DESCRIBED",
      genderSelfDescribed: "Agênero",
    });
  });

  it("SELF_DESCRIBED sem texto guarda null (não string vazia)", () => {
    expect(normalizeGender({ gender: "SELF_DESCRIBED", genderSelfDescribed: "" })).toEqual({
      gender: "SELF_DESCRIBED",
      genderSelfDescribed: null,
    });
  });

  it("corta a autodescrição no limite da coluna (60)", () => {
    const longo = "x".repeat(120);
    const out = normalizeGender({ gender: "SELF_DESCRIBED", genderSelfDescribed: longo });
    expect(out.genderSelfDescribed).toHaveLength(60);
  });

  it("ausência de gênero limpa os dois campos", () => {
    expect(normalizeGender({})).toEqual({ gender: null, genderSelfDescribed: null });
    expect(normalizeGender({ gender: null, genderSelfDescribed: "resto" })).toEqual({
      gender: null,
      genderSelfDescribed: null,
    });
  });
});
