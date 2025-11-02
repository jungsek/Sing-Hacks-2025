"use client";

import { useEffect, useMemo } from "react";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTransactionAgentStream } from "@/components/transactions/use-transaction-agent-stream";
import type { TransactionRecord } from "@/lib/supabase/dao/transactions";
import type { RuleHit, RegulatorySnippet } from "@/app/langgraph/common/state";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";

const formatBoolean = (value: unknown): string | undefined => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  return undefined;
};

const formatDateTime = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number")
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.trim().length > 0 ? value : "-";
  return String(value);
};

const severityBadgeVariant = (
  severity: string | null,
): "default" | "secondary" | "destructive" | "outline" => {
  switch ((severity ?? "").toLowerCase()) {
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
};

const snippetBadgeVariant = (
  level: "info" | "success" | "warning" | "error" | undefined,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (level) {
    case "success":
      return "secondary";
    case "warning":
      return "secondary";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
};

type TransactionDrilldownProps = {
  transactionId: string;
  transaction: TransactionRecord;
  initial?: {
    score?: number | null;
    severity?: "low" | "medium" | "high" | null;
    ruleHits?: RuleHit[];
    regulatorySnippets?: RegulatorySnippet[];
    analysisOrigin?: string | null;
    analysisModel?: string | null;
  };
  autoRun?: boolean;
};

export function TransactionDrilldown({
  transactionId,
  transaction,
  initial,
  autoRun = true,
}: TransactionDrilldownProps) {
  const meta = ((transaction.meta ?? {}) as Record<string, unknown>) ?? {};
  const amount =
    typeof transaction.amount === "number"
      ? transaction.amount
      : typeof meta.amount === "number"
        ? (meta.amount as number)
        : Number(meta.amount);
  const amountDisplay = Number.isFinite(amount) ? amount.toLocaleString() : undefined;
  const currency =
    typeof transaction.currency === "string"
      ? transaction.currency
      : typeof meta.currency === "string"
        ? meta.currency
        : undefined;

  const {
    runAgent,
    status,
    reasoning,
    tasks,
    ruleHits,
    regulatorySnippets,
    score,
    severity,
    regulatoryProposals,
    regulatoryVersions,
    analysisOrigin,
    analysisModel,
    durationMs,
    error,
    isStreaming,
  } = useTransactionAgentStream(transactionId);

  useEffect(() => {
    if (autoRun) runAgent();
  }, [runAgent, autoRun]);

  const reasoningText = useMemo(() => {
    if (reasoning.length > 0) return reasoning.join("\n\n");
    return isStreaming
      ? "Analyzing this transaction in real time..."
      : "Run the agent to review its rationale.";
  }, [reasoning, isStreaming]);

  const durationSeconds = useMemo(
    () => (typeof durationMs === "number" ? Math.max(1, Math.round(durationMs / 1000)) : undefined),
    [durationMs],
  );

  const effectiveScore =
    typeof score === "number" ? score : typeof initial?.score === "number" ? initial.score : null;
  const effectiveSeverity = severity ?? initial?.severity ?? null;
  const scorePercent = typeof effectiveScore === "number" ? Math.round(effectiveScore * 100) : null;

  const infoItems: Array<{ label: string; value: string }> = [
    {
      label: "Customer ID",
      value: typeof transaction.customer_id === "string" ? transaction.customer_id : "-",
    },
    { label: "Booking jurisdiction", value: formatValue(meta.booking_jurisdiction) },
    { label: "Regulator", value: formatValue(meta.regulator) },
    {
      label: "Booking datetime",
      value: formatDateTime(meta.booking_datetime) ?? formatValue(meta.booking_datetime),
    },
    { label: "Value date", value: formatDateTime(meta.value_date) ?? formatValue(meta.value_date) },
    { label: "Channel", value: formatValue(meta.channel) },
    { label: "Product type", value: formatValue(meta.product_type) },
    { label: "Originator", value: formatValue(meta.originator_name) },
    { label: "Originator country", value: formatValue(meta.originator_country) },
    { label: "Beneficiary", value: formatValue(meta.beneficiary_name) },
    { label: "Beneficiary country", value: formatValue(meta.beneficiary_country) },
    { label: "Customer risk rating", value: formatValue(meta.customer_risk_rating) },
    {
      label: "Customer PEP",
      value: formatBoolean(meta.customer_is_pep) ?? formatValue(meta.customer_is_pep),
    },
    {
      label: "Travel rule complete",
      value: formatBoolean(meta.travel_rule_complete) ?? formatValue(meta.travel_rule_complete),
    },
    { label: "Sanctions screening", value: formatValue(meta.sanctions_screening) },
    {
      label: "KYC last completed",
      value: formatDateTime(meta.kyc_last_completed) ?? formatValue(meta.kyc_last_completed),
    },
    {
      label: "KYC due date",
      value: formatDateTime(meta.kyc_due_date) ?? formatValue(meta.kyc_due_date),
    },
    {
      label: "EDD required",
      value: formatBoolean(meta.edd_required) ?? formatValue(meta.edd_required),
    },
    {
      label: "EDD performed",
      value: formatBoolean(meta.edd_performed) ?? formatValue(meta.edd_performed),
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-border/80">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Transaction snapshot</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Consolidated profile and agent scoring for transaction {transactionId}.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {scorePercent !== null && (
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground">Risk score</span>
            <span
              className={`text-base font-semibold ${
                effectiveSeverity === "high"
                  ? "text-red-600 dark:text-red-400"
                  : effectiveSeverity === "medium"
                    ? "text-amber-600 dark:text-amber-400"
                    : effectiveSeverity === "low"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
              }`}
            >
              {effectiveScore?.toFixed(2)} ({scorePercent}%)
            </span>
          </div>
        )}

        <Badge
              variant={severityBadgeVariant(effectiveSeverity ?? null)}
              className={`capitalize ${
                effectiveSeverity === "high"
                  ? "bg-red-100 text-red-700 border-red-300"
                  : effectiveSeverity === "medium"
                    ? "bg-amber-100 text-amber-700 border-amber-300"
                    : effectiveSeverity === "low"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                      : ""
              }`}
            >
              {effectiveSeverity === "high"
                ? "High Risk"
                : effectiveSeverity === "medium"
                  ? "Moderate Risk"
                  : effectiveSeverity === "low"
                    ? "Low Risk"
                    : "Severity Pending"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <p className="text-xs uppercase text-muted-foreground">Amount</p>
              <p className="text-lg font-semibold text-foreground">
                {amountDisplay ?? "-"} {currency ?? ""}
              </p>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <p className="text-xs uppercase text-muted-foreground">Channel</p>
              <p className="text-lg font-semibold text-foreground">{formatValue(meta.channel)}</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
              <p className="text-xs uppercase text-muted-foreground">Customer risk</p>
              <p
                className={`text-lg font-semibold ${
                  String(meta.customer_risk_rating).toLowerCase().includes("high")
                    ? "text-red-600 dark:text-red-400"
                    : String(meta.customer_risk_rating).toLowerCase().includes("medium")
                      ? "text-amber-600 dark:text-amber-400"
                      : String(meta.customer_risk_rating).toLowerCase().includes("low")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground"
                }`}
              >
                {formatValue(meta.customer_risk_rating)}
              </p>
            </div>
          </div>

          {typeof effectiveScore === "number" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Score progression</span>
                <span>{scorePercent}%</span>
              </div>
              <Progress value={effectiveScore * 100} />
            </div>
          )}

          {(analysisOrigin ||
            analysisModel ||
            initial?.analysisOrigin ||
            initial?.analysisModel) && (
            <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              {(analysisOrigin || initial?.analysisOrigin) && (
                <span className="mr-3">Origin: {analysisOrigin ?? initial?.analysisOrigin}</span>
              )}
              {(analysisModel || initial?.analysisModel) && (
                <span>Model: {analysisModel ?? initial?.analysisModel}</span>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {infoItems.map(({ label, value }) => (
              <div
                key={label}
                className="space-y-1 rounded-md border border-border/30 bg-background/50 p-3"
              >
                <p className="text-xs uppercase text-muted-foreground">{label}</p>
                <p className="text-sm font-medium text-foreground">{value ?? "-"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Agent reasoning</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Live rationale and task milestones from the Sentinel transaction agent.
            </CardDescription>
          </div>
          <Button size="sm" className="gap-2" onClick={runAgent} disabled={status === "running"}>
            {status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === "running" ? "Analyzing" : "Re-run analysis"}
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <Reasoning isStreaming={isStreaming} duration={durationSeconds} defaultOpen>
            <ReasoningTrigger />
            <ReasoningContent>{reasoningText}</ReasoningContent>
          </Reasoning>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {tasks.length > 0 && (
            <div className="space-y-4">
              {tasks.map((task) => (
                <Task key={task.id} defaultOpen={task.status !== "idle"}>
                  <TaskTrigger title={`${task.title}`} />
                  <TaskContent>
                    {task.logs.length === 0 ? (
                      <TaskItem>No activity yet.</TaskItem>
                    ) : (
                      task.logs.map((log) => (
                        <TaskItem
                          key={log.id}
                          className={
                            log.level === "error"
                              ? "text-destructive"
                              : log.level === "success"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : log.level === "warning"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : undefined
                          }
                        >
                          {log.text}
                        </TaskItem>
                      ))
                    )}
                  </TaskContent>
                </Task>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Rule hits</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Weighted LLM findings that contributed to the alert score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ruleHits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isStreaming
                ? "Identifying rule hits..."
                : "No rule hits recorded for this transaction yet."}
            </p>
          ) : (
            <div className="space-y-2">
              {ruleHits.map((hit) => (
                <div
                  key={hit.rule_id + hit.rationale}
                  className="rounded-md border border-border/40 bg-muted/20 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-foreground">{hit.rule_id}</span>
                    <span className="text-xs text-muted-foreground">
                      Weight {hit.weight.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{hit.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Regulatory context</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Snippets, proposals, and version calls surfaced during enrichment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {regulatorySnippets.length === 0 &&
          regulatoryProposals.length === 0 &&
          regulatoryVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {score && score >= 0.65
                ? "Agent did not add regulatory commentary for this run."
                : "Cross-reference runs in the background and appears here when ready."}
            </p>
          ) : null}

          {regulatorySnippets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase text-muted-foreground">Snippets</p>
              <div className="space-y-2">
                {regulatorySnippets.map((snippet, index) => (
                  <div
                    key={`${snippet.rule_id}-${index}`}
                    className="rounded-md border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={snippetBadgeVariant(snippet.level)}>
                        {snippet.level ?? "info"}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">{snippet.rule_id}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{snippet.text}</p>
                    {snippet.source_url && (
                      <a
                        href={snippet.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center text-xs text-primary hover:underline"
                      >
                        View source
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {regulatoryProposals.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase text-muted-foreground">Rule proposals</p>
              <ul className="space-y-2 text-sm">
                {regulatoryProposals.map((proposal) => (
                  <li
                    key={proposal.id}
                    className="rounded-md border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <p className="font-medium text-foreground">
                      {proposal.summary ?? "No summary provided."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {proposal.regulator ?? "Unknown regulator"} - effective{" "}
                      {proposal.effective_date ?? "TBD"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {regulatoryVersions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase text-muted-foreground">Rule versions</p>
              <ul className="space-y-2 text-sm">
                {regulatoryVersions.map((version) => (
                  <li
                    key={version.rule_version_id}
                    className="rounded-md border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <p className="font-medium text-foreground">
                      {version.rule_id ?? "Unknown rule"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status {version.status ?? "pending"} -{" "}
                      {version.regulator ?? "Unknown regulator"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
