import { logAgentRun } from "@/lib/supabase/dao/agentRuns";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const runId = `ingest_${Date.now()}`;
  try {
    await logAgentRun({ run_id: runId, graph: "sentinel", node: "upload", status: "start" });
  } catch {}

  try {
    const form = await req.formData();
    const fileEntry = form.get("file");
    const filenameEntry = form.get("filename");
    const providedName = typeof filenameEntry === "string" ? filenameEntry : undefined;

    if (!(fileEntry instanceof File)) {
      return Response.json({ error: "Missing file field 'file'" }, { status: 400 });
    }

    const nameFromFile = fileEntry.name || providedName || "upload.csv";
    const ext = path.extname(nameFromFile).toLowerCase();
    if (ext !== ".csv") {
      return Response.json({ error: "Only CSV files are supported" }, { status: 400 });
    }

    const dir = path.resolve(process.cwd(), "data/transactions");
    await mkdir(dir, { recursive: true });

    const safeBase = nameFromFile.replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const storedName = `${Date.now()}_${safeBase}`;
    const dest = path.join(dir, storedName);

    const buf = Buffer.from(await fileEntry.arrayBuffer());
    await writeFile(dest, buf);

    const relPath = `data/transactions/${storedName}`;
    try {
      await logAgentRun({
        run_id: runId,
        graph: "sentinel",
        node: "upload",
        status: "end",
        payload: { path: relPath, bytes: buf.length },
      });
    } catch {}

    return Response.json({ ok: true, file_path: relPath, bytes: buf.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    try {
      await logAgentRun({
        run_id: runId,
        graph: "sentinel",
        node: "upload",
        status: "error",
        payload: { message },
      });
    } catch {}
    return Response.json({ error: message }, { status: 500 });
  }
}
