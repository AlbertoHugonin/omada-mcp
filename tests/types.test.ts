import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseApiResult, siteSchema } from "../src/omada/types.js";

describe("parseApiResult", () => {
  it("returns typed data for a valid response", () => {
    const site = parseApiResult(siteSchema, { siteId: "abc", name: "Home" }, "GET /sites");
    expect(site.siteId).toBe("abc");
    expect(site.name).toBe("Home");
  });

  it("throws a clear error with field paths on shape mismatch", () => {
    // siteId is required; passing a number violates the schema.
    expect(() =>
      parseApiResult(siteSchema, { siteId: 42, name: "Home" }, "GET /sites"),
    ).toThrowError(/Unexpected response shape from GET \/sites[\s\S]*siteId/);
  });

  it("strips unknown extra fields (resilient to firmware drift)", () => {
    const site = parseApiResult(
      siteSchema,
      { siteId: "abc", name: "Home", futureField: "ignored" },
      "GET /sites",
    );
    expect(site).not.toHaveProperty("futureField");
  });

  it("handles tuple of issues legibly", () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    expect(() => parseApiResult(schema, { a: 1, b: "x" }, "ctx")).toThrowError(/a:[\s\S]*b:/);
  });
});
