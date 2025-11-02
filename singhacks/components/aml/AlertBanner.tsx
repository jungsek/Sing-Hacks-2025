"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, AlertTriangle, Flag, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertSeverity = "low" | "medium" | "high";

export type AlertBannerProps = {
  id: string;
  transactionId: string;
  severity: AlertSeverity;
  score?: number | null;
  topRules?: Array<{ rule_id: string; rationale?: string }>; // concise list
  timestamp?: number; // optional display time
  className?: string;
};

function classificationLabel(severity: AlertSeverity): string {
  switch (severity) {
    case "high":
      return "High Risk";
    case "medium":
      return "Moderate Risk";
    case "low":
    default:
      return "Low Risk";
  }
}

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  if (severity === "high") return <AlertTriangle className="h-4 w-4" />;
  if (severity === "medium") return <Flag className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

export function AlertBanner({
  id,
  transactionId,
  severity,
  score,
  topRules = [],
  timestamp,
  className,
}: AlertBannerProps) {
  const variant = severity === "high" ? "destructive" : "default";
  const accentClass =
    severity === "medium"
      ? "border-amber-500/50 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
      : severity === "low"
        ? "border-emerald-500/50 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400"
        : undefined;

  return (
    <Alert
      variant={variant as any}
      className={cn("flex items-start gap-3", accentClass, className)}
    >
      <SeverityIcon severity={severity} />
      <div className="flex w-full flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <AlertTitle className="flex items-center gap-2">
            <Badge
              variant={
                severity === "high"
                  ? "destructive"
                  : severity === "medium"
                    ? "secondary"
                    : "outline"
              }
              className="capitalize"
            >
              {classificationLabel(severity)}
            </Badge>
            <span className="text-xs font-normal text-muted-foreground">
              Alert {id.slice(0, 8)}...
            </span>
          </AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <div className="text-muted-foreground">
                Txn{" "}
                <span className="font-mono text-foreground">{transactionId.slice(0, 10)}...</span>
              </div>
              {typeof score === "number" && (
                <div>
                  Score <span className="font-semibold text-foreground">{score.toFixed(2)}</span>
                </div>
              )}
              {typeof timestamp === "number" && (
                <div className="text-muted-foreground">
                  {new Date(timestamp).toLocaleTimeString()}
                </div>
              )}
            </div>

            {topRules.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                {topRules.slice(0, 3).map((hit, idx) => (
                  <li key={`${hit.rule_id}-${idx}`}>
                    <span className="font-mono text-foreground">{hit.rule_id}</span>
                    {hit.rationale ? `: ${hit.rationale}` : null}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </div>

        <div className="mt-2 flex shrink-0 items-center gap-2 md:mt-0">
          <Button asChild size="sm" variant="outline" className="gap-1">
            <Link href={`/transactions/${transactionId}`}>
              View details <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </Alert>
  );
}

export default AlertBanner;
