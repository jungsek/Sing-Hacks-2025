"use client";

import { useCallback, useMemo, useState } from "react";
import type { GraphEvent } from "@/app/langgraph/common/events";
import type { RegulatorySnippet } from "@/app/langgraph/common/state";
import type { RegulationAgentSummary } from "@/app/api/regulations/stream/route";
import { parseSSE } from "@/lib/sse";

type TaskStatus = "idle" | "running" | "success" | "error";

type TaskLog = {
  id: string;
  text: string;
  timestamp?: number;
  level: "info" | "success" | "warning" | "error";
};

export type AgentTask = {
  id: string;
  title: string;
  status: TaskStatus;
  logs: TaskLog[];
};

export type RegulationAgentState = {
  status: "idle" | "running" | "success" | "error";
  runId: string | null;
  tasks: AgentTask[];
  reasoning: string[];
  snippets: RegulatorySnippet[];
  error: string | null;
  summary: RegulationAgentSummary | null;
};

const NODE_LABELS: Record<string, string> = {
  regulatory: "Regulatory agent",
  regulatory_scan: "Discover sources",
  regulatory_extract: "Extract content",
  rule_generate: "Draft rules",
  rule_version: "Persist versions",
};

const TASK_DISPLAY_ORDER = [
  "regulatory_scan",
  "regulatory_extract",
  "rule_generate",
  "rule_version",
];

const formatSerializable = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const createTask = (node: string): AgentTask => ({
  id: node,
  title: NODE_LABELS[node] ?? node.replace(/_/g, " "),
  status: "idle",
  logs: [],
});

