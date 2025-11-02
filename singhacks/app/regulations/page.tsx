"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Loader2, RefreshCcw, ChevronsUpDown } from "lucide-react";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Task, TaskTrigger, TaskContent, TaskItem } from "@/components/ai-elements/task";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  useRegulationAgentStream,
  type AgentTask,
} from "@/components/regulations/use-regulation-agent-stream";

type RegulatorySnippet = {
  rule_id?: string;
  text: string;
  source_url?: string;
  level?: "info" | "success" | "warning" | "error";
};

// Supabase table regulatory_sources simplified view
type RegulatorySource = {
  id?: string | null;
  regulator_name: string;
  title: string;
  description?: string | null;
  policy_url: string;
  regulatory_document_file?: string | null;
  published_date?: string | null;
  last_updated_date?: string | null;
};

function formatDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Expand/collapse state for a single card
function useExpanded() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);
  return { expandedId, toggle } as const;
}

function snippetBadgeVariant(level?: RegulatorySnippet["level"]) {
  switch (level) {
    case "success":
      return "secondary" as const;
    case "warning":
      return "secondary" as const;
    case "error":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

// No status variants for simplified source cards

export default function RegulatorySourcesPage() {
  const isMountedRef = useRef(true);
  const [sources, setSources] = useState<RegulatorySource[]>([]);
  // Start not-loading; user triggers loading explicitly
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  // Show the agent panel only after user clicks "Update Regulations"
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const { expandedId, toggle } = useExpanded();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [idByUrl, setIdByUrl] = useState<Map<string, string>>(new Map());

  const {
    runAgent,
    status: agentStatus,
    runId,
    tasks,
    reasoning,
    snippets: agentSnippets,
    summary: agentSummary,
    error: agentError,
  } = useRegulationAgentStream();

  const isStreaming = agentStatus === "running";
  const hasCompleted = agentStatus === "success";
  const reasoningText =
    reasoning.length > 0
      ? reasoning.join("\n\n")
      : isStreaming
        ? "Gathering regulatory insights..."
        : "Run the regulatory agent to view its reasoning.";
  const durationSeconds =
    agentSummary && agentSummary.durationMs > 0
      ? Math.max(1, Math.round(agentSummary.durationMs / 1000))
      : undefined;
  const errorMessage =
    [error, agentError].filter((msg): msg is string => Boolean(msg)).join(" ") || null;

  // Control visibility (open/closed) of the findings section; open while streaming, close after
  const [findingsOpen, setFindingsOpen] = useState(false);
  useEffect(() => {
    // Open during streaming; collapse once completed
    setFindingsOpen(isStreaming);
  }, [isStreaming, runId]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: srcError } = await supabase
        .from("regulatory_sources")
        .select(
          "id, regulator_name, title, description, policy_url, regulatory_document_file, published_date, last_updated_date",
        )
        .order("last_updated_date", { ascending: false })
        .limit(50);

      if (srcError) throw srcError;
      const list = Array.isArray(data) ? (data as RegulatorySource[]) : [];

      if (!isMountedRef.current) return;
      setSources(list);
      // Compute the most recent timestamp from rows; fall back to now
      const latest = list.reduce<string | null>((acc, cur) => {
        const candidate = cur.last_updated_date || cur.published_date || null;
        if (!candidate) return acc;
        if (!acc) return candidate;
        return new Date(candidate).getTime() > new Date(acc).getTime() ? candidate : acc;
      }, null);
      setLastUpdatedAt(latest ?? new Date().toISOString());
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : "Unable to load regulatory sources.";
      setError(message);
      setSources([]);
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, []);

  // Auto-load persisted sources on mount so users see data immediately
  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  // Refresh when window regains focus, unless the agent is currently streaming
  useEffect(() => {
    const onFocus = () => {
      if (!isStreaming) void fetchEntries();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isStreaming, fetchEntries]);

  // When runId changes (first status event), show the new run ID
  useEffect(() => {
    if (runId) setLastRunId(runId);
  }, [runId]);

  // After a successful run, refresh the Supabase-backed sources
  useEffect(() => {
    if (agentStatus === "success") {
      fetchEntries();
    }
  }, [agentStatus, fetchEntries]);

  // Maintain a mapping from policy_url to the rendered card id for quick open
  useEffect(() => {
    const map = new Map<string, string>();
    sources.forEach((src, index) => {
      if (src.policy_url) {
        map.set(src.policy_url, String(src.id ?? `src-${index}`));
      }
    });
    setIdByUrl(map);
  }, [sources]);

  const handleOpenSnippetSource = useCallback(
    (url?: string) => {
      if (!url) return;
      const id = idByUrl.get(url);
      const el = cardRefs.current.get(url);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (id) toggle(id);
    },
    [idByUrl, toggle],
  );

  const handleUpdateRegulations = useCallback(async () => {
    setError(null);
    setShowAgentPanel(true);
    // Optionally provide regulator filters here
    await runAgent({ regulators: ["MAS", "HKMA", "FINMA"] });
  }, [runAgent]);

  return (
    <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      <JbSidebar />

      <div className="flex flex-1 flex-col">
        <JbTopbar />

        <main className="flex-1 space-y-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Regulatory Knowledge Base
              </h1>
              <p className="text-sm text-muted-foreground">
                Latest compliance artefacts discovered by the Sentinel regulatory agent.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {lastRunId && <span>Last agent run: {lastRunId}</span>}
                {lastUpdatedAt && <span>Data refreshed {formatDate(lastUpdatedAt)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-2"
                onClick={handleUpdateRegulations}
                disabled={isStreaming}
              >
                {isStreaming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" />
                    Update Regulations
                  </>
                )}
              </Button>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {/* Unified Agent Panel (appears only after clicking Update Regulations) */}
          {showAgentPanel && (
            <Card className="border-border/80 bg-white/80 dark:bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Regulatory agent run</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Live reasoning and task progress during the update process.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  {/* Remount on status change so defaultOpen applies when run completes */}
                  <Reasoning
                    key={`${runId ?? "no-run"}-${agentStatus}`}
                    isStreaming={isStreaming}
                    duration={durationSeconds}
                    defaultOpen={!hasCompleted}
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>{reasoningText}</ReasoningContent>
                  </Reasoning>
                </div>
                {tasks.length > 0 && (
                  <div className="space-y-4">
                    {tasks.map((task: AgentTask) => (
                      // Remount per status so defaultOpen reflects streaming/completed
                      <Task key={`${task.id}-${agentStatus}`} defaultOpen={isStreaming}>
                        <TaskTrigger title={task.title} />
                        <TaskContent>
                          {task.logs.length === 0 ? (
                            <TaskItem>No activity yet.</TaskItem>
                          ) : (
                            task.logs.map((log) => <TaskItem key={log.id}>{log.text}</TaskItem>)
                          )}
                        </TaskContent>
                      </Task>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Snippets (findings) come first */}
          {agentSnippets.length > 0 && (
            <Collapsible open={findingsOpen} onOpenChange={setFindingsOpen}>
              <Card className="border-border/80 bg-white/80 dark:bg-slate-900/50">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">Agent findings</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Highlights from the most recent regulatory run.
                    </CardDescription>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                      {findingsOpen ? "Collapse" : "Expand"}
                      <ChevronsUpDown className="ml-1 h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {agentSnippets.map((snippet, index) => (
                        <li
                          key={`${snippet.rule_id ?? "snippet"}-${index}`}
                          className="flex flex-col gap-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={snippetBadgeVariant(snippet.level)}>
                              {snippet.level ?? "info"}
                            </Badge>
                            <span className="font-medium text-foreground">{snippet.rule_id}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{snippet.text}</p>
                          {snippet.source_url && (
                            <div className="flex items-center gap-3">
                              <Button
                                variant="link"
                                size="sm"
                                className="gap-1 self-start text-xs text-blue-600"
                                onClick={() => window.open(snippet.source_url!, "_blank")}
                              >
                                View context
                                <ArrowUpRight className="h-3 w-3" />
                              </Button>
                              {idByUrl.has(snippet.source_url) && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="gap-1 self-start text-xs text-blue-600"
                                  onClick={() => handleOpenSnippetSource(snippet.source_url)}
                                >
                                  Open source card
                                </Button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {loading && sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading regulatory data...</p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No regulatory documents have been ingested yet. Run the agent to pull the latest
              guidance.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sources.map((src, index) => (
                <Card
                  key={src.id ?? `src-${index}`}
                  className="border-border/80 bg-white/80 shadow-sm transition hover:shadow-md dark:bg-slate-900/50"
                  ref={(el) => {
                    if (src.policy_url) {
                      if (el) cardRefs.current.set(src.policy_url, el);
                      else cardRefs.current.delete(src.policy_url);
                    }
                  }}
                >
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-xs uppercase tracking-wide">
                          {src.regulator_name || "Unknown Regulator"}
                        </Badge>
                        <CardTitle className="text-base font-semibold leading-tight">
                          {src.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          {src.published_date && (
                            <span>Published {formatDate(src.published_date)}</span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-xs"
                        onClick={() => toggle(String(src.id ?? `src-${index}`))}
                      >
                        {expandedId === String(src.id ?? `src-${index}`) ? "Hide" : "Details"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <p className="line-clamp-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {src.description || "No description available."}
                    </p>
                    {expandedId === String(src.id ?? `src-${index}`) && (
                      <div className="space-y-3 pt-1">
                        <div className="text-xs text-muted-foreground">
                          {src.last_updated_date && (
                            <span>Last updated {formatDate(src.last_updated_date)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2"></div>
                          <div className="flex items-center gap-3">
                            {src.regulatory_document_file && (
                              <Button
                                variant="link"
                                size="sm"
                                className="gap-1 text-sm text-blue-600"
                                onClick={() => window.open(src.regulatory_document_file!, "_blank")}
                              >
                                View document
                                <ArrowUpRight className="h-3 w-3" />
                              </Button>
                            )}
                            {src.policy_url && (
                              <Button
                                variant="link"
                                size="sm"
                                className="gap-1 text-sm text-blue-600"
                                onClick={() => window.open(src.policy_url, "_blank")}
                              >
                                View source
                                <ArrowUpRight className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
