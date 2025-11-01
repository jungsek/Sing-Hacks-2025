# PRD — Agentic AI for Real‑Time AML Monitoring and Document & Image Corroboration

This PRD defines scope, users, workflows, functional and non‑functional requirements, and an implementation plan for two integrated agentic AI solutions aligned with our stack: Next.js (App Router), serverless route handlers, Supabase (Postgres + pgvector), LangGraph + LangChain orchestration, and Groq LLMs.

## 1) Summary

- Build two agentic systems that work together:
  - Part 1: Real‑Time AML Monitoring & Alerts (regulatory ingestion → rules → transaction monitoring → role‑based alerts → remediation + audit).
  - Part 2: Document & Image Corroboration (upload → OCR/extract → format/content checks → image forensics → risk report + audit).
- Multi‑agent orchestration with LangGraph routes events and tool calls; responses stream to the UI.
- Data persistence and RAG via Supabase (pgvector for embeddings, RLS for security).
- LLM calls via Groq; embeddings stored in Supabase vectors.

Success = demoable E2E flows, stable deployment, clear audit trail, and simple rules/validators that highlight value.

## 2) Goals and Non‑Goals

Goals
- Detect AML risks in near real‑time from transactions using configurable rules tied to regulatory guidance.
- Automate verification of compliance documents and supporting images with clear issues and a risk score.
- Provide role‑aware alerts (Front, Compliance, Legal) with remediation suggestions and a persistent audit trail.
- Stream agent reasoning/steps (safe, non‑sensitive version) to the UI for transparency.

Non‑Goals (MVP)
- Perfect regulatory coverage or exhaustive reverse image search across the web.
- Full case management system; we deliver a lightweight remediation flow and audit log.
- Enterprise SSO; use Supabase Auth or shared secret gating for admin actions.

## 3) Users and Personas (refined)

### 3.1 Relationship Manager (Front)
- Responsibilities: Serve clients; initiate/approve transactions; respond to alerts; collect follow-up docs from clients.
- Key decisions: Continue/hold transaction; request enhanced due diligence (EDD) docs; escalate to Compliance.
- Information needs: Plain-language alert summary, severity, rationale highlights, recommended actions, SLA/time sensitivity.
- Interactions: Receives real-time alerts; acknowledges and selects recommended action; attaches customer-provided documents.
- KPIs: Alert acknowledgment time, false-positive reduction, turnaround time to resolution.
- Pain points: Overload of noisy alerts; compliance jargon; unclear next steps.

### 3.2 Compliance Analyst (Operations & Regulatory Compliance)
- Responsibilities: Investigate alerts; perform document and image corroboration; file STR/SAR when needed; maintain auditability.
- Key decisions: Escalate vs close; request remediation; file reports; update rule weights/activation.
- Information needs: Full transaction context, rule hits + evidence, document analysis findings, prior history, regulatory citations.
- Interactions: Deep-dive alert view, document upload/analysis, rule management (toggle/weights), remediation workflow.
- KPIs: Time-to-resolution, investigation throughput, regulator query response time, audit completeness.
- Pain points: Fragmented data sources; manual checks; poor explainability.

### 3.3 Legal/Policy Team
- Responsibilities: Ensure regulatory alignment; author and version monitoring rules; respond to regulator inquiries.
- Key decisions: Approve rule changes; define escalation policies; validate audit trail sufficiency.
- Information needs: Traceability from rule → alert → decision; version history; sources and effective dates.
- Interactions: Rule versioning UI, regulatory ingestion review, audit log exports.
- KPIs: Policy coverage, regulator findings, change approval cycle time.
- Pain points: Unclear provenance of rules; limited visibility to how rules drive alerts.

### 3.4 Admin/Builder (Platform)
- Responsibilities: Configure environments; manage data sources; observe system health; manage user roles.
- Key decisions: Enable features; set rate limits/quotas; choose runtimes for heavy tasks.
- Information needs: System metrics, error rates, queue backlogs, token/latency budgets.
- Interactions: Admin dashboard, feature flags, API keys, storage management.
- KPIs: Uptime, latency SLOs, ingestion reliability.

