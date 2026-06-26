import { describe, it, expect } from "vitest";
import { validateCnpj, formatCnpj, canonicalizeCnpj } from "@/lib/anti-fraud/cnpj-validator";
import {
  validateDocument,
  formatDocument,
  documentKind,
  canonicalizeDocument,
} from "@/lib/anti-fraud/document";
import { hashCpf, hashCnpj, hashDocument } from "@/lib/billing/identifiers";

// Documentos estruturalmente válidos (DV módulo 11 conferidos manualmente).
const VALID_CPF = "11144477735";
const VALID_CPF_FMT = "111.444.777-35";
const VALID_CNPJ = "11222333000181";
const VALID_CNPJ_FMT = "11.222.333/0001-81";

describe("validateCnpj", () => {
  it("aceita CNPJ válido (cru e formatado)", () => {
    expect(validateCnpj(VALID_CNPJ)).toEqual({ valid: true, canonical: VALID_CNPJ });
    expect(validateCnpj(VALID_CNPJ_FMT)).toEqual({ valid: true, canonical: VALID_CNPJ });
  });

  it("rejeita dígito verificador errado", () => {
    const r = validateCnpj("11222333000180"); // DV2 trocado
    expect(r.valid).toBe(false);
    expect(r).toMatchObject({ reason: "checksum" });
  });

  it("rejeita sequência repetida", () => {
    const r = validateCnpj("11111111111111");
    expect(r.valid).toBe(false);
    expect(r).toMatchObject({ reason: "sequential" });
  });

  it("rejeita tamanho inválido", () => {
    expect(validateCnpj("123").valid).toBe(false);
    expect(validateCnpj(VALID_CPF).valid).toBe(false); // 11 dígitos não é CNPJ
  });

  it("formata e canonicaliza", () => {
    expect(formatCnpj(VALID_CNPJ)).toBe(VALID_CNPJ_FMT);
    expect(canonicalizeCnpj(VALID_CNPJ_FMT)).toBe(VALID_CNPJ);
  });
});

describe("validateDocument (CPF ou CNPJ)", () => {
  it("detecta CPF e devolve kind=CPF", () => {
    expect(validateDocument(VALID_CPF_FMT)).toEqual({
      valid: true,
      canonical: VALID_CPF,
      kind: "CPF",
    });
  });

  it("detecta CNPJ e devolve kind=CNPJ", () => {
    expect(validateDocument(VALID_CNPJ_FMT)).toEqual({
      valid: true,
      canonical: VALID_CNPJ,
      kind: "CNPJ",
    });
  });

  it("rejeita comprimento intermediário (12-13 dígitos)", () => {
    expect(validateDocument("112223330001").valid).toBe(false); // 12
    expect(validateDocument("1122233300018").valid).toBe(false); // 13
  });

  it("documentKind decide por tamanho", () => {
    expect(documentKind(VALID_CPF_FMT)).toBe("CPF");
    expect(documentKind(VALID_CNPJ_FMT)).toBe("CNPJ");
    expect(canonicalizeDocument(VALID_CNPJ_FMT)).toBe(VALID_CNPJ);
  });
});

describe("formatDocument (máscara do input)", () => {
  it("formata CPF quando 11 dígitos", () => {
    expect(formatDocument(VALID_CPF)).toBe(VALID_CPF_FMT);
  });

  it("formata CNPJ quando 14 dígitos", () => {
    expect(formatDocument(VALID_CNPJ)).toBe(VALID_CNPJ_FMT);
  });

  it("mostra dígitos crus enquanto incompleto e trunca em 14", () => {
    expect(formatDocument("123")).toBe("123");
    expect(formatDocument("112223330001")).toBe("112223330001"); // 12, ainda cru
    expect(formatDocument("11.222.333/0001-81999")).toBe(VALID_CNPJ_FMT); // trunca extra
  });
});

describe("hashDocument (anti-fraude do dono)", () => {
  it("mantém compatibilidade: hash de CPF == hashCpf (namespace cpf:)", () => {
    expect(hashDocument(VALID_CPF)).toBe(hashCpf(VALID_CPF));
    expect(hashDocument(VALID_CPF_FMT)).toBe(hashCpf(VALID_CPF));
  });

  it("CNPJ usa namespace próprio (hashCnpj) e difere do CPF", () => {
    expect(hashDocument(VALID_CNPJ)).toBe(hashCnpj(VALID_CNPJ));
    expect(hashDocument(VALID_CNPJ)).not.toBe(hashDocument(VALID_CPF));
  });
});
