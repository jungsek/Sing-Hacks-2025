import type {
  RegulatoryCandidate,
  RegulatoryDocument,
  RegulatorySnippet,
} from "@/app/langgraph/common/state";
import { tavilyExtract } from "@/app/langgraph/tools/tavily";
import {
  fetchMasPortalDetail,
  resolveMasPdfLinks,
  MAS_PORTAL_HTML_HEADERS,
} from "@/app/langgraph/tools/masPortal";

import { MAS_PDF_HEADERS, MAX_EXTRACT_URLS } from "./constants";
import { emitEvent, recordAgentRun } from "./events";
import type { RegulatoryNodeContext } from "./types";
import { detectContentType, makeSnippet, mergeByUrl } from "./utils";
import { load as loadHtml } from "cheerio";
import { upsertRegulatorySource } from "@/lib/supabase/dao/regulatorySources";

// Lazy loader for pdf-parse core to prevent evaluation of package index debug code
type PdfParseFn = typeof import("pdf-parse").default;
let cachedPdfParse: PdfParseFn | undefined;
async function loadPdfParse(): Promise<PdfParseFn> {
  if (cachedPdfParse) return cachedPdfParse;
  const pdfModule = await import("pdf-parse");
  cachedPdfParse = pdfModule.default;
  return cachedPdfParse;
}

