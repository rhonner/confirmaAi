import { describe, it, expect, afterEach } from "vitest";
import { getAdminEmails, isAdminEmail } from "../../src/lib/admin";

const ORIGINAL = process.env.ADMIN_EMAILS;
afterEach(() => {
  process.env.ADMIN_EMAILS = ORIGINAL;
});

describe("admin allowlist", () => {
  it("parseia lista separada por vírgula, trim + lowercase", () => {
    process.env.ADMIN_EMAILS = " A@x.com , B@Y.com ";
    expect(getAdminEmails()).toEqual(["a@x.com", "b@y.com"]);
  });

  it("isAdminEmail é case-insensitive", () => {
    process.env.ADMIN_EMAILS = "admin@clinica.com";
    expect(isAdminEmail("ADMIN@clinica.com")).toBe(true);
    expect(isAdminEmail("admin@clinica.com")).toBe(true);
  });

  it("nega quem não está na lista", () => {
    process.env.ADMIN_EMAILS = "admin@clinica.com";
    expect(isAdminEmail("outro@x.com")).toBe(false);
  });

  it("nega null/undefined/vazio", () => {
    process.env.ADMIN_EMAILS = "admin@clinica.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("sem ADMIN_EMAILS setado → ninguém é admin", () => {
    delete process.env.ADMIN_EMAILS;
    expect(getAdminEmails()).toEqual([]);
    expect(isAdminEmail("admin@clinica.com")).toBe(false);
  });
});
