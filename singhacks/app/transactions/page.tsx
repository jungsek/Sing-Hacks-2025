"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RuleHit } from "@/app/langgraph/common/state";
import type { SerializableRecord } from "@/lib/types";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Flag, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Row shape rendered in the table
type Row = {
  transaction_id: string;
  booking_jurisdiction?: string;
  regulator?: string;
  booking_datetime?: string;
  amount?: number;
  currency?: string;
  originator_name?: string;
  originator_country?: string;
  beneficiary_name?: string;
  beneficiary_country?: string;
  travel_rule_complete?: boolean;
  sanctions_screening?: string;
  customer_risk_rating?: string;
  status: "flagged" | "reviewed" | "cleared";
  reason: string;
  score?: number;
  severity?: "low" | "medium" | "high";
  justAdded?: boolean; // for animation on insert
  alert_payload?: (SerializableRecord & {
    rule_hits?: RuleHit[];
  }) | null; // full alert JSON for details view
};

function initialReason(row: Partial<Row>): {
  status: Row["status"];
  reason: string;
  displayRisk: string;
} {
  let status: Row["status"] = "cleared";
  let displayRisk = row.customer_risk_rating || "Low";
  let reason = "Transaction consistent with customer profile";

  if ((row.amount ?? 0) > 1_000_000) {
    status = "flagged";
    displayRisk = "High";
    reason = "High-value transaction above threshold";
  }
  if (row.sanctions_screening === "potential") {
    status = "flagged";
    displayRisk = "High";
    reason = "Sanctions / watchlist hit (potential)";
  }
  if (row.travel_rule_complete === false) {
    status = status === "flagged" ? status : "reviewed";
    displayRisk = displayRisk === "High" ? "High" : "Medium";
    reason = status === "flagged" ? reason : "Travel rule incomplete – requires review";
  }

  return { status, reason, displayRisk };
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  // Buffered rendering queue to ensure steady, one-by-one insertion pace
  const pendingQueueRef = useRef<Row[]>([]);
  const drainingRef = useRef(false);
  const paceMsRef = useRef<number>(140); // adjust cadence here

  const startDrain = useCallback(() => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const drainOnce = () => {
      const item = pendingQueueRef.current.shift();
      if (item) {
        setRows((prev) => [{ ...item, justAdded: true }, ...prev]);
        setScannedCount((c) => c + 1);
        // schedule next
        setTimeout(drainOnce, paceMsRef.current);
      } else {
        drainingRef.current = false;
      }
    };
    setTimeout(drainOnce, paceMsRef.current);
  }, []);

  // Restore persisted rows on first load
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("txn_rows_v1");
      if (raw) {
        const parsed: Row[] = JSON.parse(raw);
        if (Array.isArray(parsed)) setRows(parsed);
      }
    } catch {}
  }, []);

  // Persist rows to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem("txn_rows_v1", JSON.stringify(rows));
    } catch {}
  }, [rows]);

  useEffect(() => {
    if (rows.length === 0) return;
    const timer = setTimeout(() => {
      setRows((prev) => prev.map((r) => (r.justAdded ? { ...r, justAdded: false } : r)));
    }, 350);
    return () => clearTimeout(timer);
  }, [rows]);

  const handleRunScreening = useCallback(async () => {
    if (isStreaming) return;
    setIsStreaming(true);
    setRows([]); // reset view, but previous rows remain in sessionStorage backup until replaced
    setScannedCount(0);
    pendingQueueRef.current = [];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/aml/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_demo: true, concurrency: 8 }),
        signal: controller.signal,
      });
      if (!res.body) {
        setIsStreaming(false);
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

          let type: string | undefined;
          let dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!type || !dataStr) continue;

          try {
            const payload = JSON.parse(dataStr);
            // Ingest CSV rows as table entries
            if (
              type === "on_tool_call" &&
              payload?.node === "ingest" &&
              payload?.data?.type === "csv_row"
            ) {
              const meta = payload.data.meta || {};
              const base: Partial<Row> = {
                transaction_id: payload.data.transaction_id,
                booking_jurisdiction: meta.booking_jurisdiction,
                regulator: meta.regulator,
                booking_datetime: meta.booking_datetime,
                amount: meta.amount,
                currency: meta.currency,
                originator_name: meta.originator_name,
                originator_country: meta.originator_country,
                beneficiary_name: meta.beneficiary_name,
                beneficiary_country: meta.beneficiary_country,
                travel_rule_complete: meta.travel_rule_complete,
                sanctions_screening: meta.sanctions_screening,
                customer_risk_rating: meta.customer_risk_rating,
              } as Partial<Row>;
              const { status, reason, displayRisk } = initialReason(base);
              const row: Row = {
                transaction_id: base.transaction_id!,
                booking_jurisdiction: base.booking_jurisdiction,
                regulator: base.regulator,
                booking_datetime: base.booking_datetime,
                amount: base.amount,
                currency: base.currency,
                originator_name: base.originator_name,
                originator_country: base.originator_country,
                beneficiary_name: base.beneficiary_name,
                beneficiary_country: base.beneficiary_country,
                travel_rule_complete: base.travel_rule_complete,
                sanctions_screening: base.sanctions_screening,
                customer_risk_rating: displayRisk,
                status,
                reason,
                justAdded: true,
              };
              // enqueue and start paced drain
              pendingQueueRef.current.push(row);
              startDrain();
              continue;
            }

            // When alert artifacts arrive, enrich matching row with score/severity and tighten status
            if (type === "on_artifact" && payload?.data?.alert?.json?.transaction_id) {
              const alert = payload.data.alert;
              setRows((prev) =>
                prev.map((r) =>
                  r.transaction_id === alert.json.transaction_id
                    ? {
                        ...r,
                        score: alert.json.score,
                        severity: alert.severity,
                        status: alert.severity === "high" ? "flagged" : r.status,
                        reason: r.reason || "Alert raised by Transaction Agent",
                        alert_payload: (alert.json as SerializableRecord | undefined) ?? null,
                      }
                    : r,
                ),
              );
              continue;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, startDrain]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      {/* 1) FIXED SIDEBAR */}
      <div className="fixed inset-y-0 left-0 z-40 w-64 bg-background">
        <JbSidebar />
      </div>

      {/* 2) MAIN CONTENT SHIFTED RIGHT */}
      <div className="ml-64 flex min-h-screen flex-col">
        <JbTopbar />

        <main className="flex flex-col gap-8 p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Transaction Monitoring</h1>
              <p className="text-muted-foreground">
                Real-time flagged transactions and rule-based monitoring insights.
              </p>
            </div>
          </div>

          <Card className="border-border/70 bg-background/80 shadow-md backdrop-blur">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-semibold">
                    Transaction Monitoring Feed
                  </CardTitle>
                  <CardDescription>
                    {isStreaming
                      ? `Screening ${scannedCount} incoming transactions…`
                      : `Showing ${rows.length} screened transactions.`}
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  className="gap-1"
                  onClick={handleRunScreening}
                  disabled={isStreaming}
                >
                  {isStreaming ? "Running..." : "Run live"}
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Txn ID
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Jurisdiction
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Regulator
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Originator
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Beneficiary
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Risk
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Reason
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border/40">
                    {rows.map((txn) => (
                      <tr
                        key={txn.transaction_id}
                        className={cn(
                          "transition hover:bg-muted/30",
                          txn.justAdded && "duration-200 animate-in fade-in zoom-in-95",
                          txn.customer_risk_rating === "High" && "bg-red-50 dark:bg-red-950/10",
                          txn.customer_risk_rating === "Medium" &&
                            "bg-amber-50 dark:bg-amber-950/10",
                          txn.customer_risk_rating === "Low" &&
                            "bg-green-50/40 dark:bg-green-950/10",
                        )}
                      >
                        <td className="px-4 py-3 font-medium">{txn.transaction_id.slice(0, 8)}…</td>
                        <td className="px-4 py-3">{txn.booking_jurisdiction}</td>
                        <td className="px-4 py-3">{txn.regulator}</td>
                        <td className="px-4 py-3">{txn.originator_name}</td>
                        <td className="px-4 py-3">{txn.beneficiary_name}</td>
                        <td className="px-4 py-3">
                          {typeof txn.amount === "number" ? txn.amount.toLocaleString() : "-"}{" "}
                          {txn.currency}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              txn.customer_risk_rating === "High" &&
                                "border-red-500/20 bg-red-500/10 text-red-600",
                              txn.customer_risk_rating === "Medium" &&
                                "border-amber-500/20 bg-amber-500/10 text-amber-600",
                              txn.customer_risk_rating === "Low" &&
                                "border-green-500/20 bg-green-500/10 text-green-600",
                            )}
                          >
                            {txn.customer_risk_rating}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {txn.status === "flagged" && (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-4 w-4" /> Flagged
                            </span>
                          )}
                          {txn.status === "reviewed" && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <Flag className="h-4 w-4" /> Reviewed
                            </span>
                          )}
                          {txn.status === "cleared" && (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" /> Cleared
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{txn.reason}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" onClick={() => setSelected(txn)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {isStreaming && (
                      <tr>
                        <td colSpan={10} className="px-4 py-3 text-xs italic text-muted-foreground">
                          Screening in progress… new alerts will appear at the top.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Alert details</DialogTitle>
            <DialogDescription>
              Transaction {selected?.transaction_id?.slice(0, 12)}…
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">
                {typeof selected?.amount === "number" ? selected?.amount.toLocaleString() : "-"}{" "}
                {selected?.currency}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Score</span>
              <span className="font-medium">{selected?.score ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Severity</span>
              <span className="font-medium capitalize">{selected?.severity ?? "-"}</span>
            </div>
            {selected?.alert_payload?.rule_hits?.length ? (
              <div>
                <div className="mb-1 text-muted-foreground">Rule hits</div>
                <ul className="list-disc space-y-1 pl-5">
                  {(selected.alert_payload?.rule_hits ?? []).map((hit, idx) => (
                    <li key={idx} className="leading-snug">
                      <span className="font-medium">{hit.rule_id}</span>: {hit.rationale} ({hit.weight})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
