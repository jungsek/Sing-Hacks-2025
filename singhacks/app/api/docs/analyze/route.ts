import { NextRequest } from "next/server";
import { createSSEController } from "@/app/langgraph/common/stream";
import type { GraphEvent } from "@/app/langgraph/common/events";
import { logAgentRun } from "@/lib/supabase/dao/agentRuns";
import { createClient as createSb } from "@supabase/supabase-js";
import { runVeritas } from "@/app/langgraph/teams/veritas";

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
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const sb = url && key ? createSb(url, key) : null;

      // Mark case as processing
      if (sb && case_id && case_id !== "unknown") {
        await sb.from("aml_cases").update({ status: "processing" }).eq("id", case_id);
      }

      // Resolve storage path for the document and download bytes
      let buffer: Buffer | null = null;
      if (sb && document_id) {
        const { data: docRow } = await sb
          .from("documents")
          .select("id, storage_path")
          .eq("id", document_id)
          .maybeSingle();
        const storagePath = (docRow as any)?.storage_path as string | undefined;
        if (storagePath) {
          const { data: fileData } = await sb.storage.from("Files").download(storagePath);
          if (fileData) {
            const arr = await fileData.arrayBuffer();
            buffer = Buffer.from(arr);
          }
        }
      }

      if (!buffer) {
        throw new Error("Unable to load document bytes from storage.");
      }

      // Run Veritas and stream events
      await runVeritas(
        buffer,
        {
          runId: run_id,
          graph,
          write: async (e) => {
            await sse.write(e);
            try {
              await logAgentRun({
                run_id,
                graph,
                node: e.payload.node,
                status:
                  e.type === "on_node_start"
                    ? "start"
                    : e.type === "on_node_end"
                      ? "end"
                      : e.type === "on_error"
                        ? "error"
                        : "artifact",
                payload: e.payload,
              });
            } catch {}
            if (sb) {
              try {
                await sb.from("agent_runs").insert({
                  run_id,
                  graph,
                  node: e.payload.node,
                  status:
                    e.type === "on_node_start"
                      ? "start"
                      : e.type === "on_node_end"
                        ? "end"
                        : e.type === "on_error"
                          ? "error"
                          : "artifact",
                  payload: e.payload,
                });
              } catch {}
            }
          },
        },
        document_id ?? "unknown",
      );

      // Mark case as pending action on finish
      if (sb && case_id && case_id !== "unknown") {
        await sb.from("aml_cases").update({ status: "pending action" }).eq("id", case_id);
      }
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
