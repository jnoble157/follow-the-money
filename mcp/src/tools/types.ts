import type { z } from "zod";

// Shape every tool exports. The agent registers tools via this contract;
// the stdio MCP server registers them too. Args + result are Zod schemas
// so we can convert to JSON Schema once for the model and once for the
// MCP wire format.
// `run` accepts pre-parse input (`z.input`) so a tool's defaults apply even
// when callers (smoke tests, agent runner before its Zod pass) haven't
// already validated. Each tool's run() must call `argsSchema.parse(args)`
// at the top.
export type Tool<Args extends z.ZodTypeAny, Result extends z.ZodTypeAny> = {
  name: string;
  description: string;
  argsSchema: Args;
  resultSchema: Result;
  run: (args: z.input<Args>) => Promise<z.infer<Result>>;
};
