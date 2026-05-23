import { describe, expect, it, vi } from "vitest";
import type { Config } from "../src/config.js";
import { TokenManager } from "../src/omada/auth.js";
import type { HttpClient } from "../src/omada/http.js";

function makeConfig(): Config {
  return {
    baseUrl: "https://example.test",
    clientId: "cid",
    clientSecret: "shh",
    omadacId: "oid",
    siteId: undefined,
    verifyTls: true,
    timeoutMs: 1000,
    capabilityProfile: "safe-read",
    transport: "stdio",
    httpEnable: false,
    httpBind: "127.0.0.1",
    httpPort: 3000,
    logLevel: "error",
  };
}

describe("TokenManager", () => {
  it("caches the access token across calls", async () => {
    const mockHttp = {
      requestResult: vi.fn().mockResolvedValue({
        accessToken: "tok-1",
        tokenType: "bearer",
        expiresIn: 7200,
      }),
    } as unknown as HttpClient;
    const tm = new TokenManager(mockHttp, makeConfig());

    expect(await tm.getAccessToken()).toBe("tok-1");
    expect(await tm.getAccessToken()).toBe("tok-1");
    expect(mockHttp.requestResult).toHaveBeenCalledTimes(1);
  });

  it("invalidate() forces the next call to re-fetch", async () => {
    let i = 0;
    const mockHttp = {
      requestResult: vi.fn().mockImplementation(async () => ({
        accessToken: `tok-${++i}`,
        tokenType: "bearer",
        expiresIn: 7200,
      })),
    } as unknown as HttpClient;
    const tm = new TokenManager(mockHttp, makeConfig());

    expect(await tm.getAccessToken()).toBe("tok-1");
    tm.invalidate();
    expect(await tm.getAccessToken()).toBe("tok-2");
    expect(mockHttp.requestResult).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent calls onto a single in-flight request", async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    const inflight = new Promise<unknown>((res) => {
      resolveFetch = res;
    });
    const mockHttp = {
      requestResult: vi.fn().mockReturnValue(inflight),
    } as unknown as HttpClient;
    const tm = new TokenManager(mockHttp, makeConfig());

    const a = tm.getAccessToken();
    const b = tm.getAccessToken();
    resolveFetch({ accessToken: "tok", tokenType: "bearer", expiresIn: 7200 });
    await expect(a).resolves.toBe("tok");
    await expect(b).resolves.toBe("tok");
    expect(mockHttp.requestResult).toHaveBeenCalledTimes(1);
  });
});
