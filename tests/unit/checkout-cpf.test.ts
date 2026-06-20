import { describe, it, expect } from "vitest";
import { resolveCheckoutCpf } from "@/lib/billing/checkout-cpf";

// CPF estruturalmente válido (DV correto), não-sequencial.
const VALID_CPF = "111.444.777-35";
const VALID_CPF_DIGITS = "11144477735";

describe("resolveCheckoutCpf", () => {
  it("usa o CPF do cadastro quando presente, sem persistir", () => {
    const r = resolveCheckoutCpf({ userCpf: VALID_CPF_DIGITS });
    expect(r).toEqual({ status: "ok", canonical: VALID_CPF_DIGITS, persist: false });
  });

  it("canonicaliza um userCpf formatado e não re-persiste", () => {
    const r = resolveCheckoutCpf({ userCpf: VALID_CPF });
    expect(r).toEqual({ status: "ok", canonical: VALID_CPF_DIGITS, persist: false });
  });

  it("pede CPF (required) quando conta não tem e nada foi informado", () => {
    expect(resolveCheckoutCpf({ userCpf: null })).toEqual({ status: "required" });
    expect(resolveCheckoutCpf({ userCpf: "" })).toEqual({ status: "required" });
    expect(resolveCheckoutCpf({ userCpf: null, providedCpf: "   " })).toEqual({ status: "required" });
  });

  it("aceita CPF informado válido e marca persist: true", () => {
    const r = resolveCheckoutCpf({ userCpf: null, providedCpf: VALID_CPF });
    expect(r).toEqual({ status: "ok", canonical: VALID_CPF_DIGITS, persist: true });
  });

  it("rejeita CPF com dígito verificador errado", () => {
    const r = resolveCheckoutCpf({ userCpf: null, providedCpf: "111.444.777-00" });
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.message).toMatch(/dígito verificador/);
  });

  it("rejeita CPF sequencial", () => {
    const r = resolveCheckoutCpf({ userCpf: null, providedCpf: "111.111.111-11" });
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.message).toMatch(/sequência/);
  });

  it("rejeita CPF com formato inválido (poucos dígitos)", () => {
    const r = resolveCheckoutCpf({ userCpf: null, providedCpf: "123" });
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.message).toMatch(/formato/);
  });

  it("userCpf existente tem precedência sobre providedCpf (não troca CPF da conta)", () => {
    const r = resolveCheckoutCpf({ userCpf: VALID_CPF_DIGITS, providedCpf: "999.999.999-99" });
    expect(r).toEqual({ status: "ok", canonical: VALID_CPF_DIGITS, persist: false });
  });
});
