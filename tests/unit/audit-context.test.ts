import { describe, it, expect } from "vitest";
import {
  runWithAuditContext,
  getAuditContext,
  requireAuditContext,
  getOrSystemContext,
} from "@/lib/audit/context";

describe("audit context (AsyncLocalStorage)", () => {
  it("returns undefined outside of run", () => {
    expect(getAuditContext()).toBeUndefined();
  });

  it("getOrSystemContext falls back to SYSTEM outside of run", () => {
    expect(getOrSystemContext()).toEqual({ actorType: "SYSTEM" });
  });

  it("runWithAuditContext exposes the context inside fn", async () => {
    await runWithAuditContext(
      { actorType: "USER", actorId: "u1", ipAddress: "1.2.3.4", userAgent: "ua" },
      async () => {
        const ctx = getAuditContext();
        expect(ctx).toEqual({
          actorType: "USER",
          actorId: "u1",
          ipAddress: "1.2.3.4",
          userAgent: "ua",
        });
      },
    );
  });

  it("isolates concurrent contexts", async () => {
    const results = await Promise.all([
      runWithAuditContext({ actorType: "USER", actorId: "a" }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getAuditContext()?.actorId;
      }),
      runWithAuditContext({ actorType: "USER", actorId: "b" }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getAuditContext()?.actorId;
      }),
      runWithAuditContext({ actorType: "WEBHOOK", actorId: "wh" }, async () => {
        return getAuditContext()?.actorId;
      }),
    ]);
    expect(results).toEqual(["a", "b", "wh"]);
  });

  it("does not leak context outside the run callback", async () => {
    await runWithAuditContext({ actorType: "USER", actorId: "u" }, async () => {
      expect(getAuditContext()?.actorId).toBe("u");
    });
    expect(getAuditContext()).toBeUndefined();
  });

  it("requireAuditContext throws if no context", () => {
    expect(() => requireAuditContext()).toThrow();
  });
});
