"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";

type Serializable = any;

type AlertRecord = {
  id: string;
  transaction_id: string;
  severity: "low" | "medium" | "high" | string;
  payload: Serializable;
  created_at?: string | null;
};

type ToastItem = AlertRecord & {
  _dismissAt: number;
};

// A lightweight, global toaster that shows only HIGH severity alerts in real-time.
export default function AlertToaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selected, setSelected] = useState<AlertRecord | null>(null);
  const timersRef = useRef<Map<string, number>>(new Map());
  const lastSeenRef = useRef<string | null>(null); // ISO timestamp

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Subscribe to INSERTs on alerts table and push only high severity as popup toasts
    const channel = supabase
      .channel("alerts-high-toaster")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload: any) => {
          const record = payload?.new as AlertRecord | undefined;
          if (!record) return;
          if (String(record.severity).toLowerCase() !== "high") return;
          enqueueToast(record);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Clear any remaining timers
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Polling fallback in case Realtime is not available or disabled for table
  useEffect(() => {
    let ignore = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const params = new URLSearchParams();
        params.set("severity", "high");
        params.set("limit", "25");
        if (lastSeenRef.current) {
          params.set("cursor", lastSeenRef.current);
          params.set("direction", "after");
        }
        const res = await fetch(`/api/aml/alerts?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return schedule();
        const json = (await res.json()) as { items?: AlertRecord[] };
        const items = Array.isArray(json.items) ? json.items : [];
        if (ignore) return;
        if (items.length > 0) {
          // Ensure chronological order for popping
          const ordered = [...items].reverse();
          for (const it of ordered) {
            enqueueToast(it);
          }
          // Update lastSeen to latest created_at
          const latest = items[0];
          if (latest?.created_at) lastSeenRef.current = latest.created_at;
        } else {
          // If first run with no lastSeen, establish baseline cursor
          if (!lastSeenRef.current) {
            const res2 = await fetch(`/api/aml/alerts?severity=high&limit=1`, {
              cache: "no-store",
            });
            if (res2.ok) {
              const j2 = (await res2.json()) as { items?: AlertRecord[] };
              const last = j2.items?.[0];
              if (last?.created_at) lastSeenRef.current = last.created_at;
            }
          }
        }
      } catch {
        // ignore
      } finally {
        schedule();
      }
    }

    function schedule() {
      timer = window.setTimeout(poll, 5000);
    }

    poll();

    return () => {
      ignore = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function enqueueToast(alert: AlertRecord) {
    const id = alert.id;
    const ttl = 9000; // 9s default display
    const dismissAt = Date.now() + ttl;
    const item: ToastItem = { ...alert, _dismissAt: dismissAt };
    setToasts((prev) => {
      // prevent duplicates if the same id arrives
      if (prev.some((t) => t.id === id)) return prev;
      return [item, ...prev].slice(0, 6); // cap stack
    });
    const timer = window.setTimeout(() => dismissToast(id), ttl);
    timersRef.current.set(id, timer);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }

  return (
    <>
      {/* Toast stack - fixed top-right */}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:max-w-md">
        {toasts.map((a) => {
          const score: number | undefined =
            typeof (a as any)?.payload?.score === "number" ? (a as any).payload.score : undefined;
          const ruleHits: Array<{ rule_id: string; rationale?: string }> = Array.isArray(
            (a as any)?.payload?.rule_hits,
          )
            ? (a as any).payload.rule_hits
            : [];

          return (
            <div key={a.id} className="pointer-events-auto">
              <Card className="border-red-500/30 bg-background/95 shadow-lg backdrop-blur">
                <div className="flex items-start gap-3 p-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge className="border-red-500/30 bg-red-500/10 text-red-600">
                        High Risk
                      </Badge>
                      <span className="truncate text-xs text-muted-foreground">
                        Txn {a.transaction_id?.slice(0, 12)}...
                      </span>
                    </div>
                    <div className="text-sm font-medium">Alert {a.id.slice(0, 8)}...</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {typeof score === "number" ? `Score ${score.toFixed(2)}` : "Score -"}
                      {ruleHits?.length ? ` • ${ruleHits[0]?.rule_id ?? "rule"}` : null}
                    </div>
                    {ruleHits?.length ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {ruleHits[0]?.rationale ?? "Rule triggered"}
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => setSelected(a)}>
                        View details
                      </Button>
                      {a.transaction_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          asChild
                        >
                          <Link href={`/transactions/${a.transaction_id}`}>
                            Drill-down
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <button
                    aria-label="Dismiss alert"
                    className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => dismissToast(a.id)}
                  >
                    ×
                  </button>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>High-risk alert</DialogTitle>
            <DialogDescription>
              Transaction {selected?.transaction_id?.slice(0, 12)}...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Alert ID</span>
              <span className="font-medium">{selected?.id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Severity</span>
              <span className="font-medium capitalize">{selected?.severity}</span>
            </div>
            {typeof (selected as any)?.payload?.score === "number" ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Score</span>
                <span className="font-medium">{(selected as any).payload.score}</span>
              </div>
            ) : null}
            <div>
              <span className="text-muted-foreground">Full alert payload</span>
              <pre className="mt-1 max-h-72 w-full overflow-auto rounded-md bg-muted/20 p-3 text-xs">
                {selected?.payload ? JSON.stringify(selected.payload, null, 2) : "No payload."}
              </pre>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {selected?.transaction_id ? (
              <Button asChild className="gap-1">
                <Link href={`/transactions/${selected.transaction_id}`}>
                  Drill-down
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
