"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { GraphEvent } from "@/app/langgraph/common/events";
import type { RuleHit } from "@/app/langgraph/common/state";
import type { Serializable } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isSerializable = (value: unknown): value is Serializable => {
  if (value === null || typeof value === "undefined") return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isSerializable);
  if (isRecord(value)) {
    return Object.values(value).every(isSerializable);
  }
  return false;
};

const isRuleHit = (value: unknown): value is RuleHit => {
  if (!isRecord(value)) return false;
  return (
    typeof value.rule_id === "string" &&
    typeof value.rationale === "string" &&
    typeof value.weight === "number"
  );
};

const parsePayload = (raw: unknown): GraphEvent["payload"] | null => {
  if (!isRecord(raw)) return null;
  const { run_id, graph, node, ts, data } = raw;
  if (typeof run_id !== "string" || typeof graph !== "string" || typeof ts !== "number") {
    return null;
  }
  if (!(typeof node === "string" || typeof node === "undefined")) {
    return null;
  }
  if (!(typeof data === "undefined" || isSerializable(data))) {
    return null;
  }
  return {
    run_id,
    graph,
    node,
    ts,
    data: data as Serializable | undefined,
  };
};

type RuleHitSummary = Pick<RuleHit, "rule_id" | "rationale">;

type AlertDisplay = {
  id: string;
  severity: string;
  ts: number;
  score?: number;
  ruleHits: RuleHitSummary[];
};

const parseAlert = (data: Serializable | undefined, ts: number): AlertDisplay | null => {
  if (!data || !isRecord(data)) return null;
  const alertRaw = data.alert;
  if (!isRecord(alertRaw)) return null;

  const { id, severity } = alertRaw;
  if (typeof id !== "string" || typeof severity !== "string") return null;

  const jsonRaw = isRecord(alertRaw.json) ? alertRaw.json : undefined;
  const score = typeof jsonRaw?.score === "number" ? jsonRaw.score : undefined;
  const ruleHitsRaw = jsonRaw?.rule_hits;
  const ruleHits: RuleHitSummary[] = Array.isArray(ruleHitsRaw)
    ? ruleHitsRaw.filter(isRuleHit).map((hit) => ({
        rule_id: hit.rule_id,
        rationale: hit.rationale,
      }))
    : [];

  return { id, severity, ts, score, ruleHits };
};

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
}

function renderEventDetails(event: GraphEvent): string {
  const details: string[] = [];
  if (event.payload.node) {
    details.push(`node: ${event.payload.node}`);
  }
  if (isRecord(event.payload.data)) {
    const data = event.payload.data;
    if (typeof data.transaction_id === "string") {
      details.push(`txn: ${data.transaction_id}`);
    }
    if (typeof data.tool === "string") {
      details.push(`tool: ${data.tool}`);
    }
    const scoreValue = data.score;
    if (typeof scoreValue === "number") {
      details.push(`score: ${scoreValue.toFixed?.(2) ?? scoreValue}`);
    }
  }
  return details.join(" � ");
}

export default function TransactionConsole() {
  const [events, setEvents] = useState<GraphEvent[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startRun = useCallback(async () => {
    if (running) return;
    setEvents([]);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/aml/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_demo: true }),
        signal: controller.signal,
      });

      if (!res.body) {
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

       
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 2);

          let type: GraphEvent["type"] | undefined;
          let dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) {
              type = line.slice(6).trim() as GraphEvent["type"];
            } else if (line.startsWith("data:")) {
              dataStr += line.slice(5).trim();
            }
          }
          if (type && dataStr) {
            try {
              const rawPayload = JSON.parse(dataStr) as unknown;
              const payload = parsePayload(rawPayload);
              if (payload) {
                const evt: GraphEvent = { type, payload };
                setEvents((prev) => [...prev, evt]);
              }
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch {
      // aborted or network error
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running]);

  const alerts = useMemo(() => {
    return events
      .filter((event) => event.type === "on_artifact")
      .map((event) => parseAlert(event.payload.data, event.payload.ts))
      .filter((alert): alert is AlertDisplay => alert !== null);
  }, [events]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4">
        <div className="mb-3 font-medium">Run Live Transaction Analysis</div>
        <div className="mt-2">
          <Button onClick={startRun} disabled={running}>
            {running ? "Running..." : "Run Live"}
          </Button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium">Alerts</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {alerts.map((alert) => (
              <Card key={`${alert.id}-${alert.ts}`} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Alert</div>
                  <Badge
                    variant={
                      alert.severity === "high"
                        ? "destructive"
                        : alert.severity === "medium"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {alert.severity}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{formatTime(alert.ts)}</div>
                {typeof alert.score === "number" && (
                  <div className="mt-3 text-sm">Score: {alert.score.toFixed(2)}</div>
                )}
                {alert.ruleHits.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium text-muted-foreground">Top rules</div>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {alert.ruleHits.slice(0, 4).map((hit, index) => (
                        <li key={`${hit.rule_id}-${index}`}>
                          <span className="font-mono text-xs">{hit.rule_id}</span>
                          {hit.rationale ? `: ${hit.rationale}` : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm font-medium">Live feed</div>
        <div className="max-h-[420px] overflow-auto rounded-md border bg-muted/30 p-3">
          {events.length === 0 ? (
            <div className="text-xs text-muted-foreground">No events yet.</div>
          ) : (
            <ul className="space-y-2">
              {events.map((event, index) => (
                <li key={`${event.type}-${event.payload.ts}-${index}`} className="rounded bg-background p-2 text-xs shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-mono">{event.type}</div>
                    <div className="text-muted-foreground">{formatTime(event.payload.ts)}</div>
                  </div>
                  <div className="mt-1 font-mono text-[11px]">
                    {renderEventDetails(event)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
