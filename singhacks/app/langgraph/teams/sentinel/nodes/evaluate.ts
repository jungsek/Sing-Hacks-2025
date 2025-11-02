import type { RegulatorySnippet, RuleHit, SentinelState } from "@/app/langgraph/common/state";

// Simple final evaluator: combine L1 hits and L2 snippets into a refined score and brief rationale.
// If an LLM is available later, we can swap this to a model call. For now, deterministic logic.

function aggregateScore(ruleHits: RuleHit[], baseScore: number): number {
  if (!Array.isArray(ruleHits) || ruleHits.length === 0) return Math.max(0, Math.min(1, baseScore));
  // Sum capped weights with light dampening for many small hits
  const sum = ruleHits.reduce((acc, h) => acc + Math.max(0, Math.min(0.5, h.weight)), 0);
  const damp = 1 - Math.min(0.35, Math.max(0, (ruleHits.length - 3) * 0.03));
  const combined = Math.max(baseScore, Math.min(1, sum * damp));
  return Number.isFinite(combined) ? combined : Math.max(0, Math.min(1, baseScore));
}

function craftRationale(hits: RuleHit[], snippets: RegulatorySnippet[]): string {
  const top = hits.slice(0, 3).map((h) => h.rule_id);
  const reg = snippets.slice(0, 2).map((s) => s.rule_id);
  const parts: string[] = [];
  if (top.length > 0) parts.push(`Top indicators: ${top.join(", ")}.`);
  if (reg.length > 0) parts.push(`Regulatory refs: ${reg.join(", ")}.`);
  const reason = hits.find((h) => h.rationale)?.rationale ?? "";
  if (reason) parts.push(reason.slice(0, 220));
  return parts.join(" ").slice(0, 480);
}

export async function evaluateNode(state: SentinelState): Promise<Partial<SentinelState>> {
  const hits = state.rule_hits ?? [];
  const snippets = state.regulatory_snippets ?? [];
  const finalScore = aggregateScore(hits, typeof state.score === "number" ? state.score : 0);
  const rationale = craftRationale(hits, snippets);
  // We surface the rationale through the streaming UI via on_node_end detail and reasoning logs
  return {
    score: finalScore,
    // Note: rationale is not stored in state schema; UI pulls reasoning from events. We could persist later.
  };
}
