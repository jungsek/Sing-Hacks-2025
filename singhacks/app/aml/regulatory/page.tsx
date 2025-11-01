import { promises as fs } from "fs";
import path from "path";

import Link from "next/link";

const DATA_ROOT = path.join(process.cwd(), "singhacks", "data", "regulatory");
const MANIFEST_PATH = path.join(DATA_ROOT, "manifest.json");

type ManifestEntry = {
  id: string;
  url: string;
  title?: string;
  regulator?: string;
  published_at?: string;
  stored_at: string;
  source?: string;
  content_path: string;
  metadata?: Record<string, unknown>;
};

async function loadManifest(): Promise<ManifestEntry[]> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw) as ManifestEntry[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore missing manifest for now
  }
  return [];
}

function formatDate(value?: string): string {
  if (!value) return "Unknown";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

export default async function RegulatoryKnowledgeBasePage() {
  const manifest = await loadManifest();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Regulatory Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">
          Latest MAS regulatory documents captured by the Sentinel agent (limited to the five most recent sources).
        </p>
      </div>

      {manifest.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No regulatory documents have been stored yet. Run a quick MAS scrape to populate this view.
        </div>
      ) : (
        <div className="grid gap-4">
          {manifest.map((entry) => {
            const downloadPath = path.join("/data/regulatory", entry.content_path.replace(/\\\\/g, "/"));

            return (
              <div key={entry.id} className="rounded-md border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-medium">
                      {entry.title ?? "Untitled Regulatory Document"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {entry.regulator ?? "MAS"} · Stored {formatDate(entry.stored_at)} · Published {formatDate(entry.published_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      Source
                    </Link>
                    <Link
                      href={downloadPath}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      Download Text
                    </Link>
                  </div>
                </div>
                {entry.metadata?.listing_topic ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Topic: {String(entry.metadata.listing_topic)} · Type: {String(entry.metadata.listing_content_type ?? "n/a")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
