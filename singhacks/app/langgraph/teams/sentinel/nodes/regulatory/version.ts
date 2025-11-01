import type {
  RegulatoryDocument,
  RegulatorySnippet,
  RegulatoryVersionRecord,
  RuleProposal,
} from "@/app/langgraph/common/state";
import { insertDocumentChunks } from "@/lib/supabase/dao/documentChunks";
import { upsertRegulatoryDocument } from "@/lib/supabase/dao/documents";
import { createRuleVersion } from "@/lib/supabase/dao/ruleVersions";

import { emitEvent, recordAgentRun } from "./events";
import type { RegulatoryNodeContext } from "./types";
import { chunkText, hashContent, makeSnippet } from "./utils";

export async function runRuleVersioning(
  proposals: RuleProposal[],
  documents: RegulatoryDocument[],
  context: RegulatoryNodeContext,
): Promise<{
  persistedProposals: RuleProposal[];
  persistedDocuments: RegulatoryDocument[];
  versions: RegulatoryVersionRecord[];
  snippets: RegulatorySnippet[];
}> {
  const snippets: RegulatorySnippet[] = [];
  if (proposals.length === 0) {
    return { persistedProposals: [], persistedDocuments: [], versions: [], snippets };
  }

  await emitEvent(context, "on_node_start", "rule_version", {
    proposal_count: proposals.length,
  });
  await recordAgentRun(context, "rule_version", "start", { proposal_count: proposals.length });

  const versions: RegulatoryVersionRecord[] = [];
  const persistedProposals: RuleProposal[] = [];
  const persistedDocuments: RegulatoryDocument[] = [];
  const documentsByUrl = new Map<string, RegulatoryDocument>();
  for (const doc of documents) {
    documentsByUrl.set(doc.url, doc);
  }

  for (const proposal of proposals) {
    if (proposal.rule_version_id) {
      continue;
    }
    const document = documentsByUrl.get(proposal.document_url);
    if (!document) continue;

    let documentId = document.document_id;
    const contentHash = proposal.diff?.content_hash ?? hashContent(document.content);

    if (!documentId) {
      try {
        const upserted = await upsertRegulatoryDocument({
          type: "regulatory",
          title: document.title,
          url: document.url,
          domain: (() => {
            try {
              return new URL(document.url).hostname;
            } catch {
              return undefined;
            }
          })(),
          published_at: document.published_at,
          meta: {
            ...document.meta,
            regulator: document.regulator,
            content_type: document.content_type,
            extracted_at: document.extracted_at,
            content_hash: contentHash,
          },
        });
        documentId = upserted?.id ?? undefined;
        if (documentId) {
          document.document_id = documentId;
          persistedDocuments.push(document);

          const chunks = chunkText(document.content);
          if (chunks.length > 0) {
            await insertDocumentChunks(
              chunks.slice(0, 30).map((text, index) => ({
                document_id: documentId!,
                text,
                tags: document.tags,
                meta: {
                  regulator: document.regulator,
                  source_url: document.url,
                  chunk_index: index,
                  content_hash: contentHash,
                },
              })),
            );
          }
        }
      } catch (err) {
        snippets.push(
          makeSnippet(
            `reg_version_doc_error_${proposal.id}`,
            `Failed to upsert regulatory document for ${proposal.document_url}: ${(err as Error).message}`,
            proposal.document_url,
            "warning",
          ),
        );
        continue;
      }
    }

    if (!documentId) continue;

    try {
      const insertResult = await createRuleVersion({
        document_id: documentId,
        regulator: proposal.regulator,
        status: "pending_approval",
        rule_json: {
          id: proposal.id,
          summary: proposal.summary,
          criteria: proposal.criteria,
          regulator: proposal.regulator,
          document_url: proposal.document_url,
          document_title: proposal.document_title,
          effective_date: proposal.effective_date,
        },
        diff: proposal.diff,
        source_url: proposal.document_url,
        effective_date: proposal.effective_date,
      });

      if (insertResult?.id) {
        proposal.rule_version_id = insertResult.id;
        proposal.document_id = documentId;
        proposal.status = "pending_approval";
        persistedProposals.push(proposal);

        versions.push({
          rule_version_id: insertResult.id,
          rule_id: proposal.id,
          document_id: documentId,
          status: "pending_approval",
          regulator: proposal.regulator,
          source_url: proposal.document_url,
          effective_date: proposal.effective_date,
          created_at: new Date().toISOString(),
        });

        snippets.push(
          makeSnippet(
            `reg_version_${insertResult.id}`,
            `Persisted draft rule version ${insertResult.id} for ${proposal.regulator}.`,
            proposal.document_url,
            "success",
          ),
        );
      }
    } catch (err) {
      snippets.push(
        makeSnippet(
          `reg_version_error_${proposal.id}`,
          `Failed to create rule version for ${proposal.id}: ${(err as Error).message}`,
          proposal.document_url,
          "warning",
        ),
      );
    }
  }

  await emitEvent(context, "on_node_end", "rule_version", {
    versions_created: versions.length,
  });
  await recordAgentRun(context, "rule_version", "end", {
    versions_created: versions.length,
  });

  return {
    persistedProposals,
    persistedDocuments,
    versions,
    snippets,
  };
}