### 3.5 Stakeholder relationship diagram

```
         ┌───────────────────────────────────────────┐
         │ External Inputs                           │
         │  • Transactions (CSV/stream)              │
         │  • Docs & Images (uploads)                │
         │  • Regulatory Sources (MAS/FINMA/HKMA)    │
         └───────────────────────────────────────────┘
                 │
                 ▼
     ┌────────────────────────────────────────────────────────────┐
     │ Agentic Platform (Next.js + LangGraph + Supabase + Groq)  │
     │  • Rules/Anomaly Agents  • OCR/Format/Image Agents        │
     │  • Orchestrator  • Retrieval/RAG  • Approval Gate         │
     └────────────────────────────────────────────────────────────┘
       │                 │                        │
       │ Alerts          │ Findings/Reports       │ Rule Versions
       ▼                 ▼                        ▼
 ┌────────────────┐   ┌───────────────────────┐   ┌───────────────────┐
 │ Front (RMs)    │   │ Compliance (Ops/Reg) │   │ Legal/Policy      │
 │ • Real-time    │   │ • Investigate alerts │   │ • Approve rules   │
 │   alert digest │   │ • Analyze docs/images│   │ • Audit & exports │
 │ • Take action  │   │ • File STR/SAR       │   │ • Reg. responses  │
 └────────────────┘   └───────────────────────┘   └───────────────────┘
       ▲                 │                        ▲
       │ Acks/Actions    │ Escalations/Decisions  │ Approvals/Policies
       └─────────────────┴────────────────────────┘
             │
            ┌───────────────┐
            │ Admin/Builder │
            │ • Ops metrics │
            │ • Feature flags│
            └───────────────┘
```

## 4) Detailed User Journeys and Flows

### 4.1 RM — Real‑Time Alert Handling (happy path)
- Trigger: New transaction evaluated (or updated) produces an alert with severity ≥ Medium.
- Preconditions: RM is assigned to the client/account; RM has UI access.
- Steps
  1. RM receives a concise alert card: severity, reason highlights, “Why flagged” bullets, recommended actions.
  2. RM clicks “Review” → sees transaction snapshot and minimal jargon rationale; optional “Request Docs” button.
  3. RM chooses an action: “Hold and escalate to Compliance” or “Proceed with EDD docs request”.
  4. System records acknowledgment and action; notifies Compliance queue if escalated.
  5. Audit log captures user, timestamp, alert id, selected action.
- Postconditions: Alert status transitions to Acknowledged or Escalated; SLA timers start.
- Alternate flows: RM disputes alert → adds comment; RM uploads client docs directly to the case.

### 4.2 Compliance — Investigation & Resolution
- Trigger: Escalated alert or queue review of High/Critical alerts.
- Preconditions: Access to alert detail, documents, and history.
- Steps
  1. Opens alert detail with tabs: Transaction, Rules Hit (explainability), History, Documents, Related Cases.
  2. Runs “Document & Image Analysis” if new docs are attached (calls OCR/Format/Image agents, results streamed).
  3. Reviews consolidated risk score (transaction + documents cross‑reference), browses citations to regulations.
  4. Chooses remediation: “Close (no issue)”, “Request more docs”, “File STR/SAR”, “Block transaction”, “Update rule weight”.
  5. If side‑effectful action, Approval Gate prompts confirmation; decision recorded.
  6. Adds notes and final classification (false positive / true positive) with tags.
- Postconditions: Alert status updated; remediation actions persisted; audit trail complete.
- Alternate flows: Links multiple related alerts; merges duplicates; schedules follow‑up review.

### 4.3 Legal/Policy — Rule Lifecycle & Audit Readiness
- Trigger: New regulatory circular ingested; periodic rule review; regulator inquiry.
- Steps
  1. Reviews suggested rule updates with diffs, sources, effective dates.
  2. Approves/edits rules and activates version; impact analysis lists recent alerts that would be affected.
  3. Exports audit bundle: rule version → alert(s) → decisions with timestamps and evidence.
