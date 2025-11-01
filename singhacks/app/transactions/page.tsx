"use client";

import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Flag, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const transactions = [
  {
    id: "TXN-923841",
    date: "2025-10-31",
    customer: "John Tan",
    amount: "$14,000",
    currency: "SGD",
    status: "flagged",
    risk: "High",
    reason: "Transaction exceeds typical threshold for customer profile",
  },
  {
    id: "TXN-923842",
    date: "2025-10-29",
    customer: "Ahmad Bin Zaki",
    amount: "$450",
    currency: "SGD",
    status: "reviewed",
    risk: "Low",
    reason: "Verified recurring payment to same beneficiary",
  },
  {
    id: "TXN-923843",
    date: "2025-10-28",
    customer: "Li Wei",
    amount: "$9,800",
    currency: "USD",
    status: "flagged",
    risk: "Medium",
    reason: "Potential structuring behavior (multiple small transfers)",
  },
  {
    id: "TXN-923844",
    date: "2025-10-27",
    customer: "Tan Mei Lin",
    amount: "$220,000",
    currency: "SGD",
    status: "cleared",
    risk: "Low",
    reason: "Corporate FX transaction validated by KYC officer",
  },
];

export default function TransactionsPage() {
  return (
    <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      {/* Sidebar */}
      <JbSidebar />

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        <JbTopbar />

        <main className="flex flex-col gap-8 p-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Transaction Monitoring
              </h1>
              <p className="text-muted-foreground">
                Real-time flagged transactions and rule-based monitoring insights.
              </p>
            </div>
          </div>

          {/* Transaction Table */}
          <Card className="shadow-md border-border/70 bg-background/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Transaction Monitoring Feed
              </CardTitle>
              <CardDescription>
                Showing {transactions.length} recent alerts across AML rules.
              </CardDescription>
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
                        Customer
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
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border/40">
                    {transactions.map((txn) => (
                      <tr
                        key={txn.id}
                        className={cn(
                          "hover:bg-muted/30 transition",
                          txn.status === "flagged" && "bg-red-50 dark:bg-red-950/10"
                        )}
                      >
                        <td className="px-4 py-3 font-medium">{txn.id}</td>
                        <td className="px-4 py-3">{txn.customer}</td>
                        <td className="px-4 py-3">
                          {txn.amount} {txn.currency}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              txn.risk === "High"
                                ? "destructive"
                                : txn.risk === "Medium"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {txn.risk}
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
                        <td className="px-4 py-3 text-muted-foreground">
                          {txn.reason}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-2">
                            <Button variant="outline" size="sm" className="text-xs">
                              View Report
                            </Button>
                            <Button variant="destructive" size="sm" className="text-xs">
                              Escalate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
