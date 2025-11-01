import { promises as fs } from "fs";
import path from "path";

import type { NextRequest } from "next/server";

const DATA_ROOT = path.join(process.cwd(), "singhacks", "data", "regulatory");
const MANIFEST_PATH = path.join(DATA_ROOT, "manifest.json");

type ManifestEntry = {
  id: string;
  title?: string;
  content_path: string;
};

type DocumentRouteContext = {
  params: Promise<{ id: string }>;
};

async function loadManifest(): Promise<ManifestEntry[]> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as ManifestEntry[];
    }
  } catch {
    // ignore missing manifest
  }
  return [];
}

export async function GET(req: NextRequest, context: DocumentRouteContext) {
  const { id } = await context.params;
  const manifest = await loadManifest();
  const entry = manifest.find((item) => item.id === id);

  if (!entry) {
    return new Response("Document not found", { status: 404 });
  }

  const filePath = path.join(DATA_ROOT, entry.content_path);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const fileName = `${entry.title ?? "regulatory-document"}.txt`;
    return new Response(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "'")}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return new Response(`Unable to read document: ${message}`, {
      status: 500,
    });
  }
}
