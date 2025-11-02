"use client";

import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  caseId?: string | number | null;
  documentId?: string | number | null;
};

export default function AnalysisCard({ caseId, documentId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null); // kept for internal logging but not shown to the user

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
      const params = new URLSearchParams();
      if (caseId) params.set("case_id", String(caseId));
      if (documentId) params.set("document_id", String(documentId));

      // This endpoint may be implemented in the future. Handle non-OK responses gracefully.
      const res = await fetch(`/api/docs/analysis?${params.toString()}`);
      if (!res.ok) {
        // Backend may not be ready yet — treat as "no analysis" rather than an error the user needs to see
        setResult(null);
        setError(null);
        return;
      }

      const json = await res.json().catch(() => null);
      // Support either structured JSON or plain text
      const body = json ?? (await res.text().catch(() => null));
      setResult(body);
    } catch (err: any) {
      // don't surface fetch errors to the user; show no-analysis blank state instead
      setResult(null);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch on mount when caseId or documentId present
    if (caseId || documentId) fetchResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, documentId]);

  return (
    <Card className="w-80 bg-white/70 dark:bg-slate-900/40">
      <CardHeader>
        <CardTitle>Analysis</CardTitle>
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
            <div>
              <div className="text-sm font-medium">Analysis result</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {typeof result === "string" ? result : JSON.stringify(result)}
              </div>
              <div className="mt-3">
                <Button variant="ghost" onClick={fetchResult} size="sm">
                  Refresh
                </Button>
              </div>
            </div>
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
