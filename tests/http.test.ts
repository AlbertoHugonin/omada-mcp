import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the real undici module with stubs so we can drive responses directly.
vi.mock("undici", () => {
  return {
    // Agent must be constructable (`new Agent(...)`), so use a class rather
    // than vi.fn() — vi.fn-derived stubs don't satisfy `new`.
    Agent: class FakeAgent {
      constructor(_options?: unknown) {
        // intentionally empty
      }
    },
    fetch: vi.fn(),
  };
});

// The mocked module must be loaded before HttpClient — top-level await of
// dynamic imports keeps this order explicit.
const { fetch: mockedFetch } = await import("undici");
const { HttpClient, OmadaApiError, OmadaHttpError } = await import("../src/omada/http.js");

function fakeResponse(body: unknown, status = 200) {
  return {
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

describe("HttpClient.requestResult", () => {
  beforeEach(() => {
    (mockedFetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it("returns the result when errorCode is 0", async () => {
    (mockedFetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeResponse({ errorCode: 0, msg: "Success.", result: { foo: "bar" } }),
    );
    const c = new HttpClient({ verifyTls: true, timeoutMs: 1000 });
    await expect(c.requestResult("https://x/openapi/test")).resolves.toEqual({ foo: "bar" });
  });

  it("throws OmadaApiError when errorCode is non-zero", async () => {
    (mockedFetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeResponse({ errorCode: -42, msg: "Bad token" }),
    );
    const c = new HttpClient({ verifyTls: true, timeoutMs: 1000 });
    await expect(c.requestResult("https://x/openapi/test")).rejects.toBeInstanceOf(OmadaApiError);
  });

  it("throws OmadaHttpError on a Spring-style non-envelope error body", async () => {
    (mockedFetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      fakeResponse({ timestamp: 1, status: 400, error: "Bad Request", path: "/x" }, 400),
    );
    const c = new HttpClient({ verifyTls: true, timeoutMs: 1000 });
    await expect(c.requestResult("https://x/openapi/test")).rejects.toBeInstanceOf(OmadaHttpError);
  });

  it("throws OmadaHttpError on a transport failure", async () => {
    (mockedFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));
    const c = new HttpClient({ verifyTls: true, timeoutMs: 1000 });
    await expect(c.requestResult("https://x/openapi/test")).rejects.toBeInstanceOf(OmadaHttpError);
  });
});
