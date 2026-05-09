#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOLS, getTool } from "./tools/index.ts";

// Stdio MCP server: one process, listens on stdin/stdout, exposes the
// project's seven Texas-money tools. Used both by Claude Desktop / IDE
// integrations and as the canonical track-fit deliverable.

async function main(): Promise<void> {
  const server = new Server(
    { name: "texas-money-investigator", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      // The MCP wire format speaks JSON Schema. Zod is the source of truth
      // — convert at the boundary so the tools file stays untouched by
      // protocol concerns.
      inputSchema: zodToJsonSchema(t.argsSchema, {
        $refStrategy: "none",
      }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = getTool(name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${name}` }],
      };
    }
    try {
      const result = await tool.run((args ?? {}) as never);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `tool ${name} failed: ${message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: don't log to stdout — that channel belongs to MCP. stderr is fine.
  console.error(
    `texas-money MCP server ready (${TOOLS.length} tools): ${TOOLS.map((t) => t.name).join(", ")}`,
  );
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
