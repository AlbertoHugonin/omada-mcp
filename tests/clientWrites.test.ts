import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../src/tools/types.js";
import { setClientFixedIpTool } from "../src/tools/write/setClientFixedIp.js";
import { setClientNameTool } from "../src/tools/write/setClientName.js";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function registerTool(tool: typeof setClientNameTool | typeof setClientFixedIpTool, ctx: ToolContext) {
  let handler: ToolHandler | undefined;
  let metadata: Record<string, unknown> | undefined;
  const server = {
    registerTool: (_name: string, toolMetadata: Record<string, unknown>, toolHandler: ToolHandler) => {
      metadata = toolMetadata;
      handler = toolHandler;
    },
  } as unknown as McpServer;

  tool.register(server, ctx);
  if (!handler || !metadata) throw new Error("tool was not registered");
  return { handler, metadata };
}

describe("Jarvis client write tools", () => {
  it("set_client_name is a non-destructive idempotent write and defaults to dry-run", async () => {
    const updateClient = vi.fn();
    const getClient = vi.fn().mockResolvedValue({
      mac: "AA:BB:CC:DD:EE:FF",
      name: "old-name",
      ip: "192.168.1.20",
    });
    const ctx = {
      config: { siteId: "site-1" },
      client: { getClient, updateClient },
    } as unknown as ToolContext;

    const { handler, metadata } = registerTool(setClientNameTool, ctx);
    expect(metadata.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });

    const result = await handler({ clientMac: "AA:BB:CC:DD:EE:FF", name: "printer" });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("DRY RUN");
    expect(updateClient).not.toHaveBeenCalled();
  });

  it("set_client_fixed_ip can preserve the client's current IP and verifies post-apply state", async () => {
    const updateClient = vi.fn().mockResolvedValue(undefined);
    const getClient = vi
      .fn()
      .mockResolvedValueOnce({
        mac: "AA:BB:CC:DD:EE:FF",
        name: "printer",
        ip: "192.168.1.20",
        useFixedIp: false,
      })
      .mockResolvedValueOnce({
        mac: "AA:BB:CC:DD:EE:FF",
        name: "printer",
        ip: "192.168.1.20",
        fixedIp: "192.168.1.20",
        useFixedIp: true,
      });
    const ctx = {
      config: { siteId: "site-1" },
      client: { getClient, updateClient },
    } as unknown as ToolContext;

    const { handler, metadata } = registerTool(setClientFixedIpTool, ctx);
    expect(metadata.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });

    const result = await handler({
      clientMac: "AA:BB:CC:DD:EE:FF",
      dryRun: false,
    });
    expect(result.isError).not.toBe(true);
    expect(updateClient).toHaveBeenCalledWith("site-1", "AA:BB:CC:DD:EE:FF", {
      fixedIp: "192.168.1.20",
    });
    expect(getClient).toHaveBeenCalledTimes(2);
    expect(result.content[0]?.text).toContain("Post-apply state");
  });
});
