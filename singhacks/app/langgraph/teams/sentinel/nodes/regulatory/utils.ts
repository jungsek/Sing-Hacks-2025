import { createHash } from "node:crypto";

import type {
  RegulatorySnippet,
  RegulatoryVersionRecord,
  RuleProposal,
} from "@/app/langgraph/common/state";

import { CRITERIA_KEYWORDS, DEFAULT_LOOKBACK_DAYS } from "./constants";

// Return a date-only string (YYYY-MM-DD) acceptable by Tavily API
export function toDateOnly(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function getLookbackCursor(current?: string): string {
  if (current) return toDateOnly(current);
  const now = new Date();
  now.setDate(now.getDate() - DEFAULT_LOOKBACK_DAYS);
  return toDateOnly(now);
}

export function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const url = item.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(item);
  }
  return result;
}

export function mergeByUrl<T extends { url: string }>(existing: T[] = [], incoming: T[] = []): T[] {
  const map = new Map<string, T>();
  for (const item of existing) {
    if (item.url) {
      map.set(item.url, item);
    }
  }
  for (const item of incoming) {
    if (item.url) {
      map.set(item.url, item);
    }
  }
  return Array.from(map.values());
}

export function mergeProposals(
  existing: RuleProposal[] = [],
  incoming: RuleProposal[] = [],
): RuleProposal[] {
  const map = new Map<string, RuleProposal>();
  for (const proposal of existing) {
    map.set(proposal.id, proposal);
  }
  for (const proposal of incoming) {
    map.set(proposal.id, proposal);
  }
  return Array.from(map.values());
}

export function mergeVersions(
  existing: RegulatoryVersionRecord[] = [],
  incoming: RegulatoryVersionRecord[] = [],
): RegulatoryVersionRecord[] {
  const map = new Map<string, RegulatoryVersionRecord>();
  for (const version of existing) {
    map.set(version.rule_version_id, version);
  }
  for (const version of incoming) {
    map.set(version.rule_version_id, version);
  }
  return Array.from(map.values());
}

export function detectContentType(url: string): "html" | "pdf" | "unknown" {
  const lowered = url.toLowerCase();
  if (lowered.endsWith(".pdf")) return "pdf";
  if (lowered.startsWith("https://") || lowered.startsWith("http://")) return "html";
  return "unknown";
}

export function slugFromUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function hashContent(content: string): string {
  return createHash("sha1")
    .update(content ?? "")
    .digest("hex");
}

export function makeRuleId(regulator: string | undefined, url: string): string {
  const base = slugFromUrl(url);
  return `${(regulator ?? "reg").toLowerCase()}_${base}`;
}

export function makeSnippet(
  ruleId: string,
  text: string,
  sourceUrl?: string,
  level: RegulatorySnippet["level"] = "info",
): RegulatorySnippet {
  return {
    rule_id: ruleId,
    text,
    source_url: sourceUrl,
    level,
  };
}

export function chunkText(input: string, size = 1200, overlap = 150): string[] {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return [];
  if (cleaned.length <= size) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(cleaned.length, start + size);
    if (end < cleaned.length) {
      const lastSpace = cleaned.lastIndexOf(" ", end);
      if (lastSpace > start + size / 2) {
        end = lastSpace;
      }
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end >= cleaned.length) break;
    const nextStart = Math.max(end - overlap, start + 1);
    start = nextStart <= start ? end : nextStart;
  }
  return chunks;
}

export function extractEffectiveDate(content: string): string | undefined {
  const lowered = content.toLowerCase();
  const effectiveIdx = lowered.indexOf("effective");
  const window =
    effectiveIdx >= 0 ? content.slice(effectiveIdx, effectiveIdx + 200) : content.slice(0, 200);
  const isoMatch = window.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (isoMatch) {
    return isoMatch[0];
  }
  const longMatch = window.match(
    /(\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})/i,
  );
  if (longMatch) {
    const date = new Date(longMatch[0]);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  const shortMatch = window.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i,
  );
  if (shortMatch) {
    const date = new Date(shortMatch[0]);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

export function sentencesFromContent(content: string): string[] {
  return content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function extractCriteria(content: string): RuleProposal["criteria"] {
  const sentences = sentencesFromContent(content);
  const criteria: RuleProposal["criteria"] = [];
  for (const sentence of sentences) {
    const lowered = sentence.toLowerCase();
    if (CRITERIA_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
      criteria.push({
        type: "requirement",
        requirement: sentence,
      });
    }
    if (criteria.length >= 6) break;
  }
  if (criteria.length === 0) {
    for (const sentence of sentences.slice(0, 3)) {
      criteria.push({
        type: "note",
        requirement: sentence,
      });
    }
  }
  return criteria;
}
