import { describe, it, expect } from "vitest";
import {
  isDisposableEmail,
  disposableDomainCount,
} from "@/lib/anti-fraud/disposable-emails";

describe("isDisposableEmail", () => {
  it("identifica domínios mainstream descartáveis", () => {
    expect(isDisposableEmail("foo@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@10minutemail.com")).toBe(true);
    expect(isDisposableEmail("x@guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("y@yopmail.com")).toBe(true);
    expect(isDisposableEmail("z@tempmail.com")).toBe(true);
  });

  it("aceita emails normais", () => {
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
    expect(isDisposableEmail("a@empresa.com.br")).toBe(false);
    expect(isDisposableEmail("dr@clinica.med.br")).toBe(false);
  });

  it("é case-insensitive no domínio", () => {
    expect(isDisposableEmail("foo@MAILINATOR.COM")).toBe(true);
    expect(isDisposableEmail("foo@MailInator.com")).toBe(true);
  });

  it("trata null/undefined/empty/sem @", () => {
    expect(isDisposableEmail(null)).toBe(false);
    expect(isDisposableEmail(undefined)).toBe(false);
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("notanemail")).toBe(false);
  });

  it("blocklist tem >= 30 domínios", () => {
    expect(disposableDomainCount()).toBeGreaterThanOrEqual(30);
  });
});
