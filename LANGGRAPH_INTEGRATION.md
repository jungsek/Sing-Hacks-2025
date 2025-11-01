# LangGraph Integration Plan — Dual Entry Points (Sentinel & Veritas)

This plan implements two independent agent entry points (no Supervisor in MVP). A Supervisor/Orchestrator will be added later without breaking changes.

- Entry Point A — Team 1: AML Team “Sentinel/Sentry” (Real‑Time AML Monitoring)
- Entry Point B — Team 2: Document Team “Veritas” (Document & Image Corroboration)

SSE streaming emits uniform events for both graphs so the existing chat UI can render progress, sources, and artifacts.

---

## 1) API Surface (two independent entry points)

- `app/api/aml/monitor/route.ts` (Sentinel)

  - POST { transaction_ids?: string[] | string, window?: { from: string; to: string }, stream?: boolean }
  - Streams node events (SSE) and emits a final alert artifact per transaction.
  - Runtime: Edge preferred; fallback to Node for heavy DB ops.

- `app/api/docs/analyze/route.ts` (Veritas)

  - POST { document_id: string } | multipart upload path via `app/api/docs/upload/route.ts`
  - Streams node events (SSE) and emits a final report artifact with risk score.
  - Runtime: Node (PDF/image libraries).

- Keep `app/api/chat/route.ts` as-is for sandbox demos. A future Supervisor will route to Sentinel/Veritas.

---

## 2) Repo Structure (additions)

- Graphs and nodes

  - `singhacks/app/langgraph/teams/sentinel/index.ts`
  - `singhacks/app/langgraph/teams/sentinel/nodes/{regulatory.ts,transaction.ts,alert.ts}`
  - `singhacks/app/langgraph/teams/veritas/index.ts`
  - `singhacks/app/langgraph/teams/veritas/nodes/{doc-processing.ts,format-validator.ts,image-forensics.ts,risk-assessment.ts}`
  - Shared: `singhacks/app/langgraph/common/{state.ts,events.ts,stream.ts}`

- Tools and integrations

  - `singhacks/app/langgraph/tools/{supabase.ts,retrieval.ts,embeddings.ts,tavily.ts,llamaparse.ts,image.ts,ethos.ts}`

- API routes

  - `singhacks/app/api/aml/monitor/route.ts`
  - `singhacks/app/api/aml/transactions/ingest/route.ts` (CSV/JSON upsert)
  - `singhacks/app/api/docs/upload/route.ts`, `singhacks/app/api/docs/analyze/route.ts`
  - Reuse: `singhacks/app/api/retrieval/ingest/route.ts` for text/md ingestion

- Supabase DAOs
  - `singhacks/lib/supabase/dao/{transactions.ts,alerts.ts,documents.ts,documentChunks.ts,agentRuns.ts,ethos.ts}`

---

## 3) Shared State & Events

- `SupervisorState` (reserved for later; not used in MVP)
- `SentinelState`

  - transaction_id: string
  - transaction?: any
  - rule_hits: Array<{ rule_id: string; rationale: string; weight: number }>
  - regulatory_snippets?: Array<{ rule_id: string; text: string; source_url?: string }>
  - score: number
  - alert?: { id: string; severity: string; json: any }

- `VeritasState`

  - document_id: string
  - text?: string
  - chunks?: Array<{ id: string; text: string }>
  - format_findings?: any
  - image_findings?: any
  - risk: { score: number; level: string }
  - report?: { id?: string; markdown: string; json: any }

- Event schema (SSE)
  - on_node_start, on_node_end, on_tool_call, on_artifact, on_error
  - Payload includes: run_id, graph, node, ts, data

---

## 4) Team 1 — Sentinel/Sentry (AML Monitoring)

### Nodes

- Transaction Analysis Agent (`transaction.ts`)

  - Tools: `fetchTransaction(id)`, `applyRiskMatrix(txn)`, `detectStructuring(customerId)`
  - Output: `rule_hits`, `score`

- Regulatory Agent (`regulatory.ts`)

  - Tools: `regulatoryRetrieval(rule_ids|rationales)`, `web_citations(query)` via Tavily
  - Output: `regulatory_snippets` (text + citations)

- Alert Agent (`alert.ts`)
  - Tools: `generateAlert(data)` → writes to `alerts`, logs to `agent_runs`, emits SSE artifact
  - Output: `{ alert }`

### Flow

- Sequential: Transaction Analysis → (score ≥ threshold) Regulatory → Alert → Final summary
- Streaming: Emit rule hits, score, citations, persisted alert id

### Tools (Sentinel)

- `supabase.ts`: transactions, alerts, agent_runs DAO helpers
- `retrieval.ts`: Supabase pgvector store for regulatory documents
- `embeddings.ts`: Groq embeddings (fallback OpenAI)
- `tavily.ts`: external citations for missing coverage
- `ethos.ts`: Regulatory Ethos access (see Section 6)

---

## 5) Team 2 — Veritas (Document & Image Corroboration)

### Nodes

- Document Processing Agent (`doc-processing.ts`)

  - Tools: `llamaParseExtract(docId)` (LlamaParse), fallback `pdfParse(buffer)`
  - `chunkAndEmbed(text)` → store `document_chunks`

- Format Validation Agent (`format-validator.ts`)

  - LLM checklist with structured output over extracted text/chunks

- Image Analysis Agent (`image-forensics.ts`)

  - Tools: `checkExifData(buffer)`, `basicELA(buffer)`/compression heuristics
  - Optional: reverse image search with Bing Visual Search/TinEye API if keys available
  - Optional: AI-generated detection provider (pluggable)

- Risk Assessment Agent (`risk-assessment.ts`)
  - Aggregates findings, computes score/level, emits markdown/JSON report
  - Persists results to `documents`, `image_checks`, and `agent_runs`

