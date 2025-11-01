# DOCUMENT_TEAM_PLAN — Veritas (Document & Image Corroboration)

This plan operationalizes Workflow 2 from the PRD and LangGraph Integration: Document & Image Corroboration via the Veritas team. It details scope, architecture, routes, nodes, tools, data, SSE streaming, scoring, testing, and milestones.

---

## 1) Scope and Objectives

Goals

- Accept and process PDFs, text/markdown, and images.
- Extract structured content, run format/content checks, perform image forensics.
- Compute a risk score and generate a persisted report artifact with an audit trail.
- Stream uniform SSE events to the UI during processing.

Non‑Goals (MVP)

- Full web-wide reverse image search; use optional providers when keys exist.
- Heavy OCR for large scans beyond server budget; use pragmatic fallbacks.

---

## 2) End-to-End Workflow (Flow 1)

Flow

1. User uploads document → returns a `document_id`.
2. Analyze: Veritas graph starts with Document Processing Agent.
3. Parallel: Format Validation Agent and Image Analysis Agent.
4. Risk Assessment Agent aggregates findings → computes risk score/level.
5. Persist report, image checks, and agent run; stream artifacts and summary.

SSE Events (uniform schema from `app/langgraph/common/events.ts`)

- on_node_start/on_node_end: with `{ graph: 'veritas', node, ... }`.
- on_tool_call: emit tool usage (llamaParse, exif, ELA, embedding batch, etc.).
- on_artifact: stream intermediate and final artifacts (chunks, findings, report).
- on_error: standardized failure payloads.

ASCII sequence

```
Client → /api/docs/upload → document_id
Client → /api/docs/analyze { document_id, stream: true }
SSE: start(doc-processing) → tool(ocr/parse) → end(doc-processing)
SSE: start(format-validator) | start(image-forensics) [parallel]
SSE: tool(fonts/spacing) | tool(exif/ela)
SSE: end(format-validator) | end(image-forensics)
SSE: start(risk-assessment) → artifact(report) → end(risk-assessment)
```

---

## 3) API Surface (Next.js App Router)

- `app/api/docs/upload/route.ts` (Node runtime)

  - POST multipart form-data: file, optional metadata.
  - Stores file (Supabase Storage or DB), creates `documents` row, returns `{ document_id }`.
  - Validates MIME type; extracts basic metadata (filename, size, type, hash).

- `app/api/docs/analyze/route.ts` (Node runtime; SSE)

  - POST `{ document_id: string, stream?: boolean }`.
  - Starts Veritas graph; streams SSE events using `common/stream.ts`.
  - Returns final report artifact and persisted IDs when `stream=false`.

- Optional: `app/api/reports/[id]/route.ts`
  - GET returns stored JSON/HTML report for a given analysis/run/document.

Auth & RLS

- Server-only secrets; service role only within server handlers.
- Documents readable by owner/authenticated demo users per RLS policies.

---

## 4) Repo Structure (additions)

- Graphs and nodes

  - `singhacks/app/langgraph/teams/veritas/index.ts`
  - `singhacks/app/langgraph/teams/veritas/nodes/doc-processing.ts`
  - `singhacks/app/langgraph/teams/veritas/nodes/format-validator.ts`
  - `singhacks/app/langgraph/teams/veritas/nodes/image-forensics.ts`
  - `singhacks/app/langgraph/teams/veritas/nodes/risk-assessment.ts`

- Common (reused)

  - `singhacks/app/langgraph/common/{state.ts,events.ts,stream.ts}`

- Tools & integrations

  - `singhacks/app/langgraph/tools/{llamaparse.ts,image.ts,retrieval.ts,embeddings.ts,supabase.ts,ethos.ts}`

- API routes

  - `singhacks/app/api/docs/upload/route.ts`
  - `singhacks/app/api/docs/analyze/route.ts`

- Supabase DAOs
  - `singhacks/lib/supabase/dao/{documents.ts,documentChunks.ts,image_checks.ts,agentRuns.ts}`

---

## 5) LangGraph Design (Veritas)

State (`VeritasState`)

- document_id: string
- text?: string
- chunks?: Array<{ id: string; text: string }>
- format_findings?: { issues: Finding[]; metrics: Record<string, any> }
- image_findings?: { files: ImageFinding[]; summary: string }
- risk: { score: number; level: 'Low' | 'Medium' | 'High' | 'Critical' }
- report?: { id?: string; markdown: string; json: any }

Nodes

