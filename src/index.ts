#!/usr/bin/env node
import { startServer } from "./server.js";

startServer().catch((error: unknown) => {
  process.stderr.write(
    `[omada-mcp] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
