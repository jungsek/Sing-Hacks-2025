import { promises as fs } from "fs";
import path from "path";
import { createHash } from "node:crypto";

import type { RegulatoryDocument } from "@/app/langgraph/common/state";
import type { SerializableRecord } from "@/lib/types";

type RegulatoryManifestEntry = {
  id: string;
  url: string;
  title?: string;
  regulator?: string;
  published_at?: string;
  stored_at: string;
  source?: string;
  content_path: string;
  metadata?: SerializableRecord;
};

type PersistResult = {
  stored: number;
  manifest: RegulatoryManifestEntry[];
};

const DATA_ROOT = path.join(process.cwd(), "singhacks", "data", "regulatory");
const DOCUMENTS_DIR = path.join(DATA_ROOT, "documents");
const MANIFEST_PATH = path.join(DATA_ROOT, "manifest.json");

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function resolveId(doc: RegulatoryDocument): string {
  if (typeof doc.meta?.source_hash === "string" && doc.meta.source_hash.length > 0) {
    return doc.meta.source_hash;
  }
  return createHash("sha1").update(doc.url).digest("hex");
}

function sortEntries(entries: RegulatoryManifestEntry[]): RegulatoryManifestEntry[] {
  return [...entries].sort((a, b) => {
    const dateA = Date.parse(a.published_at ?? "") || Date.parse(a.stored_at);
    const dateB = Date.parse(b.published_at ?? "") || Date.parse(b.stored_at);
    return dateB - dateA;
  });
}

async function readManifest(): Promise<RegulatoryManifestEntry[]> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as RegulatoryManifestEntry[];
    }
  } catch {
    // ignore missing manifest
  }
  return [];
}

async function ensureFolders(): Promise<void> {
  await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
}

async function removeEntryFile(entry: RegulatoryManifestEntry): Promise<void> {
  try {
    await fs.unlink(path.join(DATA_ROOT, entry.content_path));
  } catch {
    // ignore
  }
}

export async function persistRegulatoryDocuments(
  documents: RegulatoryDocument[],
  limit = 5,
): Promise<PersistResult> {
  if (!documents || documents.length === 0) {
    return { stored: 0, manifest: await readManifest() };
  }

  await ensureFolders();

  const manifest = await readManifest();
  const manifestMap = new Map<string, RegulatoryManifestEntry>();
  for (const entry of manifest) {
    manifestMap.set(entry.id, entry);
  }

  let storedCount = 0;
  const now = new Date().toISOString();

  for (const doc of documents) {
    const id = resolveId(doc);
    const existing = manifestMap.get(id);

    const baseName = toSlug(doc.title ?? doc.url) || "regulatory-document";
    const fileName = `${baseName}-${id.slice(0, 8)}.txt`;
    const relativePath = path.join("documents", fileName);
    const filePath = path.join(DATA_ROOT, relativePath);

    await fs.writeFile(filePath, doc.content, "utf-8");

    manifestMap.set(id, {
      id,
      url: doc.url,
      title: doc.title,
      regulator: doc.regulator,
      published_at: doc.published_at,
      stored_at: existing?.stored_at ?? now,
      source: doc.meta?.source,
      content_path: relativePath,
      metadata: doc.meta ?? undefined,
    });

    if (!existing) {
      storedCount += 1;
    }
  }

  const sorted = sortEntries(Array.from(manifestMap.values()));
  const limited = sorted.slice(0, limit);
  const limitedIds = new Set(limited.map((entry) => entry.id));

  for (const entry of manifestMap.values()) {
    if (!limitedIds.has(entry.id)) {
      await removeEntryFile(entry);
    }
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(limited, null, 2), "utf-8");

  return {
    stored: storedCount,
    manifest: limited,
  };
}

