import { describe, expect, it } from "vitest";
import type { Config } from "../src/config.js";
import { apiKeyMatches, startHttpServer } from "../src/httpServer.js";
import type { OmadaClient } from "../src/omada/client.js";

describe("authenticated Streamable HTTP transport", () => {
  it("compares API keys without accepting missing or differently-sized values", () => {
    const expected = "0123456789abcdef0123456789abcdef";
    expect(apiKeyMatches(expected, expected)).toBe(true);
    expect(apiKeyMatches("0123456789abcdef0123456789abcdee", expected)).toBe(false);
    expect(apiKeyMatches("short", expected)).toBe(false);
    expect(apiKeyMatches(undefined, expected)).toBe(false);
  });

  it("requires the explicit HTTP enable switch", async () => {
    const config = {
      httpEnable: false,
      httpApiKey: "0123456789abcdef",
    } as Config;
    await expect(startHttpServer({} as OmadaClient, config)).rejects.toThrow(
      "MCP_TRANSPORT=http requires MCP_HTTP_ENABLE=true",
    );
  });

  it("requires a sufficiently long API key", async () => {
    const config = {
      httpEnable: true,
      httpApiKey: "too-short",
    } as Config;
    await expect(startHttpServer({} as OmadaClient, config)).rejects.toThrow(
      "MCP_TRANSPORT=http requires MCP_HTTP_API_KEY with at least 16 characters",
    );
  });
});
