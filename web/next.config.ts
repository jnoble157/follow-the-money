import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Workspace packages ship TypeScript source; Next compiles them inline so
  // we don't run a separate build step for the agent and MCP packages.
  transpilePackages: ["@txmoney/agent", "@txmoney/mcp"],
  // DuckDB ships a native .node binding selected at runtime by platform.
  // Bundling it through webpack/turbopack triggers a "module not found" on
  // every platform we're not currently on. Mark it (and the Anthropic SDK,
  // which has CJS internals) as external so Next emits a real require().
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "@duckdb/node-bindings-darwin-arm64",
    "@duckdb/node-bindings-darwin-x64",
    "@duckdb/node-bindings-linux-arm64",
    "@duckdb/node-bindings-linux-x64",
    "@duckdb/node-bindings-win32-x64",
    "@anthropic-ai/sdk",
  ],
};

export default config;
