import type { RegulatorySnippet, SentinelState } from "@/app/langgraph/common/state";
import { TavilyConfigError } from "@/app/langgraph/tools/tavily";

import { REGULATOR_CONFIGS } from "./regulatory/constants";
import { emitEvent, recordAgentRun } from "./regulatory/events";
import { runRegulatoryExtract } from "./regulatory/extract";
import { runRegulatoryScan } from "./regulatory/scan";
import type { RegulatoryNodeContext } from "./regulatory/types";
import { runRuleGeneration } from "./regulatory/generate";
import { runRuleVersioning } from "./regulatory/version";
import { makeSnippet, mergeByUrl, mergeProposals, mergeVersions } from "./regulatory/utils";

export async function regulatoryNode(
  state: SentinelState,
  context: RegulatoryNodeContext = {},
): Promise<Partial<SentinelState>> {
  const snippets: RegulatorySnippet[] = [];
  const existingCandidates = state.regulatory_candidates ?? [];
  const existingDocuments = state.regulatory_documents ?? [];
  const existingProposals = state.rule_proposals ?? [];
  const existingVersions = state.regulatory_versions ?? [];

  const requestedCodes = Array.isArray(context.regulatorCodes)
    ? context.regulatorCodes.map((code) => code.toUpperCase())
    : undefined;
  const activeConfigs =
    requestedCodes && requestedCodes.length > 0
      ? REGULATOR_CONFIGS.filter((config) => requestedCodes.includes(config.code))
      : REGULATOR_CONFIGS;

  if (requestedCodes && requestedCodes.length > 0 && activeConfigs.length === 0) {
    const message = `No regulator configuration found for codes: ${requestedCodes.join(", ")}`;
    const infoSnippet = makeSnippet(
      `reg_config_missing_${Date.now()}`,
      message,
      undefined,
      "warning",
    );
    return {
      regulatory_snippets: [...(state.regulatory_snippets ?? []), infoSnippet],
      regulatory_candidates: state.regulatory_candidates,
      regulatory_documents: state.regulatory_documents,
      rule_proposals: state.rule_proposals,
      regulatory_versions: state.regulatory_versions,
      regulatory_cursor: state.regulatory_cursor,
    };
  }

  try {
    const scanResult = await runRegulatoryScan(
      existingCandidates,
      state.regulatory_cursor,
      context,
      activeConfigs,
    );
    snippets.push(...scanResult.snippets);

    if (scanResult.newCandidates.length === 0) {
      return {
        regulatory_snippets: [...(state.regulatory_snippets ?? []), ...snippets],
        regulatory_candidates: scanResult.combinedCandidates,
        regulatory_cursor: scanResult.cursor,
      };
    }

    const extractResult = await runRegulatoryExtract(
      scanResult.newCandidates,
      existingDocuments,
      context,
    );
    snippets.push(...extractResult.snippets);

    if (extractResult.newDocuments.length === 0) {
      return {
        regulatory_snippets: [...(state.regulatory_snippets ?? []), ...snippets],
        regulatory_candidates: scanResult.combinedCandidates,
        regulatory_documents: extractResult.combinedDocuments,
        regulatory_cursor: scanResult.cursor,
      };
    }

    const generationResult = await runRuleGeneration(
      extractResult.newDocuments,
      existingProposals,
      context,
    );
    snippets.push(...generationResult.snippets);

    const versioningResult = await runRuleVersioning(
      generationResult.newProposals,
      extractResult.newDocuments,
      context,
    );
    snippets.push(...versioningResult.snippets);

    const combinedCandidates = scanResult.combinedCandidates;
    const combinedDocuments = mergeByUrl(
      extractResult.combinedDocuments,
      versioningResult.persistedDocuments,
    );
    const combinedProposals = mergeProposals(
      generationResult.combinedProposals,
      versioningResult.persistedProposals,
    );
    const combinedVersions = mergeVersions(existingVersions, versioningResult.versions);

    return {
      regulatory_snippets: [...(state.regulatory_snippets ?? []), ...snippets],
      regulatory_candidates: combinedCandidates,
      regulatory_documents: combinedDocuments,
      rule_proposals: combinedProposals,
      regulatory_versions: combinedVersions,
      regulatory_cursor: scanResult.cursor,
    };
  } catch (error: unknown) {
    const normalizedMessage = error instanceof Error ? error.message : "Unknown";
    const message =
      error instanceof TavilyConfigError
        ? "Tavily API key not configured; skipping regulatory scan."
        : `Regulatory agent encountered an error: ${normalizedMessage}`;

    const errorSnippet = makeSnippet(`regulatory_error_${Date.now()}`, message, undefined, "error");
    snippets.push(errorSnippet);

    await emitEvent(context, "on_error", "regulatory", { message });
    await recordAgentRun(context, "regulatory", "error", { message });

    return {
      regulatory_snippets: [...(state.regulatory_snippets ?? []), ...snippets],
    };
  }
}
