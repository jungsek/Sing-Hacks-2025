# Transaction → Regulatory → Alert (Sentinel) — Execution Plan

This plan expands Flow 1 in the LangGraph Integration Plan into concrete UX, API, graph, state, streaming, data, and testing details. It keeps the dual-entry architecture, SSE streaming, and RCE (Regulatory Compliance Ethos) alignment.

---

## 0) TL;DR

- Trigger: User clicks “Run Live Transaction Analysis”.
- Ingest: CSV upload (server-parse) or existing transactions by window/ids.
- Graph: Transaction Analysis → (conditional) Regulatory → Alert → Final.
- Streaming: Uniform SSE events for progress, citations, and artifacts.
- Persistence: All node outputs and artifacts tracked in Supabase (transactions, alerts, agent_runs, documents, document_chunks).
- RAG: Yes for regulatory context. RCE and regulatory docs chunked + embedded; boosted in retrieval.

---

## 1) UX Trigger & Entry API

- UI button triggers POST to `/app/api/aml/monitor/route.ts` with one of:
  - `{ transaction_ids: string[]; stream: true }`
  - `{ window: { from: ISO8601; to: ISO8601 }; stream: true }`
  - Or after CSV upload: `{ ingest_job_id: string; stream: true }`
- First SSE event includes `{ graph: 'sentinel', ethosVersion }`.
- UI renders node-by-node progress, rule hits, citations, and final alert artifacts with “View details” affordance.

---

## 2) Ingestion: CSV → Transactions

Two modes supported for MVP.

A) Pre-existing data

- Use `window` or `transaction_ids` to fetch from `transactions` via DAO.

B) CSV upload (recommended demo path)

- Endpoint: `app/api/aml/transactions/ingest/route.ts`
- Request: multipart/form-data with CSV file.
- Server-side streaming parse (Node runtime):
  - Parse rows as stream, validate schema, compute `content_hash` for dedupe.
  - Upsert in batches (e.g., 500 rows) into `transactions` with idempotent keys.
  - Store an `ingest_job` row (local table or `agent_runs` with `type='ingest'`) to track counts and errors.
  - Response: `{ ingest_job_id }`.
- Monitor begins analysis by referencing `ingest_job_id` to iterate newly inserted transaction ids in arrival order.

Backpressure & ordering

- Maintain an in-memory queue per request (bounded, e.g., 1k). For larger loads, page by updated_at/id.
- Emit `on_tool_call` during CSV parse and per-batch upsert; include counts for UI progress.

---

## 3) Graph Wiring (Sentinel)

Nodes

1. Transaction Analysis Agent (`transaction.ts`)
2. Regulatory Agent (`regulatory.ts`) [conditional]
3. Alert Agent (`alert.ts`)

Control Flow

- Transaction → if `score >= THRESHOLD` → Regulatory → Alert → Final
- Transaction → if `score < THRESHOLD` → Final (no alert); still emit node_end + summary

Suggested thresholds

- THRESHOLD for regulatory enrichment: 0.65 (tunable)
- Alert severity from final score: Low < 0.4, Medium 0.4–0.7, High > 0.7

---

## 4) Shared State (SentinelState)

- `transaction_id: string`
- `transaction?: any`
- `rule_hits: Array<{ rule_id: string; rationale: string; weight: number; evidence?: any }>`
- `regulatory_snippets?: Array<{ rule_id: string; text: string; source_url?: string }>`
- `score: number` (0..1)
- `alert?: { id: string; severity: 'low'|'medium'|'high'; json: any }`

Ethos

- `ethos.requiredVersion()` checked at run start; include version in first SSE event.
- Optional `ethos_guard` validates outbound artifacts to `ethos.schema.json`.

---

## 5) Transaction Analysis Agent (Node 1)

Responsibilities

- Real-time rule evaluation over each transaction.
- Behavioral analysis across customer history (velocity, structuring, counterparty graph hints).
- Risk scoring aggregation and streaming interim findings.

Tools

- `fetchTransaction(id)` → DAO `transactions.getById`
- `applyRiskMatrix(txn)` → deterministic feature scoring
- `detectStructuring(customerId, window)` → sliding-window aggregation; burst detection

Heuristics (examples)

- Amount thresholds by KYC tier and corridor.
- Velocity: N txns in T minutes/hours.
- Smurfing/structuring: many small deposits/withdrawals near thresholds.
- High-risk corridors/jurisdictions; sanctioned counterparties lists.
- Round-tripping: rapid in-out with similar amounts and parties.

Output

- `rule_hits`: list with `rule_id`, `rationale`, `weight` (0..1), optional evidence (counts, windows).
- `score`: normalized via weighted sum with caps and dampeners.

Streaming

- `on_node_start` with transaction metadata (redacted).
- `on_tool_call` for each heuristic fired (include partial score).
- `on_node_end` with `rule_hits` and `score`.

Performance

- Pre-fetch recent customer txn window in one query; reuse across multiple txns.
- Cache customer risk profile for session.

---

## 6) Regulatory Agent (Node 2, conditional)

When invoked

- Only for transactions with `score >= THRESHOLD` or any `rule_hit` requiring citation.

RAG (answer to question: Should we use RAG?)

- Yes. Store RCE (`ethos.md`) and regulatory docs as vectors in `document_chunks` with `tags=['ethos','regulatory']`.
- Retrieval query built from `rule_hits.rationale` + `rule_id` + jurisdiction.
- Bias/boost chunks tagged `ethos` and matching jurisdiction; require top-2 ethos chunks in context.
- Fallback: `tavily` web citations for gaps (k=2) with source URLs.

Tools

