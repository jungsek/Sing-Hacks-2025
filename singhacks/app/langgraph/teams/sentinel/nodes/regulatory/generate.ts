import type {
  RegulatoryDocument,
  RegulatorySnippet,
  RuleProposal,
} from "@/app/langgraph/common/state";

import { emitEvent, recordAgentRun } from "./events";
import type { RegulatoryNodeContext } from "./types";
import {
  extractCriteria,
  extractEffectiveDate,
  hashContent,
  makeRuleId,
  makeSnippet,
  mergeProposals,
} from "./utils";

export async function runRuleGeneration(
  documents: RegulatoryDocument[],
  existingProposals: RuleProposal[],
  context: RegulatoryNodeContext,
): Promise<{
  newProposals: RuleProposal[];
  combinedProposals: RuleProposal[];
  snippets: RegulatorySnippet[];
}> {
  const snippets: RegulatorySnippet[] = [];
  if (documents.length === 0) {
    return { newProposals: [], combinedProposals: existingProposals, snippets };
  }

  await emitEvent(context, "on_node_start", "rule_generate", {
    document_count: documents.length,
  });
  await recordAgentRun(context, "rule_generate", "start", { document_count: documents.length });

  const newProposals: RuleProposal[] = [];

  for (const doc of documents) {
    const contentHash = hashContent(doc.content);
    const proposalId = makeRuleId(doc.regulator, doc.url);
    const existing = existingProposals.find((proposal) => proposal.id === proposalId);
    if (existing && existing.diff?.content_hash === contentHash) {
      continue;
    }

    const criteria = extractCriteria(doc.content);
    const summary = doc.content.slice(0, 400).replace(/\s+/g, " ");
    const effectiveDate = extractEffectiveDate(doc.content);

    const proposal: RuleProposal = {
      id: proposalId,
      regulator: doc.regulator ?? "Unknown",
      document_url: doc.url,
      document_title: doc.title,
      status: "pending_approval",
      summary,
      effective_date: effectiveDate,
      criteria: criteria.map((criterion) => ({
        ...criterion,
        rationale: doc.title,
      })),
      diff: {
        content_hash: contentHash,
        generated_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    };

    newProposals.push(proposal);
    snippets.push(
      makeSnippet(
        proposalId,
        `Draft rule proposal prepared for ${proposal.regulator} source "${doc.title ?? doc.url}".`,
        doc.url,
        "success",
      ),
    );
  }

  const combinedProposals = mergeProposals(existingProposals, newProposals);

  await emitEvent(context, "on_node_end", "rule_generate", {
    proposals_total: combinedProposals.length,
    proposals_new: newProposals.length,
  });
  await recordAgentRun(context, "rule_generate", "end", {
    proposals_total: combinedProposals.length,
    proposals_new: newProposals.length,
  });

  return {
    newProposals,
    combinedProposals,
    snippets,
  };
}
