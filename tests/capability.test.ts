import { describe, expect, it } from "vitest";
import { isToolAllowed } from "../src/capability.js";

describe("capability gating", () => {
  it("safe-read allows only safe-read tools", () => {
    expect(isToolAllowed("safe-read", "safe-read")).toBe(true);
    expect(isToolAllowed("ops-write", "safe-read")).toBe(false);
    expect(isToolAllowed("admin", "safe-read")).toBe(false);
  });

  it("ops-write allows safe-read + ops-write but not admin", () => {
    expect(isToolAllowed("safe-read", "ops-write")).toBe(true);
    expect(isToolAllowed("ops-write", "ops-write")).toBe(true);
    expect(isToolAllowed("admin", "ops-write")).toBe(false);
  });

  it("admin allows every tier", () => {
    expect(isToolAllowed("safe-read", "admin")).toBe(true);
    expect(isToolAllowed("ops-write", "admin")).toBe(true);
    expect(isToolAllowed("admin", "admin")).toBe(true);
  });
});
