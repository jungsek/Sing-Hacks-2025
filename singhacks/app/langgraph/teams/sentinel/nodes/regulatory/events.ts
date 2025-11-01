import type { GraphEventType } from "@/app/langgraph/common/events";
import { logAgentRun } from "@/lib/supabase/dao/agentRuns";
import type { Serializable } from "@/lib/types";

import { GRAPH_NAME } from "./constants";
import type { RegulatoryNodeContext } from "./types";

export async function emitEvent(
  context: RegulatoryNodeContext,
  type: GraphEventType,
  node: string,
  data?: Serializable,
): Promise<void> {
  if (!context.emit || !context.runId) return;
  try {
    await context.emit({
      type,
      payload: {
        run_id: context.runId,
        graph: GRAPH_NAME,
        node,
        ts: Date.now(),
        data,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown";
    console.warn("Failed to emit regulatory event", message);
  }
}

export async function recordAgentRun(
  context: RegulatoryNodeContext,
  node: string,
  status: "start" | "end" | "error" | "artifact",
  payload?: Serializable,
): Promise<void> {
  if (!context.runId) return;
  try {
    await logAgentRun({
      run_id: context.runId,
      graph: GRAPH_NAME,
      node,
      status,
      payload,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown";
    console.warn("Failed to log agent run", message);
  }
}
