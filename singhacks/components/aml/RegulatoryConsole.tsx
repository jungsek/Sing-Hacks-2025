"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

type EventLog = {
  id: string;
  type: string;
  ts: number;
  node?: string;
  payload?: unknown;
};

const DEFAULT_TRANSACTION_ID = "TEST-MAS-001";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export default function RegulatoryConsole() {
  const [transactionId, setTransactionId] = useState<string>(DEFAULT_TRANSACTION_ID);
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [isQuickRun, setIsQuickRun] = useState<boolean>(false);
  const [quickSummary, setQuickSummary] = useState<{
    runId: string;
    candidates: number;
    documents: number;
    proposals: number;
    versions: number;
    snippets: number;
    lastSnippet?: string;
  } | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLogs([]);
    setError(null);
  }, []);

  const parseAndAppend = useCallback((chunk: string) => {
    const parts = chunk.split("\n");
    let eventType = "message";
    let dataLine = "";

    for (const part of parts) {
      if (part.startsWith("event:")) {
        eventType = part.slice(6).trim();
      } else if (part.startsWith("data:")) {
        dataLine += part.slice(5).trim();
      }
    }

    if (!dataLine) return;

    try {
      const parsed = JSON.parse(dataLine);
      const node =
        typeof parsed === "object" && parsed !== null
          ? (parsed.node as string | undefined)
          : undefined;
      const payload =
        typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>).data
          : parsed;
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: eventType,
          ts: Date.now(),
          node,
          payload,
        },
      ]);
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "parse_error",
          ts: Date.now(),
          payload: { chunk: dataLine, error: (err as Error).message },
        },
      ]);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!transactionId || transactionId.trim().length === 0) {
      setError("Enter a transaction id to kick off the Sentinel flow.");
      return;
    }

    reset();
    setIsRunning(true);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch("/api/aml/monitor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transaction_ids: [transactionId], stream: true }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          if (event.trim().length === 0) continue;
          parseAndAppend(event);
        }
      }

      if (buffer.trim().length > 0) {
        parseAndAppend(buffer);
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        setError("Stream aborted by user.");
      } else {
        setError((err as Error).message ?? "Unexpected error during stream.");
      }
    } finally {
      setIsRunning(false);
      controllerRef.current = null;
    }
  }, [parseAndAppend, reset, transactionId]);

  const handleStop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const handleQuickScrape = useCallback(async () => {
    setQuickError(null);
    setIsQuickRun(true);
    setQuickSummary(null);

    try {
      const response = await fetch("/api/aml/regulatory/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regulators: ["MAS"] }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        run_id?: string;
        state?: {
          regulatory_candidates?: unknown[];
          regulatory_documents?: unknown[];
          rule_proposals?: unknown[];
          regulatory_versions?: unknown[];
          regulatory_snippets?: Array<{ text?: string }>;
        };
      };

      const state = payload.state ?? {};
      const candidates = Array.isArray(state.regulatory_candidates)
        ? state.regulatory_candidates.length
        : 0;
      const documents = Array.isArray(state.regulatory_documents)
        ? state.regulatory_documents.length
        : 0;
      const proposals = Array.isArray(state.rule_proposals) ? state.rule_proposals.length : 0;
      const versions = Array.isArray(state.regulatory_versions)
        ? state.regulatory_versions.length
        : 0;
      const snippets = Array.isArray(state.regulatory_snippets) ? state.regulatory_snippets : [];
      const lastSnippet = snippets.length > 0 ? snippets[snippets.length - 1] : undefined;

      setQuickSummary({
        runId: payload.run_id ?? "unknown",
        candidates,
        documents,
        proposals,
        versions,
        snippets: snippets.length,
        lastSnippet:
          typeof lastSnippet === "object" && lastSnippet && "text" in lastSnippet
            ? (lastSnippet as { text?: string }).text
            : undefined,
      });
    } catch (err) {
      setQuickError((err as Error).message ?? "Failed to run MAS scraping.");
    } finally {
      setIsQuickRun(false);
    }
  }, []);

  const proposals = useMemo(() => {
    return logs
      .filter((entry) => entry.type === "on_artifact")
      .flatMap((entry) => {
        if (!entry.payload || typeof entry.payload !== "object") return [];
        const data = entry.payload as { type?: string; proposals?: Array<Record<string, unknown>> };
        if (data.type !== "regulatory_rule_proposals" || !Array.isArray(data.proposals)) return [];
        return data.proposals;
      });
  }, [logs]);

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold">Sentinel Regulatory Agent</h2>
          <p className="text-sm text-muted-foreground">
            Trigger the AML Sentinel regulatory subflow to discover MAS circulars, extract content
            via Tavily, and surface draft rule proposals.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex w-full flex-col text-sm font-medium">
            Transaction ID
            <input
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
              placeholder="e.g. TEST-MAS-001"
              className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isRunning}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
            >
              {isRunning ? "Running…" : "Run Sentinel"}
            </button>
            <button
              type="button"
              onClick={handleStop}
              disabled={!isRunning}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Stop
            </button>
          </div>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-primary/40 bg-card/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold">Quick MAS Scrape</h3>
            <p className="text-xs text-muted-foreground">
              Run the regulatory subflow directly against MAS sources without streaming the full
              transaction flow.
            </p>
          </div>
          <button
            type="button"
            onClick={handleQuickScrape}
            disabled={isQuickRun}
            className="inline-flex items-center justify-center rounded-md border border-primary/60 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isQuickRun ? "Running..." : "Run MAS Scraping"}
          </button>
          <button
            type="button"
            onClick={handleQuickScrape}
            disabled={isQuickRun}
            className="inline-flex items-center justify-center rounded-md border border-primary/60 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isQuickRun ? "Refreshing..." : "Upload Regulatory Knowledge Base"}
          </button>
          <Link
            href="/aml/regulatory"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            View Knowledge Base
          </Link>
        </div>
        {quickError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {quickError}
          </div>
        )}
        {quickSummary && (
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <div>
              Run {quickSummary.runId}: {quickSummary.candidates} candidates |{" "}
              {quickSummary.documents} documents | {quickSummary.proposals} proposals |{" "}
              {quickSummary.versions} versions | {quickSummary.snippets} snippets.
            </div>
            {quickSummary.lastSnippet && (
              <div className="rounded-md border border-border/40 bg-background px-3 py-2 text-foreground">
                {quickSummary.lastSnippet}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <header>
            <h3 className="text-lg font-semibold">Streaming Events</h3>
            <p className="text-xs text-muted-foreground">
              Latest SSE messages from the AML monitor endpoint.
            </p>
          </header>
          <div className="h-64 overflow-y-auto rounded-md border border-muted bg-background p-3 text-sm">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">
                No events yet. Run the Sentinel flow to start streaming.
              </p>
            ) : (
              <ul className="space-y-2">
                {logs.map((entry) => (
                  <li key={entry.id} className="rounded border border-border/60 bg-muted/30 p-2">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                      <span>{entry.type}</span>
                      <span>{formatTimestamp(entry.ts)}</span>
                    </div>
                    {entry.node && (
                      <div className="mt-1 text-xs text-muted-foreground">Node: {entry.node}</div>
                    )}
                    {entry.payload !== undefined && entry.payload !== null && (
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-background px-2 py-1 text-xs">
                        {typeof entry.payload === "string"
                          ? entry.payload
                          : JSON.stringify(entry.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <header>
            <h3 className="text-lg font-semibold">Draft Rule Proposals</h3>
            <p className="text-xs text-muted-foreground">
              Summaries of MAS regulatory findings queued for review.
            </p>
          </header>
          <div className="h-64 overflow-y-auto rounded-md border border-muted bg-background p-3 text-sm">
            {proposals.length === 0 ? (
              <p className="text-muted-foreground">
                Run the flow to surface MAS regulatory proposals.
              </p>
            ) : (
              <ul className="space-y-3">
                {proposals.map((proposal, index) => {
                  const id = (proposal as { id?: string }).id ?? `proposal-${index}`;
                  const title =
                    (proposal as { document_title?: string }).document_title ??
                    "MAS Regulatory Document";
                  const url = (proposal as { document_url?: string }).document_url;
                  const summary = (proposal as { summary?: string }).summary;

                  return (
                    <li key={id} className="rounded border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                        <span>Draft</span>
                        <span>{id}</span>
                      </div>
                      <h4 className="mt-1 text-sm font-semibold">{title}</h4>
                      {summary && <p className="mt-2 text-sm text-muted-foreground">{summary}</p>}
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
                        >
                          View source ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
