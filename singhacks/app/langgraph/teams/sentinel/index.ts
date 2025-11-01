import { transactionNode } from "@/app/langgraph/teams/sentinel/nodes/transaction";
import { regulatoryNode } from "@/app/langgraph/teams/sentinel/nodes/regulatory";
import { alertNode } from "@/app/langgraph/teams/sentinel/nodes/alert";
import type { SentinelState } from "@/app/langgraph/common/state";
import type { GraphEvent } from "@/app/langgraph/common/events";
import { logAgentRun } from "@/lib/supabase/dao/agentRuns";

// Attempt to integrate with LangGraph if available, but keep graceful fallback
type StateGraphInstance = {
  addNode: (
    name: string,
    handler: (state: SentinelState) => Promise<Partial<SentinelState>> | Partial<SentinelState>,
  ) => void;
  addEdge: (from: string, to: string) => void;
  compile: () => unknown;
};

type StateGraphConstructor = new (config: Record<string, unknown>) => StateGraphInstance;

let stateGraphCtor: StateGraphConstructor | undefined;

void import("@langchain/langgraph")
  .then((module) => {
    const ctor = module?.StateGraph as unknown;
    if (typeof ctor === "function") {
      stateGraphCtor = ctor as StateGraphConstructor;
    }
  })
  .catch(() => {
    stateGraphCtor = undefined;
  });
export function buildSentinelGraph() {
  if (!stateGraphCtor) return undefined;

  const graph = new stateGraphCtor({});
  // Register nodes
  graph.addNode("transaction", async (state: SentinelState) => {
    return await transactionNode(state);
  });
  graph.addNode("regulatory", async (state: SentinelState) => {
    return await regulatoryNode(state);
  });
  graph.addNode("alert", async (state: SentinelState) => {
    return await alertNode(state);
  });

  // Simple sequential flow for MVP
  graph.addEdge("__start__", "transaction");
  graph.addEdge("transaction", "regulatory");
  graph.addEdge("regulatory", "alert");
  graph.addEdge("alert", "__end__");

  const compiled = graph.compile();
  return compiled;
}

