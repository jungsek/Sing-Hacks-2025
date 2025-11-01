import { NextRequest } from "next/server";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import type { GraphEvent } from "@/app/langgraph/common/events";
import type { RegulatorySnippet, SentinelState } from "@/app/langgraph/common/state";
import { regulatoryNode } from "@/app/langgraph/teams/sentinel/nodes/regulatory";

type RegulatoryStateSlice = Pick<
  SentinelState,
  | "regulatory_cursor"
  | "regulatory_candidates"
  | "regulatory_documents"
  | "rule_proposals"
  | "regulatory_versions"
  | "regulatory_snippets"
>;

export type RegulationAgentRequest = {
  regulators?: string[];
  cursor?: string;
  state?: Partial<RegulatoryStateSlice>;
};

export type RegulationAgentSummary = {
  snippets: RegulatorySnippet[];
  counts: {
    candidates: number;
    documents: number;
    proposals: number;
    versions: number;
  };
  durationMs: number;
};

// Helper sanitizers (copied from previous server action)
const sanitizeRegulators = (regulators?: string[]): string[] | undefined => {
  if (!Array.isArray(regulators)) return undefined;
  const normalized = regulators
    .map((code) => (typeof code === "string" ? code.trim().toUpperCase() : ""))
    .filter((code) => code.length > 0);
  return normalized.length > 0 ? normalized : undefined;
};

const sanitizeSnippets = (snippets: RegulatorySnippet[] | undefined): RegulatorySnippet[] => {
  if (!Array.isArray(snippets)) return [];
  const out: RegulatorySnippet[] = [];
  for (const snippet of snippets) {
    if (!snippet || typeof snippet !== "object") continue;
    const rawText = (snippet as any).text;
    if (typeof rawText !== "string" || rawText.trim().length === 0) continue;
    const text = rawText.trim();
    const rawRuleId = (snippet as any).rule_id;
    const rule_id =
      typeof rawRuleId === "string" && rawRuleId.trim().length > 0
        ? rawRuleId
        : `snippet:${text.slice(0, 24)}`;
    const level =
      (snippet as any).level === "info" ||
      (snippet as any).level === "success" ||
      (snippet as any).level === "warning" ||
      (snippet as any).level === "error"
        ? (snippet as any).level
        : undefined;
    const source_url =
      typeof (snippet as any).source_url === "string" ? (snippet as any).source_url : undefined;
    out.push({ rule_id, text, source_url, level });
  }
  return out;
};

const buildInitialState = (request: RegulationAgentRequest | undefined): SentinelState => {
  const state = request?.state ?? {};
  return {
    transaction_id: "regulatory_only",
    transaction: undefined,
    rule_hits: [],
    score: 1,
    regulatory_cursor: state?.regulatory_cursor ?? request?.cursor,
    regulatory_candidates: Array.isArray(state?.regulatory_candidates)
      ? state?.regulatory_candidates
      : [],
    regulatory_documents: Array.isArray(state?.regulatory_documents)
      ? state?.regulatory_documents
      : [],
    rule_proposals: Array.isArray(state?.rule_proposals) ? state?.rule_proposals : [],
    regulatory_versions: Array.isArray(state?.regulatory_versions)
      ? state?.regulatory_versions
      : [],
    regulatory_snippets: Array.isArray(state?.regulatory_snippets)
      ? state?.regulatory_snippets
      : [],
    alert: undefined,
  };
};

// We stream custom data parts using AI SDK UI stream protocol.
// Part types used:
// - data-status: { runId, status: 'running', timestamp }
// - data-event: GraphEvent
// - data-final: RegulationAgentSummary
// - data-error: { runId, message }
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RegulationAgentRequest | undefined;

  const stream = createUIMessageStream({
    // eslint-disable-next-line @typescript-eslint/require-await
    execute: async ({ writer }) => {
      const runId = `regulatory_${Date.now()}`;
      const startedAt = Date.now();

      try {
        writer.write({
          type: "data-status",
          data: { runId, status: "running" as const, timestamp: startedAt },
          transient: true,
        });

        const regulators = sanitizeRegulators(body?.regulators);
        const initialState = buildInitialState(body);

        const emit = async (event: GraphEvent) => {
          // Send each graph event as it occurs
          writer.write({ type: "data-event", data: { runId, event } });
        };

        const update = await regulatoryNode(initialState, {
          runId,
          emit,
          regulatorCodes: regulators,
        });

        const finalState: SentinelState = { ...initialState, ...update };
        const sanitizedSnippets = sanitizeSnippets(finalState.regulatory_snippets);

        writer.write({
          type: "data-final",
          data: {
            runId,
            summary: {
              snippets: sanitizedSnippets,
              counts: {
                candidates: finalState.regulatory_candidates?.length ?? 0,
                documents: finalState.regulatory_documents?.length ?? 0,
                proposals: finalState.rule_proposals?.length ?? 0,
                versions: finalState.regulatory_versions?.length ?? 0,
              },
              durationMs: Date.now() - startedAt,
            } as RegulationAgentSummary,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Regulatory agent failed.";
        writer.write({ type: "data-error", data: { message } });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
