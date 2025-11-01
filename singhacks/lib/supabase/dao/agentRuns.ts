import { createClient } from "@/lib/supabase/server";
import type { Serializable } from "@/lib/types";

export type AgentRunLog = {
  id?: string;
  run_id: string;
  graph: string;
  node?: string;
  status: "start" | "end" | "error" | "artifact";
  payload?: Serializable;
  created_at?: string;
};

export async function logAgentRun(entry: AgentRunLog): Promise<void> {
  const supabase = await createClient();
  await supabase.from("agent_runs").insert({
    run_id: entry.run_id,
    graph: entry.graph,
    node: entry.node,
    status: entry.status,
    payload: entry.payload,
  });
}
