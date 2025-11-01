import type { GraphEvent } from "@/app/langgraph/common/events";
import type { SentinelState } from "@/app/langgraph/common/state";
import { regulatoryNode } from "@/app/langgraph/teams/sentinel/nodes/regulatory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RegulatoryScrapeRequest = {
  regulators?: string[];
  cursor?: string;
  transaction_id?: string;
  state?: Partial<Pick<
    SentinelState,
    |
      "regulatory_cursor" |
      "regulatory_candidates" |
      "regulatory_documents" |
      "rule_proposals" |
      "regulatory_versions" |
      "regulatory_snippets"
  >>;
};

type RegulatoryScrapeResponse = {
  run_id: string;
  regulators: string[];
  state: Pick<
    SentinelState,
    |
      "regulatory_cursor" |
      "regulatory_candidates" |
      "regulatory_documents" |
      "rule_proposals" |
      "regulatory_versions" |
      "regulatory_snippets"
  >;
  events: GraphEvent[];
};

const parseScrapeRequest = (payload: unknown): RegulatoryScrapeRequest => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;

  const regulators = Array.isArray(record.regulators)
    ? record.regulators
        .map((code) => (typeof code === "string" ? code.trim().toUpperCase() : ""))
        .filter((code) => code.length > 0)
    : undefined;

  const cursor = typeof record.cursor === "string" ? record.cursor : undefined;
  const transactionId =
    typeof record.transaction_id === "string" ? record.transaction_id : undefined;

  const stateInput = record.state;
  const parsedState: RegulatoryScrapeRequest["state"] = {};
  if (stateInput && typeof stateInput === "object") {
    const stateRecord = stateInput as Record<string, unknown>;
    if (typeof stateRecord.regulatory_cursor === "string") {
      parsedState.regulatory_cursor = stateRecord.regulatory_cursor;
    }
    if (Array.isArray(stateRecord.regulatory_candidates)) {
      parsedState.regulatory_candidates = stateRecord.regulatory_candidates as SentinelState["regulatory_candidates"];
    }
    if (Array.isArray(stateRecord.regulatory_documents)) {
      parsedState.regulatory_documents = stateRecord.regulatory_documents as SentinelState["regulatory_documents"];
    }
    if (Array.isArray(stateRecord.rule_proposals)) {
      parsedState.rule_proposals = stateRecord.rule_proposals as SentinelState["rule_proposals"];
    }
    if (Array.isArray(stateRecord.regulatory_versions)) {
      parsedState.regulatory_versions = stateRecord.regulatory_versions as SentinelState["regulatory_versions"];
    }
    if (Array.isArray(stateRecord.regulatory_snippets)) {
      parsedState.regulatory_snippets = stateRecord.regulatory_snippets as SentinelState["regulatory_snippets"];
    }
  }

  return {
    regulators: regulators && regulators.length > 0 ? regulators : undefined,
    cursor,
    transaction_id: transactionId,
    state: Object.keys(parsedState ?? {}).length > 0 ? parsedState : undefined,
  };
};

export async function POST(req: Request): Promise<Response> {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const body = parseScrapeRequest(rawBody);
    const regulators = body.regulators;

    const runId = `regulatory_${Date.now()}`;
    const previousState = body.state ?? {};

    const initialState: SentinelState = {
      transaction_id: body.transaction_id ?? "regulatory_only",
      transaction: undefined,
      rule_hits: [],
      score: 1,
      regulatory_cursor: previousState.regulatory_cursor ?? body.cursor,
      regulatory_candidates: Array.isArray(previousState.regulatory_candidates)
        ? previousState.regulatory_candidates
        : [],
      regulatory_documents: Array.isArray(previousState.regulatory_documents)
        ? previousState.regulatory_documents
        : [],
      rule_proposals: Array.isArray(previousState.rule_proposals)
        ? previousState.rule_proposals
        : [],
      regulatory_versions: Array.isArray(previousState.regulatory_versions)
        ? previousState.regulatory_versions
        : [],
      regulatory_snippets: Array.isArray(previousState.regulatory_snippets)
        ? previousState.regulatory_snippets
        : [],
      alert: undefined,
    };

    const events: GraphEvent[] = [];
    const emit = async (event: GraphEvent) => {
      events.push(event);
    };

    const update = await regulatoryNode(initialState, {
      runId,
      emit,
      regulatorCodes: regulators,
    });

    const finalState: SentinelState = { ...initialState, ...update };

    const response: RegulatoryScrapeResponse = {
      run_id: runId,
      regulators: regulators && regulators.length > 0 ? regulators : ["MAS", "FINMA", "HKMA"],
      state: {
        regulatory_cursor: finalState.regulatory_cursor,
        regulatory_candidates: finalState.regulatory_candidates ?? [],
        regulatory_documents: finalState.regulatory_documents ?? [],
        rule_proposals: finalState.rule_proposals ?? [],
        regulatory_versions: finalState.regulatory_versions ?? [],
        regulatory_snippets: finalState.regulatory_snippets ?? [],
      },
      events,
    };

    return Response.json(response);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected error while running the regulatory scrape.";
    return Response.json({ error: message }, { status: 500 });
  }
}