- `regulatoryRetrieval(rule_ids|rationales, k)` → pgvector search with tag boosts.
- `web_citations(query)` → Tavily.

Output

- `regulatory_snippets`: [{ rule_id, text, source_url? }] with version/section markers.
- Stream citations via `on_tool_call` and `on_node_end`.

Guardrails

- No hallucinated citations; verify URL/section presence.
- Attach current `ethosVersion` to snippet metadata.

---

## 7) Alert Agent (Node 3)

Responsibilities

- Classify and persist alert; tailor multi-audience summaries; route by severity.

Severity mapping

- High: `score > 0.7` or any critical rule (e.g., sanctions hit).
- Medium: `0.4–0.7`.
- Low: `< 0.4` but with noteworthy patterns (optional triage as info).

Payload (persisted in `alerts` and recorded in `agent_runs`)

- `transaction_id, customer_id, score, severity, rule_hits, regulatory_snippets, rationale_summary, recommended_actions`
- `classifications`: [structuring | sanctions | velocity | corridor | round-tripping | other]
- `audience_summaries`: { front, compliance, legal }
- `ack`: { status: 'pending'|'acknowledged'|'closed', acked_by?, acked_at? }

Streaming & UI

- `on_artifact` emits a concise artifact:
  - Minimal fields: `alert_id, transaction_id, severity, score, top_rules`.
  - Frontend shows concise card with “Details” button → fetch full alert (future `/api/aml/alerts/[id]`).
- Separate SSE `on_node_end` with routing info: queues/channels used.

Routing

- High severity: immediate escalation (email/webhook/Slack optional), record in `audit_logs`.
- Medium: route to compliance queue; Low: route to front-office review.

Ethos Gate

- Validate alert JSON against `ethos.schema.json`; on failure emit corrective action or block with `on_error`.

---

## 8) Streaming Protocol (SSE)

Events

- `on_node_start`: `{ run_id, graph:'sentinel', node, ts, data }`
- `on_tool_call`: `{ run_id, node, tool, ts, data }`
- `on_node_end`: `{ run_id, node, ts, data }`
- `on_artifact`: `{ run_id, node, ts, type:'alert'|'ethos_updated', data }`
- `on_error`: `{ run_id, node?, ts, error }`

Client behavior

- Render rule hits incrementally; group by transaction id.
- For artifacts, render concise summary; lazy-load full details on demand.

---

## 9) Data Model & DAOs (reuse + light deltas)

Reuse existing DAOs in `singhacks/lib/supabase/dao/*`.

Tables

- `transactions`: upsert rows (id, customer_id, amount, currency, corridor, ts, ...)
- `alerts`: add fields if missing: `severity text`, `score float`, `classifications jsonb`, `audience_summaries jsonb`, `ack jsonb`.
- `agent_runs`: record each graph run and node boundaries with metadata.
- `documents` / `document_chunks`: ensure RCE and regulatory docs stored with tags/enums.
- `audit_logs`: events `alert_created`, `ethos_published`.

Indexes

- `alerts(transaction_id, severity)`, `documents(type)`, vector index on `document_chunks.embedding`.

RLS

- Alerts scoped to authenticated user/org; RCE world-readable or auth-only per demo mode.

---

## 10) Performance & Runtime

- Runtime: Edge for `/api/aml/monitor` when possible; Node fallback for heavy DAO and CSV mode.
- Batch DAO reads/writes; pool vector queries.
- Cache retrievals per `rule_id@version` in-memory for request session.
- Concurrency: analyze N transactions concurrently (e.g., 5–10) with ordering preserved per transaction stream.
- Backpressure: pause CSV reader when queue > threshold; resume on drain.

---

## 11) Observability & Testing

Telemetry

- Log timings per node; emit counters for `alerts_by_severity`, `citations_count`, `rce_cache_hits`.

Unit tests

- Risk matrix scoring; structuring detector windows; severity mapping; ethos schema validation.

Integration tests

- POST monitor with sample CSV; expect streamed milestones, at least one alert artifact, and persisted rows in `alerts`, `agent_runs`.

E2E (optional)

- Drive UI button → see live rule hits, an alert card, and ability to open details.

---

## 12) Rollout Plan

- Phase A: Implement ingest route + Transaction → Alert (no Regulatory) to validate streaming and severity.
- Phase B: Add Regulatory node with RAG over RCE + citations; wire Ethos Gate.
- Phase C: Audience summaries and routing integrations; ack workflow.
- Phase D: Hardening (indexes, cache, RLS), dashboard metrics.

---

## 13) Pseudocode (control flow sketch)

```
for txnId in source():
  emit(on_node_start, node='transaction')
  txn = fetchTransaction(txnId)
  hits, score = applyRiskMatrix(txn) + detectStructuring(txn.customer)
  emit(on_node_end, node='transaction', data={hits, score})

  if score >= THRESHOLD:
    emit(on_node_start, node='regulatory')
    snippets = regulatoryRetrieval(hits) + web_citations_if_needed(hits)
    emit(on_node_end, node='regulatory', data={snippets})
  else:
    snippets = []

  emit(on_node_start, node='alert')
  alert = generateAlert({txn, hits, score, snippets})
  persist(alert)
  emit(on_artifact, type='alert', data=minimal(alert))
  emit(on_node_end, node='alert', data={alert_id: alert.id})
```

---

## 14) Answer: RAG Usage

Yes. RAG is recommended to ground the Regulatory and Ethos context:

- Persist `ethos.md` and regulatory docs as vectors with tags and jurisdictions.
- Retrieve top-k snippets by `rule_id` and rationale; always include top ethos chunks.
- Validate citations and include section/version in outputs.
- Cache per `rule_id@version` to reduce cost and latency.