1. Document Processing Agent (`doc-processing.ts`)

   - Inputs: `document_id`.
   - Tools:
     - `llamaParseExtract(document_id)` → robust PDF/text extraction; returns { text, metadata, sections }.
     - Fallback: `pdfParse(buffer)` or `pdfjs` for text; for images: lightweight OCR optional (bounded size) or pass-through metadata.
     - `chunkAndEmbed(text)` → chunk by semantic/size; dedupe via content hash; batch embeddings with `embeddings.ts`; insert `document_chunks`.
   - Outputs: `text`, `chunks`, basic `format_metrics` (pages, sections, tokens).
   - Events: on_tool_call for each tool; artifact for chunk stats summary.

2. Format Validation Agent (`format-validator.ts`)

   - Inputs: `text`, `chunks`.
   - Checks (hybrid heuristics + LLM structured):
     - Formatting: double spacing %, font families/sizes variance, inconsistent indentation/tab width, excessive capitalization.
     - Structure: required sections present; headers order; page count range; date formats.
     - Content: spelling/grammar pass; missing fields; inconsistent amounts/dates across sections.
     - Template matching: compare against known templates; Levenshtein/regex for section anchors.
   - Tools/Libs:
     - Heuristics: simple regex/text stats; optional `pdf-lib` metadata; `spelling` via dictionary + LLM hints.
     - LLM: Groq with JSON schema output; enforce `ethos.ts` constraints.
   - Outputs: `format_findings`: [{ id, severity, message, evidence, location }], metrics.
   - Events: artifacts for key issues; emit citations if using template rules.

3. Image Analysis Agent (`image-forensics.ts`)

   - Inputs: extracted image buffers/paths from document or uploaded images.
   - Checks:
     - EXIF/metadata: camera model, timestamps, GPS consistency, missing data for claimed photo.
     - Compression/ELA: basic Error Level Analysis and JPEG quantization heuristics.
     - Authenticity: reverse image search via Bing Visual Search or TinEye (optional if API keys present).
     - AI-generated detection: optional provider (e.g., Hive/Clarifai/Reality Defender) behind feature flag.
   - Tools/Libs:
     - `exifr` or `exifreader` for EXIF; `sharp` for image preprocessing; simple ELA in `image.ts`.
   - Outputs: `image_findings`: per-file signals with confidences and summary.
   - Events: per-image artifacts; tool calls for reverse image search and EXIF.

4. Risk Assessment Agent (`risk-assessment.ts`)
   - Inputs: `format_findings`, `image_findings`, document metadata, previous alerts/doc scores (cross-ref optional).
   - Logic:
     - Score = Σ(weight_i × indicator_i) + cross-reference adjustments (see §9).
     - Map to level: Low < 30, Medium 30–59, High 60–84, Critical ≥ 85.
   - Outputs:
     - `report`: markdown + JSON with sections: Summary, Findings (format, image), Evidence Snippets, Recommendations.
     - Persistence: writes `documents` (type='report' or meta.report), `image_checks`, `agent_runs`, `audit_logs`.
   - Events: final `on_artifact` with `{ type: 'veritas_report', document_id, report_id, risk }`.

Graph Flow

- `doc-processing` → Parallel(`format-validator`, `image-forensics`) → `risk-assessment` → done.

Ethos Integration

- `ethos.ts` → `getEthos()` for prompt preamble and schema validation; include `ethosVersion` in first SSE event.

---

## 6) Tools (Implementations)

- `llamaparse.ts`

  - `llamaParseExtract(document_id)` fetches file bytes from storage, calls LlamaParse API; returns unified `{ text, metadata, blocks }` shape.
  - Fallback `pdfParse(buffer)` (server-only) when key/quota missing.

- `image.ts`

  - `checkExifData(buffer)` returns normalized EXIF and anomaly flags.
  - `basicELA(buffer)` computes ELA heatmap stats; return anomaly score (0–1) and regions summary.
  - `reverseImageSearch(buffer|url)` optional; provider pluggable via env; returns matches/confidence.
  - `detectAIGenerated(buffer)` optional; provider pluggable.

- `retrieval.ts`

  - Chunk+embed utilities; `searchEthos(query, boostTags:['ethos'])` for compliance prompts.

- `embeddings.ts`

  - Groq embeddings with OpenAI fallback; batch and retry; dedupe by content hash.

- `supabase.ts`

  - Thin DAO wrappers for `documents`, `document_chunks`, `image_checks`, `agent_runs`.

- `ethos.ts`
  - `getEthos()` returns `{ version, md, schema }` with in-memory cache, plus JSON schema validators.

---

## 7) Data Model (Supabase)

Tables (delta per PRD/LangGraph Integration)

- documents: add `type` enum values: `ethos`, `regulatory`, `report`.
- document_chunks: add `tags text[]` (e.g., ['ethos','policy'] or ['veritas','doc']).
- image_checks: `{ id, document_id, file_name, exif jsonb, heuristics jsonb, ai_generated_score, created_at }`.
- agent_runs: store `{ graph_name: 'veritas', status, steps }`.
- audit_logs: log `report_generated`, `ethos_published`.

