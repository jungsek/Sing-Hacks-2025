import type { SentinelAlert, SentinelState } from "@/app/langgraph/common/state";
import { createAlert } from "@/lib/supabase/dao/alerts";

// Placeholder alert builder; persist via DAO later
export async function alertNode(state: SentinelState): Promise<Partial<SentinelState>> {
  const severity = state.score >= 0.7 ? "high" : state.score >= 0.4 ? "medium" : "low";
  const alert: SentinelAlert = {
    id: `alt_${state.transaction_id}_${Date.now()}`,
    severity,
    json: {
      transaction_id: state.transaction_id,
      score: state.score,
      rule_hits: state.rule_hits,
      regulatory_snippets: state.regulatory_snippets ?? [],
    },
  };

  // Persist alert to Supabase (best-effort)
  try {
    await createAlert({
      id: alert.id,
      transaction_id: state.transaction_id,
      severity: alert.severity,
      payload: alert.json,
    });
  } catch {
    // ignore persistence errors for streaming demo
  }

  return { alert };
}
