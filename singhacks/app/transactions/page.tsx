"use client";

import { useState } from "react";
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

const RAW_TXNS = [
  {
    transaction_id: "ad66338d-b17f-47fc-a966-1b4395351b41",
    booking_jurisdiction: "HK",
    regulator: "HKMA/SFC",
    booking_datetime: "2024-10-10T10:24:43",
    amount: 590012.92,
    currency: "HKD",
    originator_name: "Meredith Krueger",
    originator_country: "AE",
    beneficiary_name: "Natalie Sandoval",
    beneficiary_country: "CN",
    travel_rule_complete: true,
    sanctions_screening: "potential",
    customer_risk_rating: "High",
  },
  {
    transaction_id: "135cef35-c054-46f0-8d8d-daedb7429de4",
    booking_jurisdiction: "SG",
    regulator: "MAS",
    booking_datetime: "2024-02-23T23:56:23",
    amount: 1319007.62,
    currency: "GBP",
    originator_name: "Jennifer Parker",
    beneficiary_name: "George Brown",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Medium",
  },
  {
    transaction_id: "f037efc0-8438-4af3-9f68-959cd9c9dcb2",
    booking_jurisdiction: "CH",
    regulator: "FINMA",
    booking_datetime: "2024-06-26T23:40:37",
    amount: 233935.3,
    currency: "GBP",
    originator_name: "Nicole Guerra DVM",
    beneficiary_name: "Candace Nichols",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Low",
  },
  {
    transaction_id: "f7589c12-dccb-4ae1-8ad3-324db3316a56",
    booking_jurisdiction: "HK",
    regulator: "HKMA/SFC",
    booking_datetime: "2024-05-03T00:08:29",
    amount: 1778002.31,
    currency: "GBP",
    originator_name: "Jeremy Williams",
    beneficiary_name: "Connor Smith",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Medium",
  },
  {
    transaction_id: "e83da102-9121-4a2f-9f80-8fb4c63e4d78",
    booking_jurisdiction: "SG",
    regulator: "MAS",
    booking_datetime: "2024-07-12T09:35:19",
    amount: 540.0,
    currency: "SGD",
    originator_name: "Tan Mei Ling",
    beneficiary_name: "Shopee Pte Ltd",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Low",
  },
  {
    transaction_id: "12c449f2-37ef-4fda-8245-c1eb5cf4c9b0",
    booking_jurisdiction: "SG",
    regulator: "MAS",
    booking_datetime: "2024-08-08T15:02:45",
    amount: 21450.75,
    currency: "SGD",
    originator_name: "Ahmad Bin Zaki",
    beneficiary_name: "DBS Bank Ltd",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Low",
  },
  {
    transaction_id: "a55efc80-c278-4e5a-bc8f-bd9a901e55f1",
    booking_jurisdiction: "JP",
    regulator: "JFSA",
    booking_datetime: "2024-11-15T11:30:00",
    amount: 850000.0,
    currency: "JPY",
    originator_name: "Satoshi Nakamura",
    beneficiary_name: "Miyuki Tanaka",
    travel_rule_complete: false,
    sanctions_screening: "none",
    customer_risk_rating: "Medium",
  },
  {
    transaction_id: "b77cc8e1-48a2-4fa1-88c3-93d17333b24a",
    booking_jurisdiction: "SG",
    regulator: "MAS",
    booking_datetime: "2024-09-22T20:12:01",
    amount: 120.5,
    currency: "SGD",
    originator_name: "John Tan",
    beneficiary_name: "Netflix Singapore",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Low",
  },
  {
    transaction_id: "c55dabc3-1df7-4b0d-9a80-77d3156c199b",
    booking_jurisdiction: "SG",
    regulator: "MAS",
    booking_datetime: "2024-12-25T18:50:40",
    amount: 2000000.0,
    currency: "USD",
    originator_name: "William Chen",
    beneficiary_name: "ABC Trading Co.",
    travel_rule_complete: true,
    sanctions_screening: "potential",
    customer_risk_rating: "High",
  },
  {
    transaction_id: "d99b2b7a-4e91-41e5-8020-ef1c99df785a",
    booking_jurisdiction: "SG",
    regulator: "MAS",
    booking_datetime: "2024-12-28T21:22:10",
    amount: 980.25,
    currency: "SGD",
    originator_name: "Lim Pei Wen",
    beneficiary_name: "Grab Holdings Ltd",
    travel_rule_complete: true,
    sanctions_screening: "none",
    customer_risk_rating: "Low",
  },
];