const formatMetrics = (data: Record<string, unknown> | undefined): string => {
  if (!data) return "";
  const numericEntries = Object.entries(data).filter(([, value]) => typeof value === "number");
  if (numericEntries.length === 0) return "";
  return numericEntries.map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`).join(" · ");
};

const formatToolLog = (data: Record<string, unknown> | undefined): string => {
  if (!data) return "Executed tool call.";
  const tool = typeof data.tool === "string" ? data.tool : undefined;
  const query =
    typeof data.query === "string"
      ? data.query
      : typeof data.prompt === "string"
        ? data.prompt
        : undefined;
  const count = typeof data.count === "number" ? data.count : undefined;
  const parts: string[] = [];
  if (tool) parts.push(`Tool: ${tool}`);
  if (query) parts.push(`Query: ${query}`);
  if (typeof count === "number") parts.push(`Results: ${count}`);
  const joined = parts.join(" · ");
  return joined.length > 0 ? joined : "Executed tool call.";
};

const extractArtifactText = (event: GraphEvent): string | null => {
  const payload = event.payload?.data;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim().length > 0) {
    return record.text.trim();
  }
  if (typeof record.message === "string" && record.message.trim().length > 0) {
    return record.message.trim();
  }
  return null;
};

const mergeTasks = (
  taskMap: Record<string, AgentTask>,
  node: string,
  updater: (task: AgentTask) => AgentTask,
): Record<string, AgentTask> => {
  const existing = taskMap[node] ?? createTask(node);
  return {
    ...taskMap,
    [node]: updater(existing),
  };
};

const DEFAULT_STATE: RegulationAgentState = {
  status: "idle",
  runId: null,
  tasks: [],
  reasoning: [],
  snippets: [],
  error: null,
  summary: null,
};

export function useRegulationAgentStream() {
  const [state, setState] = useState<RegulationAgentState>(DEFAULT_STATE);

  const runAgent = useCallback(async (params?: { regulators?: string[] }) => {
    setState((prev) => ({
      ...DEFAULT_STATE,
      status: "running",
      runId: prev.runId,
    }));

    try {
      // POST to API route with optional regulators list
      const resp = await fetch("/api/regulations/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regulators: params?.regulators ?? undefined }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed to start stream.");

      const taskMap: Record<string, AgentTask> = {};
      const reasoning: string[] = [];
      let runId: string | null = null;

      for await (const part of parseSSE(resp)) {
        if (!part || typeof part !== "object") continue;

        // We mapped server writes as data-* parts. Handle each.
        if (part.type === "data-status") {
          runId = part.data?.runId ?? runId;
          setState((prev) => ({
            ...prev,
            status: "running",
            runId,
            error: null,
          }));
          continue;
        }

        if (part.type === "data-event") {
          runId = part.data?.runId ?? runId;
          const event: GraphEvent | undefined = part.data?.event;
          if (!event) continue;
          const node = event.payload?.node ?? "regulatory";
          const ts = event.payload?.ts;
          const data =
            event.payload?.data && typeof event.payload.data === "object"
              ? (event.payload.data as Record<string, unknown>)
              : undefined;

          if (event.type === "on_artifact") {
            const text = extractArtifactText(event);
            if (text) {
              reasoning.push(text);
              setState((prev) => ({
                ...prev,
                runId,
                reasoning: [...reasoning],
              }));
            }
            continue;
          }

          switch (event.type) {
            case "on_node_start": {
              const text = `Started ${NODE_LABELS[node] ?? node}.`;
              const log: TaskLog = {
                id: `${node}_start_${ts ?? Date.now()}`,
                text,
                timestamp: ts,
                level: "info",
              };
              Object.assign(
                taskMap,
                mergeTasks(taskMap, node, (task) => ({
                  ...task,
                  status: "running",
                  logs: [...task.logs, log],
                })),
              );
              break;
            }
            case "on_node_end": {
              const metrics = formatMetrics(data);
              const text = metrics.length > 0 ? `Completed step. ${metrics}` : "Completed step.";
              const log: TaskLog = {
                id: `${node}_end_${ts ?? Date.now()}`,
                text,
                timestamp: ts,
                level: "success",
              };
              Object.assign(
                taskMap,
                mergeTasks(taskMap, node, (task) => ({
                  ...task,
                  status: "success",
                  logs: [...task.logs, log],
                })),
              );
              break;
            }
            case "on_tool_call": {
              const text = formatToolLog(data);
              const log: TaskLog = {
                id: `${node}_tool_${ts ?? Date.now()}`,
                text,
                timestamp: ts,
                level: "info",
              };
              Object.assign(
                taskMap,
                mergeTasks(taskMap, node, (task) => ({
                  ...task,
                  logs: [...task.logs, log],
                })),
              );
              break;
            }
            case "on_error": {
              const text = (data && formatSerializable(data)) || "An error occurred.";
              const log: TaskLog = {
                id: `${node}_error_${ts ?? Date.now()}`,
                text,
                timestamp: ts,
                level: "error",
              };
              Object.assign(
                taskMap,
                mergeTasks(taskMap, node, (task) => ({
                  ...task,
                  status: "error",
                  logs: [...task.logs, log],
                })),
              );
              setState((prev) => ({
                ...prev,
                status: "error",
                runId,
                tasks: buildTaskList(taskMap),
                error: text,
              }));
              break;
            }
            default:
              break;
          }

          setState((prev) => ({
            ...prev,
            runId,
            tasks: buildTaskList(taskMap),
          }));
          continue;
        }

        if (part.type === "data-final") {
          const summary: RegulationAgentSummary | undefined = part.data?.summary;
          const snippetList = summary?.snippets ?? [];
          setState((prev) => ({
            ...prev,
            status: "success",
            runId,
            summary: summary ?? null,
            snippets: snippetList,
            tasks: buildTaskList(taskMap),
            reasoning: [...reasoning, ...snippetList.map((s) => s.text)],
          }));
          continue;
        }

        if (part.type === "data-error") {
          const messageText =
            typeof part.data?.message === "string" && part.data?.message.length > 0
              ? part.data.message
              : "Regulatory agent failed.";
          setState((prev) => ({
            ...prev,
            status: "error",
            runId,
            error: messageText,
          }));
          continue;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start regulatory agent.";
      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const tasks = useMemo(() => state.tasks, [state.tasks]);
  const reasoning = useMemo(() => state.reasoning, [state.reasoning]);

  return {
    status: state.status,
    runId: state.runId,
    tasks,
    reasoning,
    snippets: state.snippets,
    summary: state.summary,
    error: state.error,
    runAgent,
    reset,
  };
}

const buildTaskList = (taskMap: Record<string, AgentTask>): AgentTask[] => {
  const seen = new Set<string>();
  const ordered: AgentTask[] = [];

  TASK_DISPLAY_ORDER.forEach((node) => {
    if (taskMap[node]) {
      ordered.push(taskMap[node]);
      seen.add(node);
    }
  });

  Object.entries(taskMap).forEach(([id, task]) => {
    if (!seen.has(id)) {
      ordered.push(task);
      seen.add(id);
    }
  });

  return ordered;
};
