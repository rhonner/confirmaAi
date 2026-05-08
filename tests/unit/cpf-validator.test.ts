import { describe, it, expect } from "vitest";
import {
  validateCpf,
  canonicalizeCpf,
  formatCpf,
} from "@/lib/anti-fraud/cpf-validator";

describe("canonicalizeCpf", () => {
  it("removes all non-digits", () => {
    expect(canonicalizeCpf("111.444.777-35")).toBe("11144477735");
    expect(canonicalizeCpf(" 111 444 777 35 ")).toBe("11144477735");
  });
});

describe("validateCpf", () => {
  it("accepts valid CPFs", () => {
    // Conhecidos válidos pela algoritmo de DV (não são CPFs reais).
    expect(validateCpf("111.444.777-35")).toEqual({
      valid: true,
      canonical: "11144477735",
    });
    expect(validateCpf("529.982.247-25")).toMatchObject({ valid: true });
  });

  it("rejects sequential CPFs", () => {
    expect(validateCpf("111.111.111-11")).toEqual({
      valid: false,
      reason: "sequential",
    });
    expect(validateCpf("00000000000")).toMatchObject({ valid: false, reason: "sequential" });
    expect(validateCpf("99999999999")).toMatchObject({ valid: false, reason: "sequential" });
  });

  it("rejects wrong length", () => {
    expect(validateCpf("123")).toMatchObject({ valid: false, reason: "format" });
    expect(validateCpf("123456789012")).toMatchObject({
      valid: false,
      reason: "format",
    });
  });

  it("rejects wrong checksum", () => {
    expect(validateCpf("111.444.777-99")).toMatchObject({
      valid: false,
      reason: "checksum",
    });
    // Trocar último dígito de um válido conhecido.
    expect(validateCpf("11144477734")).toMatchObject({
      valid: false,
      reason: "checksum",
    });
  });

  it("rejects empty / null / undefined", () => {
    expect(validateCpf("")).toMatchObject({ valid: false, reason: "format" });
    expect(validateCpf(null)).toMatchObject({ valid: false, reason: "format" });
    expect(validateCpf(undefined)).toMatchObject({
      valid: false,
      reason: "format",
    });
  });
});

describe("formatCpf", () => {
  it("formats canonical 11-digit", () => {
    expect(formatCpf("11144477735")).toBe("111.444.777-35");
  });
  it("returns input unchanged if not 11 digits", () => {
    expect(formatCpf("12345")).toBe("12345");
  });
});
