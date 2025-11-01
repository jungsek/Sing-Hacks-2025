import type { TransactionRecord } from "@/lib/supabase/dao/transactions";
import type { SerializableRecord } from "@/lib/types";

// Base shared state types for LangGraph teams

export type RuleHit = {
  rule_id: string;
  rationale: string;
  weight: number;
};

export type RegulatorySnippet = {
  rule_id: string;
  text: string;
  source_url?: string;
  level?: "info" | "success" | "warning" | "error";
};

export type RegulatoryCandidate = {
  url: string;
  title?: string;
  summary?: string;
  published_at?: string;
  query?: string;
  source?: string;
  regulator?: string;
  domain?: string;
  source_hash?: string;
  listing_topic?: string;
  listing_content_type?: string;
  // Optional bag for provider-specific or scan-time details
  metadata?: SerializableRecord;
};

export type RegulatoryDocument = {
  url: string;
  title?: string;
  content: string;
  content_type?: "html" | "pdf" | "unknown";
  extracted_at: string;
  regulator?: string;
  published_at?: string;
  document_id?: string;
  tags?: string[];
  meta?: SerializableRecord;
};

export type RuleProposal = {
  id: string;
  regulator: string;
  document_url: string;
  document_title?: string;
  document_id?: string;
  rule_version_id?: string;
  status: "draft" | "pending_approval" | "approved" | "rejected";
  summary: string;
  effective_date?: string;
  criteria: Array<{
    type?: string;
    field?: string;
    requirement: string;
    rationale?: string;
  }>;
  diff?: SerializableRecord;
  created_at?: string;
};

export type RegulatoryVersionRecord = {
  rule_version_id: string;
  rule_id: string;
  document_id?: string;
  status: "pending_approval" | "approved" | "rejected";
  regulator?: string;
  source_url?: string;
  effective_date?: string;
  created_at?: string;
};

export type SentinelAlert = {
  id: string;
  severity: string;
  json?: SerializableRecord;
};

export type SentinelState = {
  transaction_id: string;
  transaction?: TransactionRecord;
  rule_hits: RuleHit[];
  regulatory_snippets?: RegulatorySnippet[];
  regulatory_candidates?: RegulatoryCandidate[];
  regulatory_documents?: RegulatoryDocument[];
  rule_proposals?: RuleProposal[];
  regulatory_versions?: RegulatoryVersionRecord[];
  score: number;
  alert?: SentinelAlert;
  regulatory_cursor?: string;
  // how transaction analysis was produced
  transaction_analysis_origin?: string;
  transaction_analysis_model?: string;
};

// Reserved for future use
export type SupervisorState = Record<string, never>;