// 2) Screening logic – you can make this smarter later.
//    This takes a raw row and returns what the table should display.
function screenTransaction(raw: any) {
  // default
  let status: "flagged" | "reviewed" | "cleared" = "cleared";
  let displayRisk = raw.customer_risk_rating || "Low";
  let reason = "Transaction consistent with customer profile";

  // rule 1: very high amount
  if (raw.amount > 1_000_000) {
    status = "flagged";
    displayRisk = "High";
    reason = "High-value transaction above threshold";
  }

  // rule 2: sanctions screening potential
  if (raw.sanctions_screening === "potential") {
    status = "flagged";
    displayRisk = "High";
    reason = "Sanctions / watchlist hit (potential)";
  }

  // rule 3: missing travel rule
  if (raw.travel_rule_complete === false) {
    status = "reviewed";
    displayRisk = displayRisk === "High" ? "High" : "Medium";
    reason = "Travel rule incomplete – requires review";
  }

  return {
    transaction_id: raw.transaction_id,
    booking_jurisdiction: raw.booking_jurisdiction,
    regulator: raw.regulator,
    amount: raw.amount,
    currency: raw.currency,
    originator_name: raw.originator_name,
    beneficiary_name: raw.beneficiary_name,
    customer_risk_rating: displayRisk,
    status,
    reason,
  };
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  const handleRunScreening = () => {
    if (isStreaming) return;
    setIsStreaming(true);
    setTransactions([]);
    setScannedCount(0);

    RAW_TXNS.forEach((raw, index) => {
      setTimeout(() => {
        const screened = screenTransaction(raw);
        setTransactions((prev) => [screened, ...prev]);
        setScannedCount((c) => c + 1);

        if (index === RAW_TXNS.length - 1) {
          setIsStreaming(false);
        }
      }, (index + 1) * 1200);
    });
  };

  return (
    <div className="min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      {/* 1) FIXED SIDEBAR */}
      <div className="fixed inset-y-0 left-0 w-64 z-40 bg-background">
        <JbSidebar />
      </div>

      {/* 2) MAIN CONTENT SHIFTED RIGHT */}
      <div className="ml-64 flex flex-col min-h-screen">
        <JbTopbar />

        <main className="flex flex-col gap-8 p-8">
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

          <Card className="shadow-md border-border/70 bg-background/80 backdrop-blur">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-semibold">
                    Transaction Monitoring Feed
                  </CardTitle>
                  <CardDescription>
                    {isStreaming
                      ? `Screening ${scannedCount}/${RAW_TXNS.length} incoming transactions…`
                      : `Showing ${transactions.length} screened transactions.`}
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  className="gap-1"
                  onClick={handleRunScreening}
                  disabled={isStreaming}
                >
                  {isStreaming ? "Running..." : "Run screening"}
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
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border/40">
                    {transactions.map((txn) => (
                      <tr
                        key={txn.transaction_id}
                        className={cn(
                          "hover:bg-muted/30 transition",
                          txn.customer_risk_rating === "High" &&
                            "bg-red-50 dark:bg-red-950/10",
                          txn.customer_risk_rating === "Medium" &&
                            "bg-amber-50 dark:bg-amber-950/10",
                          txn.customer_risk_rating === "Low" &&
                            "bg-green-50/40 dark:bg-green-950/10"
                        )}
                      >
                        <td className="px-4 py-3 font-medium">
                          {txn.transaction_id.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3">{txn.booking_jurisdiction}</td>
                        <td className="px-4 py-3">{txn.regulator}</td>
                        <td className="px-4 py-3">{txn.originator_name}</td>
                        <td className="px-4 py-3">{txn.beneficiary_name}</td>
                        <td className="px-4 py-3">
                          {txn.amount.toLocaleString()} {txn.currency}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              txn.customer_risk_rating === "High" &&
                                "bg-red-500/10 text-red-600 border-red-500/20",
                              txn.customer_risk_rating === "Medium" &&
                                "bg-amber-500/10 text-amber-600 border-amber-500/20",
                              txn.customer_risk_rating === "Low" &&
                                "bg-green-500/10 text-green-600 border-green-500/20"
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
                        <td className="px-4 py-3 text-muted-foreground">
                          {txn.reason}
                        </td>
                      </tr>
                    ))}

                    {isStreaming && (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-3 text-xs text-muted-foreground italic"
                        >
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
    </div>
  );
}
