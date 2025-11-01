import type { RegulatoryCandidate, RegulatorySnippet } from "@/app/langgraph/common/state";
import { tavilySearch } from "@/app/langgraph/tools/tavily";
import {
  MAS_PORTAL_CONTENT_TYPES,
  MAS_PORTAL_TOPICS,
  fetchMasPortalListing,
} from "@/app/langgraph/tools/masPortal";

import {
  MAX_PORTAL_PAGES,
  MAX_RESULTS_PER_QUERY,
  REGULATOR_CONFIGS,
} from "./constants";
import { emitEvent, recordAgentRun } from "./events";
import type { RegulatorConfig, RegulatoryNodeContext } from "./types";
import { dedupeByUrl, getLookbackCursor, makeSnippet, mergeByUrl } from "./utils";

export async function runRegulatoryScan(
  existingCandidates: RegulatoryCandidate[],
  cursor: string | undefined,
  context: RegulatoryNodeContext,
  configs: RegulatorConfig[],
): Promise<{
  newCandidates: RegulatoryCandidate[];
  combinedCandidates: RegulatoryCandidate[];
  snippets: RegulatorySnippet[];
  cursor: string;
}> {
  const activeConfigs = configs.length > 0 ? configs : REGULATOR_CONFIGS;
  const snippets: RegulatorySnippet[] = [];
  const startDate = getLookbackCursor(cursor);

  if (activeConfigs.length === 0) {
    const cursorValue = new Date().toISOString();
    snippets.push(
      makeSnippet(
        `reg_scan_none_${Date.now()}`,
        "No regulator configurations available for the scan request.",
        undefined,
        "warning",
      ),
    );
    return {
      newCandidates: [],
      combinedCandidates: existingCandidates,
      snippets,
      cursor: cursorValue,
    };
  }

  await emitEvent(context, "on_node_start", "regulatory_scan", {
    start_date: startDate,
    regulators: activeConfigs.map((config) => config.regulator),
  });
  await recordAgentRun(context, "regulatory_scan", "start", { start_date: startDate });

  const discovered: RegulatoryCandidate[] = [];
  for (const config of activeConfigs) {
    if (config.code === "MAS") {
      const portalSeen = new Set<string>();
      const portalSummaries: Array<{ topic: string; contentType: string; hits: number }> = [];
      const startDateMs = startDate ? Date.parse(startDate) : undefined;
      let portalTotalHits = 0;

      for (const topic of MAS_PORTAL_TOPICS) {
        for (const contentType of MAS_PORTAL_CONTENT_TYPES) {
          let comboHits = 0;
          for (let page = 1; page <= MAX_PORTAL_PAGES; page += 1) {
            const listingResult = await fetchMasPortalListing({ topic, contentType, page });
            if (listingResult.error) {
              snippets.push(
                makeSnippet(
                  `reg_scan_portal_error_${Date.now()}_${page}`,
                  `MAS portal listing fetch failed for ${topic} / ${contentType} (page ${page}): ${listingResult.error.message}`,
                  undefined,
                  "warning",
                ),
              );
              break;
            }

            if (listingResult.cards.length === 0) {
              break;
            }

            for (const card of listingResult.cards) {
              if (portalSeen.has(card.url)) continue;
              if (startDateMs && card.publishedAt) {
                const publishedMs = Date.parse(card.publishedAt);
                if (!Number.isNaN(publishedMs) && publishedMs < startDateMs) {
                  continue;
                }
              }

              portalSeen.add(card.url);
              portalTotalHits += 1;
              comboHits += 1;

              const candidate: RegulatoryCandidate = {
                url: card.url,
                title: card.title,
                summary: card.summary,
                published_at: card.publishedAt,
                source: "mas_portal",
                regulator: config.regulator,
                domain: "mas.gov.sg",
                source_hash: card.sourceHash,
                listing_topic: card.topic,
                listing_content_type: card.contentType,
                metadata: {
                  ...(card.metadata ?? {}),
                  topic: card.topic,
                  content_type: card.contentType,
                },
              };
              discovered.push(candidate);
            }

            if (listingResult.cards.length < 10) {
              break;
            }
          }

          if (comboHits > 0) {
            portalSummaries.push({ topic, contentType, hits: comboHits });
          }
        }
      }

      if (portalTotalHits > 0) {
        const summaryText = portalSummaries
          .map(
            (item) =>
              `${item.hits} ${item.contentType.toLowerCase()} (${item.topic.replace(/-/g, " ")})`,
          )
          .join(", ");
        snippets.push(
          makeSnippet(
            `reg_scan_mas_portal_${Date.now()}`,
            `MAS portal enumeration discovered ${portalTotalHits} sources${summaryText ? `: ${summaryText}` : "."}`,
            undefined,
            "success",
          ),
        );
      } else {
        snippets.push(
          makeSnippet(
            `reg_scan_mas_portal_${Date.now()}`,
            "MAS portal enumeration returned no new sources.",
            undefined,
            "info",
          ),
        );
      }
    }

    for (const query of config.queries) {
      try {
        const search = await tavilySearch({
          query,
          include_domains: config.includeDomains,
          topic: "news",
          start_date: startDate,
          max_results: MAX_RESULTS_PER_QUERY,
          filter_duplicates: true,
        });

        const results = search.results ?? [];
        if (results.length > 0) {
          await emitEvent(context, "on_tool_call", "regulatory_scan", {
            tool: "tavily.search",
            query,
            regulator: config.regulator,
            count: results.length,
          });
        }

        for (const result of results) {
          const candidate: RegulatoryCandidate = {
            url: result.url,
            title: result.title,
            summary: result.content ?? result.snippet,
            published_at: result.published_date,
            query,
            source: "tavily",
            regulator: config.regulator,
            domain: (() => {
              try {
                return new URL(result.url).hostname;
              } catch {
                return config.includeDomains[0];
              }
            })(),
          };
          discovered.push(candidate);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        snippets.push(
          makeSnippet(
            `reg_scan_error_${config.code}_${Date.now()}`,
            `Failed Tavily search for ${config.regulator} query "${query}": ${message}`,
            undefined,
            "warning",
          ),
        );
      }
    }
  }

  const deduped = dedupeByUrl(discovered);
  const newCandidates = deduped.filter(
    (candidate) => !existingCandidates.some((existing) => existing.url === candidate.url),
  );
  const combinedCandidates = mergeByUrl(existingCandidates, deduped);

  const cursorValue = new Date().toISOString();
  const regulatorSummary =
    activeConfigs.length <= 3
      ? activeConfigs.map((config) => config.regulator).join(", ")
      : `${activeConfigs.length} regulators`;
  snippets.push(
    makeSnippet(
      `reg_scan_${Date.now()}`,
      newCandidates.length > 0
        ? `Discovered ${newCandidates.length} new regulatory sources across ${regulatorSummary}.`
        : "No new regulatory sources discovered during this scan window.",
      newCandidates[0]?.url,
      newCandidates.length > 0 ? "success" : "info",
    ),
  );

  await emitEvent(context, "on_node_end", "regulatory_scan", {
    candidates_total: combinedCandidates.length,
    candidates_new: newCandidates.length,
    start_date: startDate,
  });
  await recordAgentRun(context, "regulatory_scan", "end", {
    candidates_total: combinedCandidates.length,
    candidates_new: newCandidates.length,
  });

  return {
    newCandidates,
    combinedCandidates,
    snippets,
    cursor: cursorValue,
  };
}