// Minimal runner with manual event callbacks; works even if LangGraph is absent
export async function runSentinelSequential(
  init: SentinelState,
  emit: (e: GraphEvent) => Promise<void>,
): Promise<SentinelState> {
  const runId = `sentinel_${Date.now()}`;
  let state: SentinelState = { ...init };
  // apply defaults if missing
  state.rule_hits = state.rule_hits ?? [];
  state.score = typeof state.score === "number" ? state.score : 0;

  const safeEmit = async (event: GraphEvent) => {
    try {
      await emit(event);
    } catch {
      // swallow emit errors (client may have disconnected)
    }
  };

  const now = () => Date.now();
  const REGULATORY_THRESHOLD = 0.65; // tunable

  // transaction -> (conditional) regulatory -> alert
  await safeEmit({
    type: "on_node_start",
    payload: {
      run_id: runId,
      graph: "sentinel",
      node: "transaction",
      ts: now(),
      data: { transaction_id: state.transaction_id },
    },
  });
  try {
    await logAgentRun({
      run_id: runId,
      graph: "sentinel",
      node: "transaction",
      status: "start",
      payload: { transaction_id: state.transaction_id },
    });
  } catch {}

  const beforeHits = state.rule_hits.length;
  const txnUpdate = await transactionNode(state);
  state = { ...state, ...txnUpdate };

  // Emit per-hit tool calls for newly added hits
  const afterHits = state.rule_hits.length;
  const newHits = afterHits > beforeHits ? state.rule_hits.slice(beforeHits) : [];
  for (const hit of newHits) {
    await safeEmit({
      type: "on_tool_call",
      payload: {
        run_id: runId,
        graph: "sentinel",
        node: "transaction",
        ts: now(),
        data: {
          tool: "llm",
          rule_id: hit.rule_id,
          rationale: hit.rationale,
          weight: hit.weight,
          score_partial: state.score,
        },
      },
    });
    try {
      await logAgentRun({
        run_id: runId,
        graph: "sentinel",
        node: "transaction",
        status: "artifact",
        payload: { type: "llm", ...hit, score_partial: state.score },
      });
    } catch {}
  }

  await safeEmit({
    type: "on_node_end",
    payload: {
      run_id: runId,
      graph: "sentinel",
      node: "transaction",
      ts: now(),
      data: {
        score: state.score,
        rule_hits: state.rule_hits,
        origin: state.transaction_analysis_origin,
        model: state.transaction_analysis_model,
      },
    },
  });
  try {
    await logAgentRun({
      run_id: runId,
      graph: "sentinel",
      node: "transaction",
      status: "end",
      payload: { score: state.score, rule_hits: state.rule_hits },
    });
  } catch {}

  // Conditionally run regulatory enrichment
  if (state.score >= REGULATORY_THRESHOLD) {
    await safeEmit({
      type: "on_node_start",
      payload: {
        run_id: runId,
        graph: "sentinel",
        node: "regulatory",
        ts: now(),
        data: { rule_hits: state.rule_hits },
      },
    });
    try {
      await logAgentRun({
        run_id: runId,
        graph: "sentinel",
        node: "regulatory",
        status: "start",
        payload: { rule_hits: state.rule_hits },
      });
    } catch {}

    const prevCandidates = state.regulatory_candidates?.length ?? 0;
    const prevDocuments = state.regulatory_documents?.length ?? 0;
    const prevProposals = state.rule_proposals?.length ?? 0;
    const prevSnippets = state.regulatory_snippets?.length ?? 0;
    const prevVersions = state.regulatory_versions?.length ?? 0;

    const regulatoryUpdate = await regulatoryNode(state, { runId, emit: safeEmit });
    state = { ...state, ...regulatoryUpdate };

    const candidateCount = state.regulatory_candidates?.length ?? 0;
    const documentCount = state.regulatory_documents?.length ?? 0;
    const proposalCount = state.rule_proposals?.length ?? 0;
    const snippetCount = state.regulatory_snippets?.length ?? 0;
    const versionCount = state.regulatory_versions?.length ?? 0;

    const newCandidateCount = Math.max(0, candidateCount - prevCandidates);
    const newDocumentCount = Math.max(0, documentCount - prevDocuments);
    const newProposalCount = Math.max(0, proposalCount - prevProposals);
    const newSnippetCount = Math.max(0, snippetCount - prevSnippets);
    const newVersionCount = Math.max(0, versionCount - prevVersions);

    const newSnippets =
      newSnippetCount > 0 && state.regulatory_snippets
        ? state.regulatory_snippets.slice(-newSnippetCount)
        : [];

    const newVersions =
      newVersionCount > 0 && state.regulatory_versions
        ? state.regulatory_versions.slice(-newVersionCount)
        : [];

    await safeEmit({
      type: "on_node_end",
      payload: {
        run_id: runId,
        graph: "sentinel",
        node: "regulatory",
        ts: now(),
        data: {
          candidates_total: candidateCount,
          candidates_new: newCandidateCount,
          documents_total: documentCount,
          documents_new: newDocumentCount,
          proposals_total: proposalCount,
          proposals_new: newProposalCount,
          versions_total: versionCount,
          versions_new: newVersionCount,
          snippets_new: newSnippets,
        },
      },
    });
    try {
      await logAgentRun({
        run_id: runId,
        graph: "sentinel",
        node: "regulatory",
        status: "end",
        payload: {
          candidates_total: candidateCount,
          documents_total: documentCount,
          proposals_total: proposalCount,
          versions_total: versionCount,
        },
      });
    } catch {}

    if (newProposalCount > 0 && state.rule_proposals) {
      const proposals = state.rule_proposals.slice(-newProposalCount);
      await safeEmit({
        type: "on_artifact",
        payload: {
          run_id: runId,
          graph: "sentinel",
          node: "regulatory",
          ts: now(),
          data: {
            type: "regulatory_rule_proposals",
            proposals,
          },
        },
      });
      try {
        await logAgentRun({
          run_id: runId,
          graph: "sentinel",
          node: "regulatory",
          status: "artifact",
          payload: { type: "regulatory_rule_proposals", proposals },
        });
      } catch {}
    }

    if (newVersionCount > 0 && newVersions.length > 0) {
      await safeEmit({
        type: "on_artifact",
        payload: {
          run_id: runId,
          graph: "sentinel",
          node: "regulatory",
          ts: now(),
          data: {
            type: "regulatory_rule_versions",
            versions: newVersions,
          },
        },
      });
      try {
        await logAgentRun({
          run_id: runId,
          graph: "sentinel",
          node: "regulatory",
          status: "artifact",
          payload: { type: "regulatory_rule_versions", versions: newVersions },
        });
      } catch {}
    }
  }

  await safeEmit({
    type: "on_node_start",
    payload: {
      run_id: runId,
      graph: "sentinel",
      node: "alert",
      ts: now(),
      data: { score: state.score },
    },
  });
  try {
    await logAgentRun({
      run_id: runId,
      graph: "sentinel",
      node: "alert",
      status: "start",
      payload: { score: state.score },
    });
  } catch {}

  state = { ...state, ...(await alertNode(state)) };
  await safeEmit({
    type: "on_node_end",
    payload: {
      run_id: runId,
      graph: "sentinel",
      node: "alert",
      ts: now(),
      data: { alert: state.alert },
    },
  });
  try {
    await logAgentRun({
      run_id: runId,
      graph: "sentinel",
      node: "alert",
      status: "end",
      payload: { alert: state.alert },
    });
  } catch {}

  if (state.alert) {
    await safeEmit({
      type: "on_artifact",
      payload: {
        run_id: runId,
        graph: "sentinel",
        node: "alert",
        ts: now(),
        data: { alert: state.alert },
      },
    });
    try {
      await logAgentRun({
        run_id: runId,
        graph: "sentinel",
        node: "alert",
        status: "artifact",
        payload: { alert: state.alert },
      });
    } catch {}
  }

  return state;
}





