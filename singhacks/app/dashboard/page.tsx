// app/dashboard/page.tsx
"use client";

import { JbSidebar } from "@/components/ui/jb-sidebar"; // from earlier message
import { JbTopbar } from "@/components/ui/jb-topbar";   // from earlier message
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  FileText,
} from "lucide-react";

const alerts = [
  {
    id: "ALRT-9821",
    counterparty: "Western Union",
    amount: "€10,000",
    risk: "High",
    type: "Sanctions (post)",
    time: "2m ago",
  },
  {
    id: "ALRT-9820",
    counterparty: "Bank of America",
    amount: "€100,000",
    risk: "Medium",
    type: "Adverse media",
    time: "8m ago",
  },
  {
    id: "ALRT-9819",
    counterparty: "Crypto Holdings Ltd",
    amount: "€500,000",
    risk: "Critical",
    type: "Large txn + high-risk BIN",
    time: "12m ago",
  },
  {
    id: "ALRT-9818",
    counterparty: "Jack Jones",
    amount: "€2,000",
    risk: "Low",
    type: "Name match (fuzzy)",
    time: "20m ago",
  },
];

export default function DashboardPage() {
  return (
    <TooltipProvider delayDuration={80}>
      <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
        {/* left rail */}
        <JbSidebar />

        {/* main column */}
        <div className="flex min-h-screen flex-1 flex-col">
          <JbTopbar />

          <main className="flex-1 space-y-6 p-6">
            {/* top: title + actions */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                  AML / TM Cockpit
                </h1>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Export daily report
                </Button>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid gap-4 md:grid-cols-4">
              <KpiCard
                label="Open alerts"
                value="128"
                chip="+14 today"
                tone="red"
                desc="Need analyst attention"
              />
              <KpiCard
                label="In investigation"
                value="43"
                chip="SLA 3h"
                tone="amber"
                desc="Ops AML team"
              />
              <KpiCard
                label="Cleared (24h)"
                value="302"
                chip="+12%"
                tone="green"
                desc="Auto- + manual-clear"
              />
              <KpiCard
                label="False positives"
                value="18%"
                chip="↓ 3%"
                desc="After rules tuning"
              />
            </div>

            {/* middle row: alert summary + transaction alerts */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* alert summary */}
              <Card className="lg:col-span-1 bg-white/70 dark:bg-slate-900/40">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Alert summary</CardTitle>
                    <CardDescription>By severity and source</CardDescription>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Live
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SeverityRow label="Critical" count={3} total={10} color="bg-rose-500" />
                  <SeverityRow label="High" count={12} total={40} color="bg-orange-400" />
                  <SeverityRow label="Medium" count={28} total={60} color="bg-amber-300" />
                  <SeverityRow label="Low" count={85} total={120} color="bg-emerald-400" />

                  <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground dark:bg-slate-900/40">
                    Tip: critical + high get auto-routed to JB-SG-AML queue. Change in{" "}
                    <button className="underline underline-offset-2">Rules &gt; Routing</button>.
                  </div>
                </CardContent>
              </Card>

              {/* transaction alerts table */}
              <Card className="lg:col-span-2 bg-white/70 dark:bg-slate-900/40">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>Transaction Alerts</CardTitle>
                    <CardDescription>
                      High-signal events from TM engine (live + post)
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.location.href = '/transactions'}
                    >
                      View all
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-[100px,1fr,110px,110px,120px] gap-2 rounded-md bg-muted/60 px-3 py-2 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground dark:bg-slate-900/50">
                    <span>ID</span>
                    <span>Counterparty</span>
                    <span>Amount</span>
                    <span>Risk</span>
                    <span className="text-right">Action</span>
                  </div>
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          "group grid grid-cols-[100px,1fr,110px,110px,120px] items-center gap-2 rounded-md bg-white/30 px-3 py-2 text-sm transition hover:bg-white/80 dark:bg-slate-950/30 dark:hover:bg-slate-900/80",
                          getAlertBorder(alert.risk)
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{alert.id}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertCircle className="h-4 w-4 text-slate-400 hover:text-slate-700 dark:text-slate-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{alert.type}</p>
                              <p className="text-[0.65rem] text-slate-200">Raised {alert.time}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <div>
                          <p className="font-medium">{alert.counterparty}</p>
                          <p className="text-xs text-muted-foreground">{alert.type}</p>
                        </div>
                        <p className="text-sm">{alert.amount}</p>
                        <div>
                          <RiskPill risk={alert.risk} />
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                            Report
                          </Button>
                          <Button
                            size="sm"
                            variant={alert.risk === "Critical" ? "destructive" : "secondary"}
                            className="h-7 px-2 text-xs"
                          >
                            Escalate
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* bottom: activity + compliance notes */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 bg-white/70 dark:bg-slate-900/40">
                <CardHeader>
                  <CardTitle>Recent analyst activity</CardTitle>
                  <CardDescription>What your team touched in the last hour</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <TimelineItem
                    title="ALRT-9819 moved to Level 2 review"
                    meta="by Tan Wei Ling · 3m ago"
                    icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
                  />
                  <TimelineItem
                    title="Rule ‘UAE-High-Txn’ updated threshold = 75,000"
                    meta="by Sairam · 10m ago"
                    icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
                  />
                  <TimelineItem
                    title="Report generated for ‘Crypto Holdings Ltd’"
                    meta="by System · 12m ago"
                    icon={<FileText className="h-4 w-4 text-sky-400" />}
                  />
                </CardContent>
              </Card>

              <Card className="bg-white/70 dark:bg-slate-900/40">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Compliance notes</CardTitle>
                    <CardDescription>Shared with regional team</CardDescription>
                  </div>
                  <Badge variant="secondary">3 unread</Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-500/10 dark:text-amber-100">
                    Update risk factors for PEP hits in HK + SG.
                  </div>
                  <div className="rounded-lg bg-slate-100 p-3 text-slate-700 dark:bg-slate-800/30 dark:text-slate-100">
                    JB Zurich requests consolidated TM + EDD feed for Q4.
                  </div>
                  <div className="rounded-lg bg-rose-50 p-3 text-rose-700 dark:bg-rose-700/20 dark:text-rose-50">
                    Don’t bulk-clear alerts w/o Sanctions data attached.
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function KpiCard({
  label,
  value,
  chip,
  desc,
  tone,
}: {
  label: string;
  value: string;
  chip?: string;
  desc?: string;
  tone?: "red" | "amber" | "green";
}) {
  return (
    <Card className="bg-white/70 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md dark:bg-slate-900/40">
      <CardHeader className="space-y-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{desc}</p>
        {chip ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-medium",
              tone === "red" && "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-50",
              tone === "amber" &&
                "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-50",
              tone === "green" &&
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-50",
              !tone && "bg-slate-100 text-slate-700 dark:bg-slate-700/30 dark:text-slate-50"
            )}
          >
            <ArrowUpRight className="h-3 w-3" />
            {chip}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SeverityRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((count / total) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">
          {count} / {total}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted/60 dark:bg-slate-900/50">
        <div className={cn("h-2 rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RiskPill({ risk }: { risk: string }) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border";
  if (risk === "Critical")
    return (
      <span className={cn(base, "border-rose-300 bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-50")}>
        <AlertTriangle className="h-3 w-3" />
        {risk}
      </span>
    );
  if (risk === "High")
    return (
      <span className={cn(base, "border-orange-300 bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-50")}>
        {risk}
      </span>
    );
  if (risk === "Medium")
    return (
      <span className={cn(base, "border-amber-200 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-50")}>
        {risk}
      </span>
    );
  return (
    <span className={cn(base, "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-50")}>
      {risk}
    </span>
  );
}

function getAlertBorder(risk: string) {
  if (risk === "Critical") return "border border-rose-200/70 dark:border-rose-400/30";
  if (risk === "High") return "border border-orange-200/70 dark:border-orange-400/30";
  if (risk === "Medium") return "border border-amber-200/70 dark:border-amber-400/30";
  return "border border-transparent";
}

function TimelineItem({
  title,
  meta,
  icon,
}: {
  title: string;
  meta: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 dark:bg-slate-950/30">
      <div className="mt-0.5 rounded-full bg-white/80 p-2 shadow-sm dark:bg-slate-900/60">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}