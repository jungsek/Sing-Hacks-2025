"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEventPayload, GraphEventType } from "@/app/langgraph/common/events";
import type {
  RegulatorySnippet,
  RegulatoryVersionRecord,
  RuleHit,
  RuleProposal,
  SentinelAlert,
} from "@/app/langgraph/common/state";

export type TaskStatus = "idle" | "running" | "success" | "error";

type TaskLogLevel = "info" | "success" | "warning" | "error";

type TaskLog = {
  id: string;
  text: string;
  level: TaskLogLevel;
  timestamp?: number;
};

export type AgentTask = {
  id: string;
  title: string;
  status: TaskStatus;
  logs: TaskLog[];
};

type TransactionAgentState = {
  status: "idle" | "running" | "success" | "error";
  runId: string | null;
  score: number | null;
  severity: SentinelAlert["severity"] | null;
  alert: SentinelAlert | null;
  ruleHits: RuleHit[];
  reasoning: string[];
  regulatorySnippets: RegulatorySnippet[];
  regulatoryProposals: RuleProposal[];
  regulatoryVersions: RegulatoryVersionRecord[];
  analysisOrigin: string | null;
  analysisModel: string | null;
  durationMs: number | null;
  tasks: AgentTask[];
  error: string | null;
};

const NODE_TITLES: Record<string, string> = {
  transaction: "Transaction analysis",
  regulatory: "Regulatory enrichment",
  alert: "Alert generation",
};

const TASK_ORDER = ["transaction", "regulatory", "alert"];

const INITIAL_STATE: TransactionAgentState = {
  status: "idle",
  runId: null,
  score: null,
  severity: null,
  alert: null,
  ruleHits: [],
  reasoning: [],
  regulatorySnippets: [],
  regulatoryProposals: [],
  regulatoryVersions: [],
  analysisOrigin: null,
  analysisModel: null,
  durationMs: null,
  tasks: [],
  error: null,
};

type TaskMap = Record<string, AgentTask>;

const sanitizeRuleHits = (candidate: unknown): RuleHit[] => {
  if (!Array.isArray(candidate)) return [];
  const hits: RuleHit[] = [];
  for (const entry of candidate) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const ruleId = record.rule_id;
    const rationale = record.rationale;
    const weight = record.weight;
    if (typeof ruleId !== "string" || typeof rationale !== "string") continue;
    const numericWeight = typeof weight === "number" ? weight : Number(weight);
    if (!Number.isFinite(numericWeight)) continue;
    hits.push({ rule_id: ruleId, rationale, weight: numericWeight });
  }
  return hits;
};

const sanitizeSnippets = (candidate: unknown): RegulatorySnippet[] => {
  if (!Array.isArray(candidate)) return [];
  const out: RegulatorySnippet[] = [];
  for (const entry of candidate) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = record.text;
    if (typeof text !== "string" || text.trim().length === 0) continue;
    const snippet: RegulatorySnippet = {
      rule_id: typeof record.rule_id === "string" && record.rule_id.trim().length > 0
        ? record.rule_id
        : `snippet:${text.slice(0, 24).replace(/\s+/g, "_")}`,
      text: text.trim(),
    };
    if (typeof record.source_url === "string") snippet.source_url = record.source_url;
    if (
      record.level === "info" ||
      record.level === "success" ||
      record.level === "warning" ||
      record.level === "error"
    ) {
      snippet.level = record.level;
    }
    out.push(snippet);
  }
  return out;
};

const sanitizeProposals = (candidate: unknown): RuleProposal[] => {
  if (!Array.isArray(candidate)) return [];
  return (candidate.filter((entry) => entry && typeof entry === "object") as RuleProposal[]) ?? [];
};

const sanitizeVersions = (candidate: unknown): RegulatoryVersionRecord[] => {
  if (!Array.isArray(candidate)) return [];
  return (candidate.filter((entry) => entry && typeof entry === "object") as RegulatoryVersionRecord[]) ?? [];
};

const buildTaskList = (taskMap: TaskMap): AgentTask[] => {
  const ordered: AgentTask[] = [];
  const seen = new Set<string>();
  for (const id of TASK_ORDER) {
    const task = taskMap[id];
    if (task) {
      ordered.push(task);
      seen.add(id);
    }
  }
  Object.entries(taskMap).forEach(([id, task]) => {
    if (!seen.has(id)) ordered.push(task);
  });
  return ordered;
};

