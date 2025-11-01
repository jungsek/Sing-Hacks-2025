import type {
  RegulatoryCandidate,
  RegulatoryDocument,
  RegulatorySnippet,
} from "@/app/langgraph/common/state";
import { tavilyExtract } from "@/app/langgraph/tools/tavily";
import { fetchMasPortalDetail, resolveMasPdfLinks } from "@/app/langgraph/tools/masPortal";

import { MAS_PDF_HEADERS, MAX_EXTRACT_URLS } from "./constants";
import { emitEvent, recordAgentRun } from "./events";
import type { RegulatoryNodeContext } from "./types";
import { detectContentType, makeSnippet, mergeByUrl } from "./utils";

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

  const combinedDocuments = mergeByUrl(existingDocuments, newDocuments);

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