- Postconditions: Rule versions updated; approvals logged; traceability maintained.

### 4.4 Operations Analyst — Document Intake & Batch Monitoring
- Trigger: Backlog of client docs to process; scheduled transaction windows for re-evaluation.
- Steps
  1. Uploads documents in bulk; monitors ingestion and analysis status.
  2. Requests batch re-evaluation of transactions (e.g., after rule updates).
  3. Reviews generated alerts and assigns to RMs/Compliance as needed.
- Postconditions: Documents analyzed; alerts created or updated; workload queued appropriately.

### 4.5 Cross‑Persona End‑to‑End Flow (Swimlane ASCII)

```
RM            | Compliance        | Legal/Policy      | System (Agents)             | Data
--------------+-------------------+-------------------+-----------------------------+---------------------------
Receive alert |                   |                   | Evaluate txn via rules      | alerts, rules, transactions
Review & act  |                   |                   | Stream rationale/score      | agent_runs, messages
Escalate ---> | Intake case       |                   |                             | alerts(status=Escalated)
              | Run doc analysis  |                   | OCR/Format/Image agents     | documents, chunks, images
              | Decide remediation|                   | Approval Gate if needed     | remediation_actions
              | Close/File STR    |                   |                             | audit_logs
              | <--- Provide cite | Review/approve    | Regulatory ingestion        | rule_versions
Ack outcome <-|                   |                   | Update severity if docs     | alerts(updated)
```

### 4.6 Data touchpoints per journey
- RM: reads alerts summary; writes acknowledgments and actions; may upload client docs.
- Compliance: reads full context; writes investigation notes, remediation, and final decision; triggers analyses.
- Legal: reads rule lineage; writes approvals/versions; exports audits.
- System: writes agent runs, document chunks, image check results; recalculates cross‑referenced scores.

## 5) Functional Requirements

### Part 1 — Real‑Time AML Monitoring

Regulatory Ingestion
- Ingest regulatory circulars/pages (manual upload or URL) and convert to structured rules with metadata (jurisdiction, regulator, effective date, version).
- Maintain rule versions and an audit of changes.

Transaction Analysis Engine
- Evaluate incoming transactions against active rules. Support at least: amount thresholds, jurisdiction risk, PEP indicator, travel rule completeness, sanctions screening, cash structuring patterns, KYC/EDD staleness, FX anomalies, SWIFT fields presence.
- Compute a risk score and severity label (Low/Medium/High/Critical) with explainability (rules triggered, weights, evidence links).

Alerts & Routing
- Create alert records with role routing: Front sees summarized context; Compliance sees full detail (transaction + rules + history + references to regulations).
- Priority queue for high severity; acknowledgment + status transitions tracked.

Remediation Workflows
- Provide recommended next steps (EDD, block/hold, request docs, escalate). Gate certain actions behind user confirmation.
- Persist workflow actions and comments; export a shareable report.

Audit Trail
- End‑to‑end logging of evaluations, alerts, decisions, rule versions applied, and document references.

### Part 2 — Document & Image Corroboration

Document Processing
- Accept PDFs, text/markdown, images. Extract text and metadata (OCR for scanned PDFs/images; MVP may use server‑side library and/or LLM‑Vision for small images where feasible).
- Chunk, embed, and store content in Supabase vectors for RAG.

Format/Content Validation
- Validate structural elements: required sections present, headers order, page count within range, date formats consistent.
- Formatting checks: double spacing, mixed fonts/sizes beyond tolerance, indentation consistency, suspicious copy/paste artifacts.
- Content checks: spelling/grammar issues, missing fields, inconsistent amounts/dates vs referenced values.

Image Analysis
- Baseline checks: EXIF metadata presence/inconsistencies, resolution anomalies, compression artifacts; optional ELA check.
- AI‑generated detection: pluggable provider; MVP flags if confidence is low or metadata suggests synthetic origins.
- Tampering signals: mismatched dimensions/EXIF timestamps, color channel anomalies (heuristics).

