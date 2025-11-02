import type { TransactionRecord } from "@/lib/supabase/dao/transactions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { TransactionDrilldown } from "@/components/transactions/TransactionDrilldown";
import { Button } from "@/components/ui/button";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import { getTransactionById } from "@/lib/supabase/dao/transactions";
import { getLatestAlertByTransactionId } from "@/lib/supabase/dao/alerts";
import { getLatestMonitorRowMeta } from "@/lib/supabase/dao/monitorRows";

function formatTxnId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 12)}...`;
}

type PageParams = {
  transactionId: string;
};

type PageProps = {
  params: Promise<PageParams>;
};

export default async function TransactionDetailPage({ params }: PageProps) {
  const { transactionId } = await params;
  const [transaction, latestAlert, latestMeta] = await Promise.all([
    getTransactionById(transactionId),
    getLatestAlertByTransactionId(transactionId),
    getLatestMonitorRowMeta(transactionId),
  ]);
  const resolvedTransaction: TransactionRecord = transaction ?? {
    id: transactionId,
    amount: null,
    currency: null,
    customer_id: null,
    meta: latestMeta ?? {},
  };

  // Merge any meta found in monitor_rows if base transaction meta is missing fields
  if (resolvedTransaction && latestMeta) {
    resolvedTransaction.meta = { ...(resolvedTransaction.meta ?? {}), ...latestMeta } as any;
  }

  const initialScore =
    typeof latestAlert?.payload === "object" && latestAlert?.payload !== null
      ? (latestAlert?.payload as any)?.score
      : undefined;
  const initialRuleHits =
    typeof latestAlert?.payload === "object" && latestAlert?.payload !== null
      ? ((latestAlert?.payload as any)?.rule_hits ?? [])
      : [];
  const initialSnippets =
    typeof latestAlert?.payload === "object" && latestAlert?.payload !== null
      ? ((latestAlert?.payload as any)?.regulatory_snippets ?? [])
      : [];

  return (
    <div className="min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      <div className="fixed inset-y-0 left-0 z-40 w-64 bg-background">
        <JbSidebar />
      </div>

      <div className="ml-64 flex min-h-screen flex-col">
        <JbTopbar />
        <main className="flex flex-col gap-6 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="gap-2 px-0 text-muted-foreground hover:text-foreground"
              >
                <Link href="/transactions">
                  <ArrowLeft className="h-4 w-4" />
                  Back to monitoring feed
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  Transaction {formatTxnId(transactionId)}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Drill-down analysis with full Sentinel agent reasoning.
                </p>
              </div>
            </div>
          </div>

          <TransactionDrilldown
            transactionId={transactionId}
            transaction={resolvedTransaction}
            initial={{
              score: typeof initialScore === "number" ? initialScore : null,
              severity: (latestAlert?.severity as any) ?? null,
              ruleHits: Array.isArray(initialRuleHits) ? initialRuleHits : [],
              regulatorySnippets: Array.isArray(initialSnippets) ? initialSnippets : [],
            }}
            autoRun={false}
          />
        </main>
      </div>
    </div>
  );
}
