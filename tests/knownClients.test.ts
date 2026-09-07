import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { listKnownClientsTool } from "../src/tools/read/listKnownClients.js";
import type { ToolContext } from "../src/tools/types.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

describe("list_known_clients", () => {
  it("is read-only and formats the independent insight response", async () => {
    const listKnownClients = vi.fn().mockResolvedValue({
      totalRows: 1,
      currentPage: 1,
      currentSize: 1,
      data: [
        {
          mac: "AA:BB:CC:DD:EE:FF",
          name: "printer",
          ip: "192.168.1.20",
          active: true,
          lastSeen: 123456,
          firmwareSpecificField: "kept",
        },
      ],
    });
    const ctx = {
      config: { siteId: "site-1" },
      client: { listKnownClients },
    } as unknown as ToolContext;

    let handler: ToolHandler | undefined;
    let metadata: Record<string, unknown> | undefined;
    const server = {
      registerTool: (
        _name: string,
        toolMetadata: Record<string, unknown>,
        toolHandler: ToolHandler,
      ) => {
        metadata = toolMetadata;
        handler = toolHandler;
      },
    } as unknown as McpServer;

    listKnownClientsTool.register(server, ctx);
    if (!handler || !metadata) throw new Error("tool was not registered");

    expect(metadata.annotations).toMatchObject({ readOnlyHint: true });
    const result = await handler({ page: 1, pageSize: 10 });
    expect(result.isError).not.toBe(true);
    expect(listKnownClients).toHaveBeenCalledWith("site-1", { page: 1, pageSize: 10 });
    expect(result.content[0]?.text).toContain("AA:BB:CC:DD:EE:FF");
    expect(result.content[0]?.text).toContain("active=true");
  });
});