export async function runRegulatoryExtract(
  freshCandidates: RegulatoryCandidate[],
  existingDocuments: RegulatoryDocument[],
  context: RegulatoryNodeContext,
): Promise<{
  newDocuments: RegulatoryDocument[];
  combinedDocuments: RegulatoryDocument[];
  snippets: RegulatorySnippet[];
}> {
  const snippets: RegulatorySnippet[] = [];
  if (freshCandidates.length === 0) {
    return { newDocuments: [], combinedDocuments: existingDocuments, snippets };
  }

  await emitEvent(context, "on_node_start", "regulatory_extract", {
    url_count: freshCandidates.length,
  });
  await recordAgentRun(context, "regulatory_extract", "start", {
    url_count: freshCandidates.length,
  });

  const processedPdfUrls = new Set<string>();
  const augmentedCandidates: RegulatoryCandidate[] = [...freshCandidates];
  const newDocuments: RegulatoryDocument[] = [];

  const portalDetails = await Promise.all(
    freshCandidates
      .filter((candidate) => candidate.source === "mas_portal")
      .map(async (candidate) => {
        try {
          const detail = await fetchMasPortalDetail(candidate.url);
          return { candidate, detail };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error ?? "");
          snippets.push(
            makeSnippet(
              `reg_extract_portal_error_${Date.now()}`,
              `Failed to fetch MAS portal detail for ${candidate.url}: ${message}`,
              candidate.url,
              "warning",
            ),
          );
          return { candidate, detail: null };
        }
      }),
  );

  let manualDocumentCount = 0;
  let lastManualDocumentUrl: string | undefined;

  for (const { candidate, detail } of portalDetails) {
    if (!detail) continue;
    if (!candidate.title && detail.title) {
      candidate.title = detail.title;
    }
    if (!candidate.published_at && detail.publishedAt) {
      candidate.published_at = detail.publishedAt;
    }

    const pdfLinks = resolveMasPdfLinks(detail);
    for (const pdfUrl of pdfLinks) {
      const normalizedUrl = pdfUrl?.split("#")[0] ?? pdfUrl;
      if (!normalizedUrl || processedPdfUrls.has(normalizedUrl)) continue;
      processedPdfUrls.add(normalizedUrl);

      augmentedCandidates.push({
        ...candidate,
        url: normalizedUrl,
        source: "mas_portal_pdf",
        metadata: {
          ...(candidate.metadata ?? {}),
          pdf_source_url: candidate.url,
        },
      });

      try {
        const pdfResponse = await fetch(normalizedUrl, {
          headers: MAS_PDF_HEADERS,
        });
        if (!pdfResponse.ok) {
          throw new Error(`status ${pdfResponse.status}`);
        }
        const arrayBuffer = await pdfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const _pdfParse = await loadPdfParse();
        const parsed = await _pdfParse(buffer);
        const text = parsed?.text?.trim();
        if (!text) {
          continue;
        }

        const document: RegulatoryDocument = {
          url: normalizedUrl,
          title: detail.title ?? candidate.title ?? normalizedUrl,
          content: text,
          content_type: "pdf",
          extracted_at: new Date().toISOString(),
          regulator: candidate.regulator,
          published_at: candidate.published_at ?? detail.publishedAt,
          tags: candidate.regulator
            ? ["regulatory", candidate.regulator.toLowerCase()]
            : ["regulatory"],
          meta: {
            query: candidate.query,
            summary: candidate.summary,
            source: "mas_portal_pdf",
            listing_topic: candidate.listing_topic,
            listing_content_type: candidate.listing_content_type,
            portal: candidate.metadata,
            source_hash: candidate.source_hash,
            pdf_source_url: candidate.url,
          },
        };

        newDocuments.push(document);
        manualDocumentCount += 1;
        lastManualDocumentUrl = normalizedUrl;
      } catch (error: unknown) {
        processedPdfUrls.delete(normalizedUrl);
        const message = error instanceof Error ? error.message : String(error ?? "");
        snippets.push(
          makeSnippet(
            `reg_extract_pdf_error_${Date.now()}`,
            `Failed to parse MAS PDF ${normalizedUrl}: ${message}`,
            normalizedUrl,
            "warning",
          ),
        );
      }
    }
  }

  const extractionCandidates = augmentedCandidates.filter(
    (candidate) => !(candidate.source === "mas_portal_pdf" && processedPdfUrls.has(candidate.url)),
  );

  extractionCandidates.sort((a, b) => {
    const sourcePriority = (candidate: RegulatoryCandidate) => {
      if (candidate.source === "mas_portal_pdf") return 0;
      if (candidate.source === "mas_portal") return 1;
      return 2;
    };
    const diff = sourcePriority(a) - sourcePriority(b);
    if (diff !== 0) return diff;
    return 0;
  });

  const urls = extractionCandidates.slice(0, MAX_EXTRACT_URLS).map((candidate) => candidate.url);
  const candidateMap = new Map<string, RegulatoryCandidate>();
  for (const candidate of extractionCandidates) {
    candidateMap.set(candidate.url, candidate);
  }

  if (manualDocumentCount > 0) {
    snippets.push(
      makeSnippet(
        `reg_extract_manual_${Date.now()}`,
        `Parsed ${manualDocumentCount} MAS portal PDF document${manualDocumentCount === 1 ? "" : "s"}.`,
        lastManualDocumentUrl,
        "success",
      ),
    );
  }

  let extractResponse: Awaited<ReturnType<typeof tavilyExtract>> | null = null;
  if (urls.length > 0) {
    extractResponse = await tavilyExtract({ urls });
  }

  for (const doc of extractResponse?.results ?? []) {
    const candidate = candidateMap.get(doc.url);
    const regulator = candidate?.regulator;
    const content = (doc.content ?? "").trim();
    if (!content) continue;
    const document: RegulatoryDocument = {
      url: doc.url,
      title: doc.title ?? candidate?.title,
      content,
      content_type: detectContentType(doc.url),
      extracted_at: new Date().toISOString(),
      regulator,
      published_at: candidate?.published_at,
      tags: regulator ? ["regulatory", regulator.toLowerCase()] : ["regulatory"],
      meta: {
        language: doc.language,
        media_type: doc.media_type,
        query: candidate?.query,
        summary: candidate?.summary,
        source: candidate?.source ?? "tavily",
        listing_topic: candidate?.listing_topic,
        listing_content_type: candidate?.listing_content_type,
        portal: candidate?.metadata,
        source_hash: candidate?.source_hash,
      },
    };
    newDocuments.push(document);
  }

  // Fallback extraction: for any URLs we attempted but didn't get content for,
  // try direct fetch + simple HTML/PDF parsing.
  if (urls.length > 0) {
    const produced = new Set(newDocuments.map((d) => d.url));
    const fallbackTargets = urls.filter((u) => !produced.has(u)).slice(0, 8);

    let fallbackSuccess = 0;
    for (const url of fallbackTargets) {
      try {
        const type = detectContentType(url);
        if (type === "pdf") {
          const pdfResponse = await fetch(url, { headers: MAS_PDF_HEADERS });
          if (!pdfResponse.ok) throw new Error(`status ${pdfResponse.status}`);
          const ab = await pdfResponse.arrayBuffer();
          const buf = Buffer.from(ab);
          const _pdfParse = await loadPdfParse();
          const parsed = await _pdfParse(buf);
          const text = parsed?.text?.trim();
          if (!text || text.length < 200) continue;
          const document: RegulatoryDocument = {
            url,
            title: candidateMap.get(url)?.title ?? url,
            content: text,
            content_type: "pdf",
            extracted_at: new Date().toISOString(),
            regulator: candidateMap.get(url)?.regulator,
            published_at: candidateMap.get(url)?.published_at,
            tags: candidateMap.get(url)?.regulator
              ? ["regulatory", String(candidateMap.get(url)?.regulator).toLowerCase()]
              : ["regulatory"],
            meta: {
              source: "direct_pdf",
              query: candidateMap.get(url)?.query,
              summary: candidateMap.get(url)?.summary,
              listing_topic: candidateMap.get(url)?.listing_topic,
              listing_content_type: candidateMap.get(url)?.listing_content_type,
              portal: candidateMap.get(url)?.metadata,
              source_hash: candidateMap.get(url)?.source_hash,
            },
          };
          newDocuments.push(document);
          fallbackSuccess += 1;
        } else {
          const res = await fetch(url, { headers: MAS_PORTAL_HTML_HEADERS });
          if (!res.ok) throw new Error(`status ${res.status}`);
          const html = await res.text();
          const $ = loadHtml(html);

          // Extract main text from article or paragraphs
          let text = $("article, main").text().trim();
          if (!text || text.length < 200) {
            text = $("p")
              .map((_, el) => $(el).text().trim())
              .get()
              .join("\n\n")
              .trim();
          }
          text = text.replace(/\s+/g, " ").trim();
          if (!text || text.length < 300) continue;

          // 👇 NEW: find the first <a href="...pdf"> link
          let pdfUrl: string | null = null;
          const pdfAnchor = $('a[href$=".pdf"]').first();
          if (pdfAnchor && pdfAnchor.attr("href")) {
            const href = pdfAnchor.attr("href")!;
            pdfUrl = href.startsWith("http") ? href : new URL(href, url).toString();
          }

          // Construct document
          const document: RegulatoryDocument = {
            url,
            title: (candidateMap.get(url)?.title ?? $("title").first().text().trim()) || url,
            content: text.slice(0, 200_000),
            content_type: "html",
            extracted_at: new Date().toISOString(),
            regulator: candidateMap.get(url)?.regulator,
            published_at: candidateMap.get(url)?.published_at,
            tags: candidateMap.get(url)?.regulator
              ? ["regulatory", String(candidateMap.get(url)?.regulator).toLowerCase()]
              : ["regulatory"],
            meta: {
              source: "html_fetch",
              query: candidateMap.get(url)?.query,
              summary: candidateMap.get(url)?.summary,
              listing_topic: candidateMap.get(url)?.listing_topic,
              listing_content_type: candidateMap.get(url)?.listing_content_type,
              portal: candidateMap.get(url)?.metadata,
              source_hash: candidateMap.get(url)?.source_hash,
              pdf_url: pdfUrl ?? undefined,
            },
          };

          newDocuments.push(document);
          fallbackSuccess += 1;
        }

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        snippets.push(
          makeSnippet(
            `reg_extract_fallback_error_${Date.now()}`,
            `Fallback extract failed for ${url}: ${message}`,
            url,
            "warning",
          ),
        );
      }
    }

    if (fallbackSuccess > 0) {
      snippets.push(
        makeSnippet(
          `reg_extract_fallback_${Date.now()}`,
          `Fallback extractor captured ${fallbackSuccess} document${fallbackSuccess === 1 ? "" : "s"}.`,
          undefined,
          "success",
        ),
      );
    }
  }

  const combinedDocuments = mergeByUrl(existingDocuments, newDocuments);

  // Persist combinedDocuments to regulatory_sources table
  let persistedCount = 0;

  for (const doc of combinedDocuments) {
  // derive domain
  const domain = (() => {
    try {
      return new URL(doc.url).hostname;
    } catch {
      return null;
    }
  })();

  // detect whether it’s a PDF
  const isPdf =
    doc.content_type === "pdf" ||
    doc.url.toLowerCase().includes(".pdf") ||
    (doc.meta?.source === "mas_portal_pdf");

  console.log(
    "🧾 Persisting:",
    doc.url,
    "type:",
    doc.content_type,
    "meta.source:",
    doc.meta?.source,
    "isPdf:",
    isPdf
  );

  const pdfFromMeta =
  (doc.meta?.pdf_url as string | undefined) ||
  (doc.meta?.pdf_source_url as string | undefined);

  console.log(
    "🧾 Persisting:",
    doc.url,
    "→ pdf:",
    pdfFromMeta ?? (isPdf ? doc.url : null)
  );

  const saved = await upsertRegulatorySource({
    regulator_name: doc.regulator ?? "Unknown",
    title: doc.title ?? doc.url,
    description:
      (doc.meta?.summary as string) ??
      (typeof doc.content === "string" && doc.content.trim().length > 0
        ? doc.content.slice(0, 300)
        : undefined),
    policy_url: doc.url,
    regulatory_document_file: pdfFromMeta
  ? pdfFromMeta
  : isPdf
    ? doc.url
    : null,  
    domain: domain ?? null,                          
    published_date: (doc.published_at ?? "").slice(0, 10) || undefined,
    last_updated_date: new Date().toISOString(),
  });

  if (saved) persistedCount += 1;
}
  if (persistedCount > 0) {
    snippets.push(
      makeSnippet(
        `reg_sources_persist_${Date.now()}`,
        `Persisted ${persistedCount} regulatory source${persistedCount === 1 ? "" : "s"} to the database.`,
        undefined,
        "success",
      ),
    );
  }

  snippets.push(
    makeSnippet(
      `reg_extract_${Date.now()}`,
      newDocuments.length > 0
        ? `Extracted plaintext from ${newDocuments.length} regulatory documents.`
        : "No regulatory documents could be extracted for the new sources.",
      newDocuments[0]?.url,
      newDocuments.length > 0 ? "success" : "warning",
    ),
  );

  await emitEvent(context, "on_node_end", "regulatory_extract", {
    documents_total: combinedDocuments.length,
    documents_new: newDocuments.length,
  });
  await recordAgentRun(context, "regulatory_extract", "end", {
    documents_total: combinedDocuments.length,
    documents_new: newDocuments.length,
  });

  return {
    newDocuments,
    combinedDocuments,
    snippets,
  };
}
