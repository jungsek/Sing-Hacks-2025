"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  caseId?: string | number | null;
  documentId?: string | number | null;
  initialResult?: any | null;
};

export default function AnalysisCard({ caseId, documentId, initialResult }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null); // kept for internal logging but not shown to the user
  const [showRaw, setShowRaw] = useState(false);

  const fetchResult = async () => {
    if (!caseId && !documentId) {
      // nothing to fetch — show the 'no analysis' blank state
      setResult(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Prefer fetching the stored aml_cases row when a caseId is provided.
      if (caseId) {
        const res = await fetch(`/api/documents/get-case?case_id=${encodeURIComponent(String(caseId))}`);
        if (!res.ok) {
          // If backend not ready or case missing, show no-analysis blank state
          setResult(null);
          setError(null);
          return;
        }

        const json = await res.json().catch(() => null);
        if (!json || !json.ok) {
          setResult(null);
          setError(json?.error ?? null);
          return;
        }

        const caseRow = json.case ?? null;
        // Normalize to the shapes the component already understands:
        // { final: <analysis_report>, updateCase: { case: <caseRow> } }
        const payload = { final: caseRow?.analysis_report ?? null, updateCase: { case: caseRow } };
        setResult(payload);
        return;
      }

      // Fallback: if only documentId is provided, try existing analysis endpoint
      if (documentId) {
        const params = new URLSearchParams();
        params.set("document_id", String(documentId));
        const res = await fetch(`/api/docs/analysis?${params.toString()}`);
        if (!res.ok) {
          setResult(null);
          setError(null);
          return;
        }
        const json = await res.json().catch(() => null);
        const body = json ?? (await res.text().catch(() => null));
        setResult(body);
        return;
      }
    } catch (err: any) {
      // don't surface fetch errors to the user; show no-analysis blank state instead
      setResult(null);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If the caller provided an initialResult (e.g., streaming SSE), use it and skip auto-fetch.
    if (initialResult != null) {
      setResult(initialResult);
      setError(null);
      setLoading(false);
      return;
    }

    // Otherwise fetch on mount when caseId or documentId present
    if (caseId || documentId) fetchResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, documentId, initialResult]);

  // Small subcomponent that formats the analysis payload when available
  function FormattedAnalysis({ result, onRefresh, showRaw }: { result: any; onRefresh: () => void; showRaw: boolean }) {

    // try to normalize different payload shapes
    let parsed = result;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch (_) {
        parsed = { text: result };
      }
    }

    // final may itself be a JSON-stringified blob (common when persisted to DB). If so,
    // parse it so we can access nested fields like risk, markdown, etc.
    const rawFinal = parsed?.final ?? parsed;
    let final: any = rawFinal;
    if (typeof rawFinal === "string") {
      try {
        final = JSON.parse(rawFinal);
      } catch {
        // keep as string when not parseable
        final = rawFinal;
      }
    }

    const risk = parsed?.risk ?? final?.risk ?? final?.json?.risk ?? null;
    const markdown = final?.markdown ?? final?.json?.markdown ?? parsed?.markdown ?? null;
    const document_id = final?.document_id ?? parsed?.document_id ?? null;
    const case_id = parsed?.updateCase?.case?.id ?? parsed?.case_id ?? null;
    const client_name = parsed?.updateCase?.case?.client_name ?? parsed?.client?.name ?? null;
    const client_id = parsed?.updateCase?.case?.client_id ?? parsed?.client?.id ?? null;
    const case_status = parsed?.updateCase?.case?.status ?? null;

    const level = risk?.level ?? (risk && risk.level) ?? null;
    const score = risk?.score ?? (risk && risk.score) ?? null;

    // We will display severity and score as plain text (no background/border) per request.

    // minimal markdown -> JSX renderer (supports #, ##, and - list items)
    const renderMarkdownToJSX = (md: string) => {
      const lines = String(md || "").split(/\r?\n/);
      const nodes: React.ReactNode[] = [];
      let listItems: string[] | null = null;

      const flushList = () => {
        if (!listItems) return;
        nodes.push(
          React.createElement(
            "ul",
            { className: "ml-4 list-disc text-xs text-muted-foreground" },
            listItems.map((it, i) => React.createElement("li", { key: i }, it))
          )
        );
        listItems = null;
      };

      for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith("## ")) {
          flushList();
          nodes.push(React.createElement("h3", { key: nodes.length, className: "text-sm font-medium mt-2" }, line.slice(3)));
        } else if (line.startsWith("# ")) {
          flushList();
          nodes.push(React.createElement("div", { key: nodes.length, className: "text-sm font-semibold mt-1" }, line.slice(2)));
        } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("+ ")) {
          if (!listItems) listItems = [];
          listItems.push(line.slice(2));
        } else if (line === "") {
          flushList();
        } else {
          flushList();
          nodes.push(React.createElement("div", { key: nodes.length, className: "text-xs text-muted-foreground mt-1" }, line));
        }
      }

      flushList();
      return React.createElement("div", { className: "prose prose-sm max-w-none" }, ...nodes);
    };


    // For raw view, prefer a normalized parsed object where final (if string) is parsed.
    const parsedForRaw = { ...(parsed || {}), final };

    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {level && String(level).toLowerCase() === "medium" ? (
              <div className="rounded-md px-2 py-0.5 text-xs font-medium border bg-amber-100 text-amber-700 border-amber-300">
                {String(level).toUpperCase()}
              </div>
            ) : (
              <div className="text-xs font-medium text-muted-foreground">{level ? String(level).toUpperCase() : "UNKNOWN"}</div>
            )}

            <div className="text-sm text-muted-foreground">Risk score</div>
            <div className={`ml-2 text-lg font-semibold ${level && String(level).toLowerCase() === "medium" ? "text-amber-700" : ""}`}>
              {score ?? "—"}
            </div>
          </div>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          {markdown ? renderMarkdownToJSX(String(markdown)) : <div className="text-sm text-muted-foreground">No analysis available</div>}
        </div>

        <div className="mt-3 text-xs text-muted-foreground space-y-1">
          {document_id ? (
            <div>
              <span className="font-medium">Document ID:</span> {document_id}
            </div>
          ) : null}
          {case_id ? (
            <div>
              <span className="font-medium">Case ID:</span> {case_id}
            </div>
          ) : null}
          {client_name || client_id ? (
            <div>
              <span className="font-medium">Client:</span> {client_name ?? "-"} · {client_id ?? "-"}
            </div>
          ) : null}
          {/* case_status intentionally excluded from display per request */}
        </div>

        {showRaw ? (
          <div className="mt-3 max-h-40 overflow-auto rounded border p-2 text-xs bg-white/50">
            <pre className="whitespace-pre-wrap">{JSON.stringify(parsedForRaw, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card className="w-96 bg-white/70 dark:bg-slate-900/40">
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <CardTitle>Analysis</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRaw((s) => !s)}
              disabled={!result}
            >
              {showRaw ? "Hide raw" : "Show raw"}
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchResult} disabled={loading || !result}>
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 animate-spin text-gray-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg>
              <span className="text-sm font-medium">Loading analysis…</span>
            </div>
          ) : result ? (
            <FormattedAnalysis result={result} onRefresh={fetchResult} showRaw={showRaw} />
          ) : (
            <div className="min-h-[96px] flex items-center justify-center">
              <div className="text-sm text-muted-foreground text-center">No analysis available</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
