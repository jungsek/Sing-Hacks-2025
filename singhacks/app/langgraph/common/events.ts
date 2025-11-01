import type { Serializable } from "@/lib/types";

// Uniform event schema for SSE across graphs

export type GraphEventType =
  | "on_node_start"
  | "on_node_end"
  | "on_tool_call"
  | "on_artifact"
  | "on_error";

export type GraphEventPayload = {
  run_id: string;
  graph: string; // e.g., "sentinel"
  node?: string; // e.g., "transaction"
  ts: number; // epoch ms
  data?: Serializable;
};

export type GraphEvent = {
  type: GraphEventType;
  payload: GraphEventPayload;
};

export function toSSE(event: GraphEvent): string {
  // Keep the event name equal to the type for simple client handlers
  const line = `event: ${event.type}\n` + `data: ${JSON.stringify(event.payload)}\n\n`;
  return line;
}
