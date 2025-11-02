import { NextRequest } from "next/server";
import { createSSEController } from "@/app/langgraph/common/stream";
import type { GraphEvent } from "@/app/langgraph/common/events";
import { logAgentRun } from "@/lib/supabase/dao/agentRuns";
import { createClient as createSb } from "@supabase/supabase-js";

export const runtime = "nodejs";

function evt(
  type: GraphEvent["type"],
  graph: string,
  run_id: string,
  node?: string,
  data?: any,
): GraphEvent {
  return {
    type,
    payload: {
      run_id,
      graph,
      node,
      ts: Date.now(),
      data,
    },
  };
}

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const case_id = searchParams.get("case_id") || "unknown";
  const document_id = searchParams.get("document_id") || undefined;
  const run_id = `${case_id}-${Date.now()}`;
  const graph = "veritas";

  const sse = createSSEController();

  (async () => {
    try {
      // Mark case as processing
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (url && key && case_id && case_id !== "unknown") {
          const sb = createSb(url, key);
          await sb.from("aml_cases").update({ status: "processing" }).eq("id", case_id);
        }
      } catch {}

      // Start: doc-processing
      const start1 = evt("on_node_start", graph, run_id, "doc-processing", {
        case_id,
        document_id,
      });
      await sse.write(start1);
      await logAgentRun({
        run_id,
        graph,
        node: "doc-processing",
        status: "start",
        payload: start1.payload,
      });
      await sleep(400);
      // tool call parse
      const tool1 = evt("on_tool_call", graph, run_id, "doc-processing", {
        tool: "parse",
        provider: "fallback-pdf-parse",
      });
      await sse.write(tool1);
      await sleep(300);
      const end1 = evt("on_node_end", graph, run_id, "doc-processing", {
        text_stats: { tokens: 1800, pages: 6 },
      });
      await sse.write(end1);
      await logAgentRun({
        run_id,
        graph,
        node: "doc-processing",
        status: "end",
        payload: end1.payload,
      });

      // Parallel: format-validator and image-forensics (sequentially simulated)
      const start2 = evt("on_node_start", graph, run_id, "format-validator");
      await sse.write(start2);
      await sleep(300);
      const tool2 = evt("on_tool_call", graph, run_id, "format-validator", {
        checks: ["headers", "spacing", "dates"],
      });
      await sse.write(tool2);
      await sleep(300);
      const end2 = evt("on_node_end", graph, run_id, "format-validator", {
        issues: [
          { id: "fmt-001", severity: "warn", message: "Inconsistent line spacing detected." },
        ],
      });
      await sse.write(end2);

      const start3 = evt("on_node_start", graph, run_id, "image-forensics");
      await sse.write(start3);
      await sleep(300);
      const tool3 = evt("on_tool_call", graph, run_id, "image-forensics", { tool: "exif" });
      await sse.write(tool3);
      await sleep(300);
      const end3 = evt("on_node_end", graph, run_id, "image-forensics", {
        images: [{ file: "scan1.jpg", exif: { camera: null }, ela: { score: 0.12 } }],
      });
      await sse.write(end3);

      // Risk assessment
      const start4 = evt("on_node_start", graph, run_id, "risk-assessment");
      await sse.write(start4);
      await sleep(400);

      const report = {
        type: "veritas_report",
        case_id,
        document_id,
        risk: { score: 48, level: "Medium" },
        markdown: `# Document Risk Report\n\n## Summary\n- Basic formatting warnings\n- Minor image metadata gaps\n\n## Findings\n- Inconsistent line spacing in sections 2–3.\n- Image scan lacks EXIF camera model (expected for some scanners).\n\n## Recommendations\n- Request original PDF export when possible.\n- Confirm image provenance with submitter.`,
        json: {
          summary: "Formatting warnings and minor image metadata gaps",
          findings: {
            format: [{ id: "fmt-001", severity: "warn", message: "Inconsistent line spacing" }],
            image: [{ file: "scan1.jpg", exif_missing: true }],
          },
          recommendations: ["Request original PDF export", "Confirm image provenance"],
        },
      };

      const artifact = evt("on_artifact", graph, run_id, "risk-assessment", report);
      await sse.write(artifact);
      // Try SSR log (may be limited by RLS)
      try {
        await logAgentRun({
          run_id,
          graph,
          node: "risk-assessment",
          status: "artifact",
          payload: artifact.payload,
        });
      } catch {}
      // Ensure persistence with service role for demo reliability
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (url && key) {
          const sb = createSb(url, key);
          await sb.from("agent_runs").insert({
            run_id,
            graph,
            node: "risk-assessment",
            status: "artifact",
            payload: artifact.payload,
          });
          // Mark case as complete
          if (case_id && case_id !== "unknown") {
            await sb.from("aml_cases").update({ status: "complete" }).eq("id", case_id);
          }
        }
      } catch {}
    } catch (error) {
      const errEvt = evt("on_error", graph, run_id, undefined, {
        message: (error as any)?.message || String(error),
      });
      await sse.write(errEvt);
    } finally {
      await sse.close();
    }
  })();

  return sse.response;
}