### Flow

- Doc Processing → Parallel(Format Validation, Image Forensics) → Risk Assessment → Final report

### Tools (Veritas)

- `llamaparse.ts`, `image.ts`, `retrieval.ts`, `embeddings.ts`, `supabase.ts`
- Access to `ethos.ts` for compliance guardrails in prompts

---

## 6) Regulatory Compliance Ethos — Design & Maintenance

Question: How does the Regulatory Agent maintain a “regulatory compliance ethos” document that is accessible and understood by all other agents?

Answer: We publish and version a canonical Regulatory Compliance Ethos (RCE) as a pair of artifacts, persist them in Supabase, and expose thin tools for read-through access and prompt seeding.

### 6.1 Artifacts

- `ethos.md` (human-readable):

  - Principles (customer data handling, PII minimization, auditability)
  - Jurisdictional scope & regulator list (MAS, FINMA, HKMA, …)
  - Output constraints (no hallucinated citations, include rule/version refs)
  - Side-effect policy (Approval Gate required, dry-run defaults)

- `ethos.schema.json` (machine-readable):
  - JSON Schema defining: rule_hit record shape, alert payload contract, allowed tools per role, redaction rules
  - Enumerations for severity, routing roles, action types

### 6.2 Storage & Versioning

- Store as a `documents` row with `type = 'ethos'` and a `documents.meta` containing `version`, `jurisdictions`, `effective_from`
- Chunk `ethos.md` into `document_chunks` with `tags = ['ethos', 'policy']` for retrieval
- Maintain `rule_versions` linkage via a join table or `documents.meta.rule_version_ids`
- Optionally create `ethos_versions` (id, version, document_id, diff, created_at) for explicit version history

### 6.3 Access Patterns (for all agents)

- Tool: `getEthos()` in `ethos.ts`

  - Returns `{ version, md, schema }` and a lightweight cache for hot reads

- Prompt Composer integration

  - Each node prepends a system message snippet built from `ethos.md` (brief) and validates output shape against `ethos.schema.json`

- Retrieval Bias

  - `retrieval.ts` boosts `tags:['ethos']` when answering compliance/process questions

- Guard Node (Ethos Gate)
  - Optional middleware node `ethos_guard` validates outbound artifacts (alerts/reports) against the schema; on fail → emit corrective action or escalate for approval

### 6.4 Update Workflow

1. Regulatory ingestion updates rules/regulatory docs → Regulatory Agent drafts new `ethos.md` deltas
2. LLM-assisted summarization → human review (optional) → publish new `documents` version
3. Insert new chunks; link to affected `rule_versions`; write `audit_logs` entry
4. Broadcast an `on_artifact` event `{ type:'ethos_updated', version }`; warm cache

### 6.5 Discoverability

- All agents implement `ethos.requiredVersion()` check at startup and log a warning if behind
- `/api/aml/monitor` and `/api/docs/analyze` include current `ethosVersion` in first SSE event

---

## 7) Data Model (delta from PRD)

- Reuse existing tables; add where helpful:
  - documents: add `type` enum including `ethos`, `regulatory`, `report`
  - document_chunks: add `tags text[]`
  - image_checks: store `{ exif, heuristics, ai_generated_score }`
  - audit_logs: log `ethos_published`, `alert_created`, `report_generated`
  - (Optional) ethos_versions

Indexes

- Vector index on `document_chunks.embedding`
- B-tree on `documents(type)`, `alerts(transaction_id, severity)`

RLS (MVP)

- Ethos is world-readable for demo or readable by authenticated users; alerts/transactions/documents remain scoped

---

## 8) Streaming & UI

- Uniform SSE across both graphs with the same event verbs
- UI components already present under `components/ai-elements/*` render:
  - plan.tsx (node plans), sources.tsx (citations), artifact.tsx (alerts/reports), confirmation.tsx (future approval gate)

---

## 9) Web & Ingestion Integrations

- Tavily (Web Access)

  - `web_citations(query, k)` tool for Regulatory Agent when internal RAG lacks coverage

- LlamaParse (File & Document Ingestion)
  - Robust PDF extraction → normalize sections → chunk+embed to `document_chunks`
  - Fallback `pdf-parse` when quota limited; images handled via `image.ts`

---

## 10) Runtime & Performance

- Sentinel: Edge where possible; Node if complex DB queries are needed
- Veritas: Node (PDF/image)
- Batch embeddings; deduplicate `document_chunks` by content hash
- Cache regulatory retrievals per `rule_id@version`

---

## 11) Implementation Checklist (two entry points)

- Graphs

  - Build `teams/sentinel` and `teams/veritas` graphs; add `ethos_guard` middleware (optional)

- Tools

  - Implement `supabase`, `retrieval`, `embeddings`, `tavily`, `llamaparse`, `image`, `ethos`

- APIs

  - Create `/api/aml/monitor`, `/api/docs/upload`, `/api/docs/analyze`, and `/api/aml/transactions/ingest`
  - Stream events via shared `common/stream.ts`

- Data

  - Add `documents.type`, `document_chunks.tags`; create indexes and RLS policies
  - Seed initial `ethos.md` + `ethos.schema.json` as `documents(type='ethos')`

- Testing
  - Unit: risk matrix, structuring detector, format checklist, EXIF parser, ethos schema validation
  - Integration: POST to both endpoints; assert streamed milestones and DB side-effects

---

## 12) Later: Retrofit a Supervisor (Optional Phase 2)

- Add `app/langgraph/agent/supervisor.ts` with simple router → calls Sentinel or Veritas
- Introduce `/api/chat` unified endpoint while keeping dedicated endpoints intact
- No breaking change: the dedicated endpoints will continue to call their respective graphs directly