const appendLog = (
  task: AgentTask,
  log: TaskLog,
  status?: TaskStatus,
): AgentTask => ({
  ...task,
  status: status ?? task.status,
  logs: [...task.logs, log],
});

const formatToolRationale = (node: string | undefined, data: Record<string, unknown> | undefined) => {
  if (!data) return null;
  const ruleId = typeof data.rule_id === "string" ? data.rule_id : undefined;
  const rationale = typeof data.rationale === "string" ? data.rationale : undefined;
  const weightValue = data.weight;
  const weight = typeof weightValue === "number" ? weightValue : Number(weightValue);
  const parts: string[] = [];
  if (ruleId) parts.push(`Rule ${ruleId}`);
  if (Number.isFinite(weight)) parts.push(`weight ${(weight as number).toFixed(2)}`);
  if (parts.length === 0 && rationale) parts.push("Tool call");
  const header = parts.length > 0 ? `${parts.join(" - ")}:` : null;
  if (!header && !rationale) return null;
  return [header, rationale].filter(Boolean).join(" \n");
};

const extractMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string" && message.trim().length > 0) return message.trim();
  const text = record.text;
  if (typeof text === "string" && text.trim().length > 0) return text.trim();
  return null;
};

export function useTransactionAgentStream(transactionId?: string) {
  const [state, setState] = useState<TransactionAgentState>(INITIAL_STATE);
  const controllerRef = useRef<AbortController | null>(null);
  const taskMapRef = useRef<TaskMap>({});
  const startTimeRef = useRef<number | null>(null);
  const runIdRef = useRef<string | null>(null);

  const resetTasks = () => {
    taskMapRef.current = {};
  };

  const ensureTask = useCallback((node: string | undefined): AgentTask => {
    const key = node ?? "sentinel";
    const existing = taskMapRef.current[key];
    if (existing) return existing;
    const title = NODE_TITLES[key] ?? key.replace(/_/g, " ");
    const task: AgentTask = { id: key, title, status: "idle", logs: [] };
    taskMapRef.current = { ...taskMapRef.current, [key]: task };
    return taskMapRef.current[key];
  }, []);

  const updateTask = useCallback(
    (node: string | undefined, updater: (task: AgentTask) => AgentTask) => {
      const key = node ?? "sentinel";
      const current = ensureTask(key);
      const updated = updater(current);
      taskMapRef.current = { ...taskMapRef.current, [key]: updated };
    },
    [ensureTask],
  );

  const handleGraphEvent = useCallback(
    (type: GraphEventType, payload: GraphEventPayload) => {
      const { run_id: runId, node, ts, data } = payload;
      if (!runIdRef.current) runIdRef.current = runId;
      const timestamp = typeof ts === "number" ? ts : Date.now();
      const dataRecord = data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;

      switch (type) {
        case "on_node_start": {
          if (startTimeRef.current === null) {
            startTimeRef.current = timestamp;
          }
          updateTask(node, (task) =>
            appendLog(task, {
              id: `${runId}_${task.id}_start_${timestamp}`,
              text: "Node started",
              level: "info",
              timestamp,
            }, "running"),
          );
          setState((prev) => ({
            ...prev,
            status: "running",
            runId: runIdRef.current,
            tasks: buildTaskList(taskMapRef.current),
          }));
          break;
        }
        case "on_node_end": {
          let detail: string | null = null;
          if (node === "transaction") {
            const score = typeof dataRecord?.score === "number" ? dataRecord.score : null;
            const hits = sanitizeRuleHits(dataRecord?.rule_hits);
            const origin = typeof dataRecord?.origin === "string" ? dataRecord.origin : null;
            const model = typeof dataRecord?.model === "string" ? dataRecord.model : null;
            detail = [
              score !== null ? `Score ${score.toFixed(2)}` : null,
              origin ? `Origin: ${origin}` : null,
              model ? `Model: ${model}` : null,
            ]
              .filter(Boolean)
              .join(" - ");
            setState((prev) => ({
              ...prev,
              runId: runIdRef.current,
              score: score ?? prev.score,
              ruleHits: hits.length > 0 ? hits : prev.ruleHits,
              analysisOrigin: origin ?? prev.analysisOrigin,
              analysisModel: model ?? prev.analysisModel,
            }));
          } else if (node === "regulatory") {
            const snippets = sanitizeSnippets(dataRecord?.snippets_new);
            if (snippets.length > 0) {
              setState((prev) => ({
                ...prev,
                runId: runIdRef.current,
                regulatorySnippets: [...prev.regulatorySnippets, ...snippets],
              }));
            }
            const counts: string[] = [];
            const totalCandidates = dataRecord?.candidates_total;
            const totalDocuments = dataRecord?.documents_total;
            if (typeof totalCandidates === "number") counts.push(`Candidates ${totalCandidates}`);
            if (typeof totalDocuments === "number") counts.push(`Documents ${totalDocuments}`);
            detail = counts.join(" - ") || null;
          } else if (node === "alert") {
            detail = dataRecord?.alert && typeof dataRecord.alert === "object" ? "Alert ready" : null;
            setState((prev) => {
              const duration =
                prev.durationMs ??
                (startTimeRef.current !== null ? Math.max(0, timestamp - startTimeRef.current) : null);
              return {
                ...prev,
                runId: runIdRef.current,
                status: prev.status === "error" ? prev.status : "success",
                durationMs: duration,
              };
            });
          }
          updateTask(node, (task) =>
            appendLog(
              task,
              {
                id: `${runId}_${task.id}_end_${timestamp}`,
                text: detail ? `Completed - ${detail}` : "Completed",
                level: "success",
                timestamp,
              },
              "success",
            ),
          );
          setState((prev) => ({
            ...prev,
            tasks: buildTaskList(taskMapRef.current),
          }));
          break;
        }
        case "on_tool_call": {
          const rationaleText = formatToolRationale(node, dataRecord);
          if (rationaleText) {
            updateTask(node, (task) =>
              appendLog(
                task,
                {
                  id: `${runId}_${task.id}_tool_${timestamp}_${task.logs.length}`,
                  text: rationaleText,
                  level: "info",
                  timestamp,
                },
                task.status === "idle" ? "running" : task.status,
              ),
            );
            setState((prev) => ({
              ...prev,
              runId: runIdRef.current,
              tasks: buildTaskList(taskMapRef.current),
              reasoning: rationaleText ? [...prev.reasoning, rationaleText] : prev.reasoning,
            }));
          }
          break;
        }
        case "on_artifact": {
          let updated = false;
          if (dataRecord?.alert && typeof dataRecord.alert === "object") {
            const alert = dataRecord.alert as SentinelAlert;
            const payload = (alert.json ?? {}) as Record<string, unknown>;
            const score = typeof payload.score === "number" ? payload.score : null;
            const severity = typeof alert.severity === "string" ? alert.severity : null;
            const hits = sanitizeRuleHits(payload.rule_hits);
            const snippets = sanitizeSnippets(payload.regulatory_snippets);
            updateTask(node, (task) =>
              appendLog(
                task,
                {
                  id: `${runId}_${task.id}_artifact_${timestamp}`,
                  text: `Alert emitted - Severity ${severity ?? "unknown"}`,
                  level: "success",
                  timestamp,
                },
                "success",
              ),
            );
            setState((prev) => ({
              ...prev,
              runId: runIdRef.current,
              alert,
              score: score ?? prev.score,
              severity: severity ?? prev.severity,
              ruleHits: hits.length > 0 ? hits : prev.ruleHits,
              regulatorySnippets: snippets.length > 0 ? snippets : prev.regulatorySnippets,
              tasks: buildTaskList(taskMapRef.current),
            }));
            updated = true;
          }
          const type = typeof dataRecord?.type === "string" ? dataRecord.type : null;
          if (type === "regulatory_rule_proposals") {
            const proposals = sanitizeProposals(dataRecord?.proposals);
            if (proposals.length > 0) {
              updateTask(node, (task) =>
                appendLog(
                  task,
                  {
                    id: `${runId}_${task.id}_artifact_proposals_${timestamp}`,
                    text: `Generated ${proposals.length} proposal${proposals.length > 1 ? "s" : ""}`,
                    level: "info",
                    timestamp,
                  },
                  task.status === "idle" ? "running" : task.status,
                ),
              );
              setState((prev) => ({
                ...prev,
                runId: runIdRef.current,
                regulatoryProposals: [...prev.regulatoryProposals, ...proposals],
                tasks: buildTaskList(taskMapRef.current),
              }));
              updated = true;
            }
          }
          if (type === "regulatory_rule_versions") {
            const versions = sanitizeVersions(dataRecord?.versions);
            if (versions.length > 0) {
              updateTask(node, (task) =>
                appendLog(
                  task,
                  {
                    id: `${runId}_${task.id}_artifact_versions_${timestamp}`,
                    text: `Captured ${versions.length} rule version${versions.length > 1 ? "s" : ""}`,
                    level: "info",
                    timestamp,
                  },
                  task.status === "idle" ? "running" : task.status,
                ),
              );
              setState((prev) => ({
                ...prev,
                runId: runIdRef.current,
                regulatoryVersions: [...prev.regulatoryVersions, ...versions],
                tasks: buildTaskList(taskMapRef.current),
              }));
              updated = true;
            }
          }
          if (!updated) {
            setState((prev) => ({
              ...prev,
              tasks: buildTaskList(taskMapRef.current),
            }));
          }
          break;
        }
        case "on_error": {
          const message = extractMessage(dataRecord) ?? "Transaction agent reported an error.";
          updateTask(node, (task) =>
            appendLog(
              task,
              {
                id: `${runId}_${task.id}_error_${timestamp}`,
                text: message,
                level: "error",
                timestamp,
              },
              "error",
            ),
          );
          setState((prev) => ({
            ...prev,
            status: "error",
            runId: runIdRef.current,
            error: message,
            tasks: buildTaskList(taskMapRef.current),
          }));
          break;
        }
        default:
          break;
      }
    },
    [updateTask],
  );

  const runAgent = useCallback(async () => {
    if (!transactionId) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: "Missing transaction identifier.",
      }));
      return;
    }
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    controllerRef.current = new AbortController();
    taskMapRef.current = {};
    runIdRef.current = null;
    startTimeRef.current = null;
    setState({ ...INITIAL_STATE, status: "running" });

    try {
      const res = await fetch("/api/aml/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_ids: [transactionId] }),
        signal: controllerRef.current.signal,
      });

      if (!res.ok) {
        const message = `Transaction agent failed (${res.status})`;
        throw new Error(message);
      }
      if (!res.body) {
        throw new Error("Transaction agent did not return a response stream.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          if (!chunk) continue;

          const lines = chunk.split(/\n/);
          let eventType: GraphEventType | undefined;
          let dataText = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim() as GraphEventType;
            } else if (line.startsWith("data:")) {
              dataText += line.slice(5).trim();
            }
          }

          if (!eventType || dataText.length === 0) continue;
          try {
            const parsed = JSON.parse(dataText) as GraphEventPayload;
            handleGraphEvent(eventType, parsed);
          } catch {
            // ignore malformed payloads
          }
        }
      }

      const duration =
        startTimeRef.current !== null ? Math.max(0, Date.now() - startTimeRef.current) : null;
      setState((prev) => ({
        ...prev,
        status: prev.status === "error" ? prev.status : "success",
        durationMs: prev.durationMs ?? duration,
        tasks: buildTaskList(taskMapRef.current),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run transaction agent.";
      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
        durationMs:
          prev.durationMs ??
          (startTimeRef.current !== null ? Math.max(0, Date.now() - startTimeRef.current) : null),
        tasks: buildTaskList(taskMapRef.current),
      }));
    } finally {
      controllerRef.current = null;
      startTimeRef.current = null;
    }
  }, [transactionId, handleGraphEvent]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((prev) => ({
      ...prev,
      status: prev.status === "running" ? "idle" : prev.status,
    }));
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      resetTasks();
    };
  }, []);

  const tasks = useMemo(() => state.tasks, [state.tasks]);
  const reasoning = useMemo(() => state.reasoning, [state.reasoning]);

  return {
    status: state.status,
    runId: state.runId,
    score: state.score,
    severity: state.severity,
    alert: state.alert,
    ruleHits: state.ruleHits,
    reasoning,
    regulatorySnippets: state.regulatorySnippets,
    regulatoryProposals: state.regulatoryProposals,
    regulatoryVersions: state.regulatoryVersions,
    analysisOrigin: state.analysisOrigin,
    analysisModel: state.analysisModel,
    durationMs: state.durationMs,
    error: state.error,
    tasks,
    runAgent,
    cancel,
    isStreaming: state.status === "running",
  };
}
