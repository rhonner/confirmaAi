import { describe, it, expect } from "vitest";
import { maskPhone, maskEmail, truncateMessage } from "@/lib/audit/pii";

describe("maskPhone", () => {
  it("masks BR mobile keeping last 4", () => {
    expect(maskPhone("+5511976237318")).toBe("+5511***7318");
  });
  it("masks 11-digit raw", () => {
    expect(maskPhone("11976237318")).toBe("1197***7318");
  });
  it("returns null for null/undefined/empty", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone("")).toBeNull();
  });
  it("handles short input gracefully", () => {
    expect(maskPhone("1234")).toBe("***1234");
  });
});

describe("maskEmail", () => {
  it("masks local part", () => {
    expect(maskEmail("rennohr@example.com")).toBe("r***@example.com");
  });
  it("returns *** for invalid email", () => {
    expect(maskEmail("notanemail")).toBe("***");
  });
  it("returns null for empty input", () => {
    expect(maskEmail(null)).toBeNull();
  });
});

describe("truncateMessage", () => {
  it("returns short messages unchanged", () => {
    expect(truncateMessage("hello")).toBe("hello");
  });
  it("truncates long messages with ellipsis", () => {
    const text = "a".repeat(80);
    const result = truncateMessage(text, 60);
    expect(result).toHaveLength(61);
    expect(result?.endsWith("…")).toBe(true);
  });
  it("returns null for empty input", () => {
    expect(truncateMessage(null)).toBeNull();
  });
});
