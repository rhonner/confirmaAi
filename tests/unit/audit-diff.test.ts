import { describe, it, expect } from "vitest";
import { shallowDiff } from "@/lib/audit/log";

describe("shallowDiff", () => {
  it("returns empty diff for identical objects", () => {
    const a = { name: "x", n: 1 };
    const b = { name: "x", n: 1 };
    expect(shallowDiff(a, b)).toEqual({ before: {}, after: {} });
  });

  it("captures only changed fields", () => {
    const before = { name: "old", phone: "+5511", notes: "same" };
    const after = { name: "new", phone: "+5511", notes: "same" };
    expect(shallowDiff(before, after)).toEqual({
      before: { name: "old" },
      after: { name: "new" },
    });
  });

  it("captures multiple changes", () => {
    const before = { a: 1, b: 2, c: 3 };
    const after = { a: 10, b: 2, c: 30 };
    expect(shallowDiff(before, after)).toEqual({
      before: { a: 1, c: 3 },
      after: { a: 10, c: 30 },
    });
  });

  it("treats Date equality by timestamp, not reference", () => {
    const t = new Date("2026-05-07T12:00:00Z");
    const before = { dt: t, name: "x" };
    const after = { dt: new Date("2026-05-07T12:00:00Z"), name: "y" };
    const diff = shallowDiff(before, after);
    expect(diff.before).toEqual({ name: "x" });
    expect(diff.after).toEqual({ name: "y" });
  });

  it("handles null before (insert)", () => {
    const after = { id: "1", name: "x" };
    expect(shallowDiff(null, after)).toEqual({ before: {}, after });
  });

  it("handles null after (delete)", () => {
    const before = { id: "1", name: "x" };
    expect(shallowDiff(before, null)).toEqual({ before, after: {} });
  });

  it("treats null+null as no diff", () => {
    expect(shallowDiff(null, null)).toEqual({ before: {}, after: {} });
  });
});