Risk Scoring & Reporting
- Score documents/images; show findings and evidence snippets with confidence.
- Generate a downloadable report; link it to related alerts and transactions.

### Integration
- Cross‑reference: Surface if the subject client/document was recently flagged; use combined score for final severity.
- Unified UI: Chat/agent view with artifacts (alerts, rules applied, sources, documents, and images) and approval prompts.

## 6) Non‑Functional Requirements

- Security: Supabase RLS on user‑owned data; server‑only secrets; PII minimization; audit logs immutable (append‑only pattern).
- Performance: Alert generation P95 < 2s for simple rules; document analysis may be async with status updates.
- Reliability: Idempotent ingestion and rule application; retries on transient failures.
- Observability: Node logs for each agent node with durations; basic metrics (alerts/hour, doc analysis latency).
- Accessibility: Keyboard‑navigable UI; readable contrast.

## 7) Architecture (Aligned with Current Repo)

Stack
- Next.js (App Router) serverless route handlers for APIs and SSE streaming.
- Supabase Postgres + pgvector for storage and embeddings; Supabase Auth for MVP gating.
- LangGraph + LangChain for orchestrating agents/tools; Groq for LLMs and embeddings.

Existing Code Anchors
- UI and APIs live in `singhacks/` with `app/`, `app/api/`, LangGraph scaffolding in `app/langgraph/agent`, and components in `components/` and `components/ai-elements/`.

High‑Level Diagram

```
User → Next.js UI (Chat + Panels)
      ↕ SSE/Web
      API Routes (serverless)
         ├─ /api/chat (LangGraph Orchestrator)
         ├─ /api/retrieval/ingest (document ingestion)
         ├─ /api/aml/transactions/ingest (CSV/stream)
         ├─ /api/aml/monitor (evaluate batch/stream)
         ├─ /api/alerts (CRUD, ack, status)
         ├─ /api/docs/upload | /api/docs/analyze | /api/reports/:id
         └─ /api/system/health

LangGraph (multi‑agent)
   Orchestrator → Retrieval → LLM → Tools (Rules Engine, Validators, Forensics) → Approval Gate → Formatter

Supabase (Postgres + pgvector)
   tables: rules, rule_versions, transactions, alerts, remediation_actions,
           documents, document_chunks, image_checks, conversations, messages,
           agent_runs, audit_logs
```

## 8) Multi‑Agent Orchestration

Agents (LangGraph nodes)
- Orchestrator: Entry point; routes intent: “monitoring” vs “document”. Streams updates to UI.
- Regulatory/RAG Agent: Retrieves regulatory snippets tied to rules for citations.
- Rules Engine Agent: Applies active rules to a transaction; returns rule hits, weights, score.
- Anomaly Agent: Heuristics for structuring (daily cash totals), FX spread, missing SWIFT fields.
- Alert Triage Agent: Calculates severity and routing; prepares role‑specific views.
- Remediation Agent: Suggests next actions; requires Approval Gate for any risky action.
- Document OCR/Extraction Agent: Extracts text/metadata; chunks + embeds.
- Format Validator Agent: Runs format/content checks; summarizes issues.
- Image Forensics Agent: Runs EXIF/heuristics; optional plugin callouts; returns signals.
- Report Agent: Composes findings with citations into a report artifact.

Streaming
- Use AsyncIterable from LangGraph across nodes; stream delta events to `/api/chat` SSE and render via existing AI components.

Guardrails
- Max steps/configurable timeouts; redact sensitive data from streamed reasoning; Approval Gate for side‑effectful actions.

## 9) Data Model (Supabase)

