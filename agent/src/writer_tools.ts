import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Writer tools = the agent's mechanism for emitting front-end events. We
// route these through tool-use rather than parsing free text out of the
// model's reply because the resulting event stream is deterministic and
// recordable: every visible side effect on the page is one tool call we
// can replay.

// Citations carried by emit_narrative. The wire-format Citation
// (web/lib/investigations/types.ts) requires reportInfoIdent + url +
// rowSummary, but the runner enriches url and rowSummary from the citation
// registry it builds out of preceding tool results — which means the model
// only has to emit `reportInfoIdent`. Skipping the other two fields saves
// ~270 chars per citation, which directly drops wall-clock for any
// citation-heavy chunk like complete_investigation's topDonors table.
export const CitationParam = z.object({
  reportInfoIdent: z.string(),
  url: z.string().optional(),
  rowSummary: z.string().optional(),
});

export const WRITER_TOOL_SCHEMAS = {
  plan_step: z.object({
    id: z.string().describe("stable id used to attach later tool_calls and tool_results to this plan step"),
    description: z.string().describe("one-sentence statement of what this step accomplishes; rendered to the left rail"),
  }),

  emit_narrative: z.object({
    role: z
      .enum(["lede", "body", "methods", "reading_note", "missing"])
      .describe(
        "report section: 'lede' is the single-paragraph answer at the top, 'body' is normal reporting paragraphs, 'methods' is a callout that explains entity-resolution work, 'reading_note' is the 'we describe, we don't characterize' disclaimer, 'missing' is the 'what's not in this view' note for federal-only entities or absent data",
      ),
    text: z.string(),
    citations: z
      .array(CitationParam)
      .describe(
        "every reportInfoIdent referenced by a numeric or named claim in `text`. Required by the citations rule; emit_narrative with no citations is only valid for the 'missing' role",
      ),
  }),

  emit_graph_node: z.object({
    id: z.string(),
    label: z.string(),
    kind: z.enum(["filer", "donor", "employer", "lobbyist", "client", "pac"]),
    sublabel: z.string().optional(),
    profileSlug: z
      .string()
      .optional()
      .describe(
        "slug into web/lib/profiles/registry. Set this when the node corresponds to a known profile so the user can drill in.",
      ),
  }),

  emit_graph_edge: z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    weight: z.number().optional(),
  }),

  request_disambiguation: z.object({
    id: z.string().describe("stable id; use 'employer-merge' or '<topic>-merge' style"),
    title: z.string(),
    explanation: z.string(),
    variants: z
      .array(
        z.object({
          variant: z.string(),
          contributions: z.number().int(),
          total: z.number(),
          sampleContributors: z.array(z.string()),
          sampleCitation: CitationParam,
        }),
      )
      .min(2),
  }),

  complete_investigation: z.object({
    topDonors: z
      .array(
        z.object({
          rank: z.number().int().positive(),
          donor: z.string(),
          rolledEmployer: z.string().nullable().optional(),
          contributions: z.number().int(),
          total: z.number(),
          variants: z.array(z.string()).optional(),
          citation: CitationParam,
        }),
      )
      // Cap at five entries. Each topDonor carries a full citation object;
      // a longer table puts the wall-clock past the latency budget for no
      // additional reader value — the underlying ledger is already in the
      // plan trace.
      .max(5)
      .optional(),
  }),
} as const;

export type WriterToolName = keyof typeof WRITER_TOOL_SCHEMAS;

export const WRITER_TOOL_DESCRIPTIONS: Record<WriterToolName, string> = {
  plan_step:
    "Announce the next step of your plan. Call this before each tool_call so the user can see what you're doing.",
  emit_narrative:
    "Write a paragraph of the final report. Pick the role that matches the section: lede first (the single answer), body for reporting paragraphs, methods after any entity-resolution merge, reading_note for the disclaimer, missing for absent-data callouts.",
  emit_graph_node:
    "Place a node on the evidence graph. Stable ids let you connect edges to it later.",
  emit_graph_edge:
    "Connect two graph nodes you've already emitted. Use a dollar amount as the label when the edge represents a money flow.",
  request_disambiguation:
    "Pause the run and ask the user whether to merge a fuzzy cluster. Only call this when (a) confidence < 0.85 and (b) the merge would change the headline number. After the user answers, you'll receive { merged: true | false } as the tool result; continue accordingly.",
  complete_investigation:
    "End the run. Optionally emit the final top-donors table. Once you call this, no further events are emitted.",
};

// Convert each writer-tool schema to OpenAI Responses API tool format. The
// runner concatenates these with the converted MCP tools.
export function writerToolsForOpenAI() {
  return Object.entries(WRITER_TOOL_SCHEMAS).map(([name, schema]) => ({
    type: "function" as const,
    name,
    description: WRITER_TOOL_DESCRIPTIONS[name as WriterToolName],
    parameters: zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<
      string,
      unknown
    >,
    // OpenAI strict mode requires a tighter JSON Schema subset
    // (additionalProperties: false, all properties required, no defaults).
    // zod-to-json-schema doesn't emit that subset, so disable strict and
    // rely on the Zod parse on dispatch for validation.
    strict: false,
  }));
}