Indexes

- Vector index on `document_chunks.embedding`.
- B-tree on `documents(type)`, `image_checks(document_id)`.

RLS (MVP)

- World-readable demo for `ethos`; documents and reports scoped to owner/auth.

---

## 8) Prompting & Schemas

- Format Validator JSON schema
  - fields: `issues[{ id, type:'format'|'content'|'structure'|'template', severity, message, evidence, location }]`, `metrics`.
- Risk Assessment output schema
  - fields: `risk{ score:number, level:string }`, `summary`, `recommendations[]`, `linkages{ alerts?:string[] }`.
- Validation
  - Use Zod or AJV against schemas; failures emit `on_error` and corrective prompts.
- Ethos Preamble
  - Insert brief from `ethos.md`; respect `ethos.schema.json` constraints (no hallucinated citations; include rule/version refs where applicable).

---

## 9) Scoring Model (Initial)

- Base weights
  - Format failures (High): 15–25 each; warnings: 5–10 each.
  - Structure missing required sections: 20 each.
  - Template mismatch: 10–20 depending on deviation score.
  - Image anomalies: EXIF mismatch 10–20; ELA spike 10–20; AI-generated high confidence 25–35.
- Cross-reference
  - Prior High/Fail doc for same client in 30 days: +10.
  - Related AML alert High/Critical in 14 days: +10–20.
- Severity mapping
  - Low < 30, Medium 30–59, High 60–84, Critical ≥ 85.

---

## 10) Streaming & UI

- Use `toSSE` from `common/events.ts` with `graph:'veritas'`.
- UI components
  - `ai-elements/plan.tsx` renders node plans and progress.
  - `ai-elements/sources.tsx` for citations (template rules, external sources).
  - `ai-elements/artifact.tsx` for final report artifact and per-image artifacts.
- First SSE event should include `{ ethosVersion }`.

---

## 11) Runtime & Performance

- Runtime: Node for PDF/image libraries.
- Memory: Stream parse where possible; avoid loading huge files entirely.
- Embeddings: Batch requests; dedupe via hash; backoff on rate limits.
- Timeouts: 10s per LLM/tool by default; circuit-break optional providers.
- Caching: LlamaParse results and embeddings by `document_id@hash`.

---

## 12) Security & Privacy

- Supabase RLS; server-only env secrets; no secrets to client.
- PII minimization in prompts; redact in streamed data.
- Append-only audit logs with server timestamps.

---

## 13) Testing Strategy

Unit

- `chunkAndEmbed` token/size bounds; dedupe by hash.
- Spacing/font/indent detectors; template matcher.
- EXIF parser and ELA heuristics across fixtures.
- Schema validation for LLM outputs.

Integration

- Upload → Analyze end-to-end with small PDFs/images.
- SSE milestones asserted: node start/end, tool calls, final artifact.
- Persistence checks: `documents`, `document_chunks`, `image_checks`, `agent_runs` written.

Fixtures

- Provided sample PDF (`requirements/Swiss_Home_Purchase_Agreement_Scanned_Noise_forparticipants.pdf`).
- Synthetic images with known EXIF and ELA anomalies.

---

## 14) Implementation Milestones

M0 — Scaffolding (0.5 day)

- Create Veritas graph folder and node stubs; wire SSE streaming and state types.
- Add DAOs and types; add routes placeholders.

M1 — Document Processing (1 day)

- Implement upload route and storage; LlamaParse + fallback; chunk+embed; persist chunks.
- Stream basic artifacts and metrics.

M2 — Validators & Image Forensics (1–1.5 days)

- Implement format validator heuristics + LLM structured output.
- Implement EXIF + ELA; optional reverse search if keys present.

M3 — Risk & Reporting (0.5–1 day)

- Implement scoring, markdown+JSON report, persistence, and final SSE artifact.
- UI hookup to render artifacts and findings.

M4 — Polish & Hardening (0.5 day)

- Add caching, retries, schema validation, RLS checks, and observability.

---

## 15) Acceptance Criteria

- Can upload a PDF/image; `/api/docs/analyze` streams node milestones and emits a final report artifact.
- Chunks embedded and searchable; `document_chunks` populated with tags.
- Image checks persisted with EXIF and heuristic signals.
- Risk score computed with level mapping; report stored and retrievable.

---

## 16) Risks & Mitigations

- Unreliable OCR/parse: Provide fallbacks and user-visible warnings; allow re-run.
- External API limits: Cache results; feature-flag optional providers.
- False positives in ELA: Present as heuristic with confidence bands.

---

## 17) Open Questions

- Should we generate downloadable PDF for the report in MVP or stick to JSON/HTML?
- Which AI-generated detection provider to standardize on if keys available?
- Storage choice for large images (DB vs Supabase Storage bucket) and retention policy.
