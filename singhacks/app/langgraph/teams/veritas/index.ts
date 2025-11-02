import type { GraphEvent } from "@/app/langgraph/common/events";
import { chunkText, estimateTokens, parseDocumentBuffer } from "@/app/langgraph/tools/llamaparse";

export type VeritasState = {
  document_id: string;
  text?: string;
  chunks?: Array<{ id: string; text: string }>;
  format_findings?: { issues: any[]; metrics: Record<string, any> };
  image_findings?: { files: any[]; summary: string };
  risk?: { score: number; level: "Low" | "Medium" | "High" | "Critical" };
  report?: { markdown: string; json: any };
};

export type VeritasContext = {
  runId: string;
  graph: string; // "veritas"
  write: (event: GraphEvent) => Promise<void>;
};

function evt(
  type: GraphEvent["type"],
  graph: string,
  run_id: string,
  node?: string,
  data?: any,
): GraphEvent {
  return {
    type,
    payload: { run_id, graph, node, ts: Date.now(), data },
  };
}

export async function runVeritas(
  buffer: Buffer,
  ctx: VeritasContext,
  documentId: string,
): Promise<VeritasState> {
  const { runId, graph, write } = ctx;
  const state: VeritasState = { document_id: documentId };

  // Node: doc-processing
  await write(evt("on_node_start", graph, runId, "doc-processing", { document_id: documentId }));
  const parsed = await parseDocumentBuffer(buffer);
  await write(
    evt("on_tool_call", graph, runId, "doc-processing", {
      tool: "pdf-parse",
      pages: parsed.pages,
    }),
  );
  const chunks = chunkText(parsed.text);
  state.text = parsed.text;
  state.chunks = chunks.map((t, i) => ({ id: `${documentId}-${i + 1}`, text: t }));
  await write(
    evt("on_node_end", graph, runId, "doc-processing", {
      text_stats: {
        tokens: estimateTokens(parsed.text),
        pages: parsed.pages,
        chunks: chunks.length,
      },
    }),
  );

  // Node: format-validator (very light heuristics for MVP)
  await write(evt("on_node_start", graph, runId, "format-validator"));
  const issues: any[] = [];
  const metrics: Record<string, any> = {};
  const lines = parsed.text.split(/\n+/);
  metrics.line_count = lines.length;
  const excessiveCaps = lines.filter((l) => l.trim().length > 12 && l === l.toUpperCase()).length;
  if (excessiveCaps > 3)
    issues.push({ id: "fmt-caps", severity: "warn", message: "Excessive capitalization detected" });
  await write(
    evt("on_tool_call", graph, runId, "format-validator", {
      checks: ["caps", "line_count"],
      count: issues.length,
    }),
  );
  state.format_findings = { issues, metrics };
  await write(
    evt("on_node_end", graph, runId, "format-validator", { issues_count: issues.length }),
  );

  // Node: image-forensics (placeholder without heavy deps)
  await write(evt("on_node_start", graph, runId, "image-forensics"));
  const image_findings = { files: [], summary: "No embedded images analyzed in MVP." };
  state.image_findings = image_findings as any;
  await write(evt("on_node_end", graph, runId, "image-forensics", { images: 0 }));

  // Node: risk-assessment
  await write(evt("on_node_start", graph, runId, "risk-assessment"));
  const penalty = Math.min(20, (issues.length || 0) * 5);
  const score = 40 + penalty; // simple heuristic for demo
  type RiskLevel = "Low" | "Medium" | "High" | "Critical";
  let level: RiskLevel = "Low";
  if (score >= 85) level = "Critical";
  else if (score >= 60) level = "High";
  else if (score >= 30) level = "Medium";
  state.risk = { score, level };

  const report = {
    markdown: `# Document Risk Report\n\n## Summary\n- Format issues: ${issues.length}\n- Image analysis: minimal\n\n## Risk\n- Score: ${score}\n- Level: ${level}`,
    json: {
      findings: { format: issues, image: image_findings },
      risk: state.risk,
    },
  };
  state.report = report;
  await write(
    evt("on_artifact", graph, runId, "risk-assessment", {
      type: "veritas_report",
      document_id: documentId,
      risk: state.risk,
      markdown: report.markdown,
      json: report.json,
    }),
  );
  await write(evt("on_node_end", graph, runId, "risk-assessment", { score, level }));

  return state;
}