Core Tables (MVP columns)
- rules: id, name, description, jurisdiction, regulator, severity_weight, is_active, created_at.
- rule_versions: id, rule_id, version, source_url, effective_from, effective_to, diff, created_at.
- transactions: id, raw_json, booking_datetime, amount, currency, jurisdiction, customer_id, pep, kyc_due_date, cash_daily_total, sanctions_result, swift_fields, fx_applied_rate, fx_market_rate, fx_spread_bps, created_at.
- alerts: id, transaction_id, severity, score, rules_triggered jsonb, status, routed_to, acknowledged_by, acknowledged_at, created_at.
- remediation_actions: id, alert_id, action_type, status, actor_id, notes, created_at.
- documents: id, owner_id, title, type, source, meta jsonb, created_at.
- document_chunks: id, document_id, chunk_text, embedding vector, token_count, created_at.
- image_checks: id, document_id, file_name, exif jsonb, heuristics jsonb, ai_generated_score, created_at.
- conversations: id, title, owner_id, created_at.
- messages: id, conversation_id, role, content, metadata, created_at.
- agent_runs: id, conversation_id, graph_name, status, steps jsonb, created_at.
- audit_logs: id, actor_id, entity_type, entity_id, action, payload jsonb, created_at.

Indexes
- Vector index on document_chunks.embedding.
- B‑tree on alerts(transaction_id, severity), transactions(booking_datetime), rules(is_active, jurisdiction, regulator).

RLS (outline)
- Users may only access their conversations, documents, and messages.
- Alerts/transactions visible to authorized demo users; admin bypass via service role on server only.

## 10) API Surface (Next.js Route Handlers)

Existing routes to extend
- `singhacks/app/api/chat/route.ts`: orchestrator streaming endpoint.
- `singhacks/app/api/retrieval/ingest/route.ts`: document ingestion.

New routes (MVP)
- `app/api/aml/transactions/ingest/route.ts`
  - POST CSV or JSON; upsert to `transactions` with normalization.
- `app/api/aml/monitor/route.ts`
  - POST { transaction_ids? | window? | stream? } → evaluate rules, create alerts, return summary.
- `app/api/alerts/route.ts`
  - GET list; POST acknowledge/update status; GET/:id detail with rule hits and evidence.
- `app/api/docs/upload/route.ts`
  - POST file; store to Supabase Storage or DB; return document id.
- `app/api/docs/analyze/route.ts`
  - POST { document_id } → run validators and image checks; persist results.
- `app/api/reports/[id]/route.ts`
  - GET compiled report for alerts/doc analysis (PDF or JSON for MVP).

All endpoints run server‑side; some may require Node runtime if using libraries not supported at Edge.

## 11) Rules & Scoring (Initial Heuristics)

Scoring
- Base score = sum(weight_i × indicator_i) + cross‑reference bonus.
- Severity: Low < 30, Medium 30–59, High 60–84, Critical ≥ 85.

Indicators (examples mapped to provided CSV fields)
- Large amount by jurisdiction/product (amount, booking_jurisdiction, product_type) → weight 15–25 by threshold.
- PEP or High customer risk (customer_is_pep, customer_risk_profile) → 20–30.
- Travel rule incomplete (travel_rule_complete = FALSE) → 15.
- Sanctions screening not “none/match” or marked “potential” → 20.
- Cash structuring: daily_cash_total_customer > 10,000 or daily_cash_txn_count ≥ 3 (cash_deposit/withdrawal) → 15–25.
- KYC stale: now > kyc_due_date → 10–20; EDD required but not performed (edd_required && !edd_performed) → 15.
- FX anomaly: |fx_applied_rate − fx_market_rate| with fx_spread_bps > threshold → 10–20.
- SWIFT fields missing for MT103/202 (swift_f50_present, swift_f59_present, swift_f70_purpose) → 10–15.
- High‑risk corridors: suspicious originator/beneficiary countries pair list → 10–20.

Cross‑Reference Adjustments
- Recent document analysis = High/Fail → +10–20.
- Prior alerts within last N days → +5 per alert (cap +20).

Explainability
- Persist rule hits with human‑readable rationales and regulator references.

## 12) Document Validation Rules (Examples)

Structure
- Required sections: Parties, Property/Subject, Consideration/Amounts, Dates, Signatures/Annexes.
- Page count within 1–50 for MVP; flag extremes.

Formatting
- Mixed fonts/sizes > 3 unique combinations → warn; > 6 → fail.
- Double spacing or inconsistent line spacing > 15% lines → warn.
- Indentation/tab inconsistency across sections → warn.

Content
- Date formats inconsistent; amounts mismatch between summary and clauses; missing IDs or signatures.
- Spelling/grammar issues above threshold using LLM quick pass for highlights (bounded tokens).

Image Checks
- EXIF anomalies (missing camera info on a “photo”, timestamps in future/past mismatch) → warn/fail.
- Low resolution or heavy compression for supposed scans → warn.
- Optional ELA heuristic spike regions → investigate.

Scoring
- Each failure/warn contributes weighted points; map to Low/Medium/High risk.

## 13) UI/UX Requirements

- Chat‑centered experience using existing `ChatWindow` and `ai-elements` to render steps, sources, and artifacts.
- Alerts pane with filters (severity, status, role) and quick acknowledgment.
- Document upload and analysis status; clickable findings with evidence snippets and inline citations.
- Approval modal for risky actions (tool calls gated by user confirmation).

## 14) Observability, Security, Compliance

Observability
- Log node start/end, durations, errors; store summarized traces in `agent_runs`.
- Metrics: alerts created per hour, average analysis latency, LLM token usage (approx).

Security & Privacy
- Supabase RLS on user data; server‑only usage of service role key; no secrets in client.
- Minimal PII in prompts; redact in streamed messages.
- Append‑only audit logs; signed (server‑generated) timestamps.

## 15) Acceptance Criteria

Monitoring (Part 1)
- Can ingest provided CSV into `transactions` and process a batch, generating alerts with scores and rationales.
- Role‑based views render in UI with streaming reasoning; acknowledgment updates status and audit log.
- Remediation suggestions presented; approvals required for any side‑effectful action (simulated for MVP).

Documents (Part 2)
- Upload PDF + images; analysis produces a findings list and risk score within the UI.
- Downloadable JSON/HTML report contains sections, issues, and citations.

Integration
- An alert references a related document analysis with score impact.
- All actions visible in an audit trail.

## 16) Milestones (mirrors HACKATHON_PLAN.md)

- Day 1: Scaffold UI + chat; Supabase setup; LangGraph skeleton; `/api/chat` streaming; basic ingestion endpoints.
- Day 2: Vector pipeline; retrieval node; transaction rules engine MVP; document validators; persistence; approvals.
- Day 3: UI polish; audit logs; performance pass; deploy to Vercel; demo script + fallback plan.

## 17) Dependencies & Environment

- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- GROQ_API_KEY
- Optional: PDF/OCR libraries (Node runtime route if required), image metadata libs.

## 18) Risks and Mitigations

- LLM latency/quotas → cache embeddings, batch operations, provide fallback providers.
- Edge vs Node runtime constraints → place heavy libs behind Node runtime routes.
- Image forensics accuracy → position as heuristics with manual review prompts; pluggable providers later.

## 19) Open Questions

- Which regulators prioritized for ingestion demo (MAS, FINMA, HKMA examples)?
- Thresholds for High‑risk corridors list for MVP?
- Preferred PDF OCR approach (LLM vision vs library) within quota/time constraints?

## 20) Implementation Traceability (Repo Pointers)

- UI: `singhacks/app/`, components under `singhacks/components/` and `singhacks/components/ai-elements/`.
- Orchestration: `singhacks/app/langgraph/agent/` and `singhacks/app/api/chat/route.ts`.
- Retrieval & Ingestion: `singhacks/app/api/retrieval/ingest/route.ts` (extend); add AML routes under `singhacks/app/api/aml/...`.
- Supabase helpers: `singhacks/lib/supabase/`.
- Agent base/types: `singhacks/lib/agents/`.

This PRD aligns with the existing plan and repository layout and can be iterated as we implement and learn.
