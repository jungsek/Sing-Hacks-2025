# Transaction Agent Plan (Level 1 focus)

Date: 2025-11-01
Scope: Transaction monitoring workflow with emphasis on Level 1 data analysis. Outputs feed Level 2–5.

## Workflow levels (overview)

Level 3 — Final evaluation: aggregate L1 rule hits + L2 guidance into a final risk score with concise reasoning; streamed to drill-down UI and used for alerting.

### 1) Transactional factors (the "What")

---

## Level 2 — Regulatory cross-reference (transaction-aware)

Goal: Cross-reference a single transaction against curated regulatory sources and internal rule versions to surface relevant guidance, snippets, and draft rule proposals.

Data sources:

- Supabase table: `regulatory_sources` (columns: regulator_name, title, description, policy_url, regulatory_document_file, domain, published_date, last_updated_date)
- Internal artifacts: `documents`, `document_chunks`, `rule_versions`

Workflow:

- Query relevant regulatory sources by jurisdiction/regulator (e.g., `meta.regulator`, `booking_jurisdiction`).
- Summarize and extract actionable monitoring criteria (e.g., Travel Rule completeness, SWIFT mandatory fields) via LLM.
- Emit `regulatory_snippets[]` with concise citations and URLs for UI context.
- Maintain ingestion pipeline: crawl (MAS/FINMA/HKMA), extract plaintext (HTML/PDF), generate `rule_proposals[]`, and persist `rule_versions[]` with diff/version metadata.

Outputs:

- `regulatory_snippets[]` — short guidance items with optional `source_url` and `level`.
- Optional `rule_proposals[]` and `regulatory_versions[]` for governance trail.
- Cursor (`regulatory_cursor`) to support incremental ingestion windows.

Notes:

- Ingestion (external crawling) runs opportunistically; cross-reference always uses the latest stored sources.
- If LLM unavailable, return minimal snippets indicating skipped enrichment.

---

## Level 3 — Final evaluation and reasoning

Goal: Produce the final single-transaction assessment by combining Level 1 signals (`rule_hits`, preliminary `score`) with Level 2 context (`regulatory_snippets`, versions/proposals) into a refined score and concise reasoning paragraph.

Inputs:

- Level 1: `rule_hits[]`, preliminary `score`, model/origin
- Level 2: `regulatory_snippets[]` (and optionally proposals/versions)

Behavior:

- LLM-based aggregator computes `final_score ∈ [0,1]` (with dampening for many small hits) and returns a short rationale (<= 500 chars).
- Fallback numeric aggregation is used if LLM is unavailable.
- Stream an evaluation summary to the drill-down view; do not clutter the list feed.

Outputs:

- Updated `score` (final)
- Reasoning text streamed as part of agent tasks for the transaction detail page
- Used by alert node to assign severity and persist alert payload

---

## End-to-end flow and UX

1. CSV → LangGraph agent: each row posted to `/api/aml/monitor`.
2. Level 1 runs immediately and streams quick hits/score to the monitoring list.
3. Level 2 (cross-reference) + Level 3 (evaluation) run automatically in the background:

- Not shown in the streaming list feed
- Fully visible in the transaction drill-down (`/transactions/{id}`) with task logs and reasoning

4. Alert artifact persisted with final score, rule hits, and regulatory snippets.

---

## Next steps

- Parameterize thresholds by `booking_jurisdiction` and `product_type`.
- Add cross-row aggregations for velocity/structuring beyond same-day window.
- Enrich country risk via a maintained list or data service.
- Wire Level 4 collation pipeline after batch completion and integrate PDF report generation.
- Add per-regulator policy packs and test fixtures to verify cross-reference mappings.
- Question: How are funds being moved and how much?
- High-risk indicators:
  - Cash-based transactions (e.g., `cash_deposit`) — classic placement risk.
  - Cross-border wires — rapid movement for layering.
  - Structuring patterns — repetitive, similar amounts; round numbers (e.g., CHF 20,000); velocity across short windows.
  - Large single amounts inconsistent with profile (if profile available).
- Detection cues:
  - cash:large_cash_deposit
  - cash:velocity_structuring (count + sum per customer/day)
  - txn:large_amount (jurisdiction/model-specific thresholds)

### 2) Geographic factors (the "Where")

Fields: `originator_country`, `beneficiary_country`

- Question: Are parties in high-risk jurisdictions?
- High-risk indicators:
  - Parties in sanctioned or high-corruption/CTF-risk countries (e.g., IR, RU).
  - Both sides high-risk or high-risk corridors.
- Detection cues:
  - corridor:high_risk_country (list- or model-driven country risk)

### 3) Customer factors (the "Who")

Fields: `customer_type`, `customer_id`

- Question: Is the entity type high-risk or behavior anomalous?
- High-risk indicators:
  - `domiciliary_company` / shells that obscure UBOs.
  - Same customer repeatedly touching high-risk corridors.
  - Multiple customers exhibiting identical high-risk patterns (copycat structuring).
- Detection cues:
  - kyc:customer_high_risk / kyc:customer_medium_risk (when available)

### 4) Screening & alert factors (the "Flags")

Fields: `sanctions_screening`, `suspicion_determined_datetime`, `str_filed_datetime`

- Question: Did screening trigger or was suspicion already determined?
- High-risk indicators:
  - `sanctions_screening` ≠ "clear" (e.g., `potential`).
  - Presence of `suspicion_determined_datetime` or `str_filed_datetime` (definitive high risk).
- Detection cues:
  - screening:sanctions_potential
  - str:suspicion_recorded

### 5) Internal control factors (the "Compliance gaps")

Fields: `booking_datetime` (or `value_date`) vs `kyc_due_date`, plus `edd_required`, `edd_performed`

- Question: Was KYC up to date and controls followed?
- High-risk indicators:
  - KYC long overdue at time of transaction.
  - EDD required but not performed.
- Detection cues:
  - kyc:overdue
  - kyc:edd_missing

### Composite risk examples

- High: `domiciliary_company` + cash deposit (Factors 1 + 3)
- Higher: `domiciliary_company` + wire to RU (Factors 1 + 2 + 3)
- Highest: `domiciliary_company` + cash deposit (1) + beneficiary in IR (2) + sanctions `potential` (4) + KYC overdue by years (5)

---

## Level 1 outputs (to feed Level 3)

- Normalized context object with extracted fields and derived metrics (e.g., daily_cash_total, txn_count).
- Candidate `rule_hits[]` referencing a fixed catalog with rationale and weight (0.05–0.5):
  - txn:large_amount
  - cash:large_cash_deposit
  - cash:velocity_structuring
  - corridor:high_risk_country
  - screening:sanctions_potential
  - kyc:pep (if PEP context present)
  - kyc:customer_high_risk / kyc:customer_medium_risk
  - kyc:overdue
  - kyc:edd_missing
  - str:suspicion_recorded
- These feed an aggregate `score ∈ [0,1]` with light dampening for many minor hits.

## Data schema mapping (CSV → fields used in analysis)

Headers observed in dataset and ingestion:

- Identifiers/basics: `transaction_id`, `booking_jurisdiction`, `regulator`, `booking_datetime`, `value_date`, `amount`, `currency`, `channel`, `product_type`
- Counterparties: `originator_country`, `beneficiary_country` (plus names/accounts)
- SWIFT/travel rule: `swift_mt`, `swift_f50_present`, `swift_f59_present`, `swift_f71_charges`, `travel_rule_complete`
- FX: `fx_indicator`, `fx_base_ccy`, `fx_quote_ccy`, `fx_applied_rate`, `fx_market_rate`, `fx_spread_bps`
- Customer/KYC: `customer_id`, `customer_type`, `customer_risk_rating`, `customer_is_pep`, `kyc_last_completed`, `kyc_due_date`, `edd_required`, `edd_performed`
- Narrative/intent: `purpose_code`, `narrative`
- Cash controls: `cash_id_verified`, `daily_cash_total_customer`, `daily_cash_txn_count`
- Screening/STR: `sanctions_screening`, `suspicion_determined_datetime`, `str_filed_datetime`

## Streaming & persistence (UI readiness)

- Stream SSE events per row: ingest header/row → transaction analysis (rule hits, score) → optional regulatory enrichment → alert artifact.
- Persist agent steps (`agent_runs`) and alerts (`alerts`) for audit and drill-down.

## Notes for implementation alignment

- Rule IDs align with the in-code RULE_CATALOG of the transaction node.
- `suspicion_determined_datetime` directly enables `str:suspicion_recorded` when present.
- Thresholds (large amount, velocity) should be jurisdiction- and profile-aware; start with static defaults and evolve.

## Next steps

- Parameterize thresholds by `booking_jurisdiction` and `product_type`.
- Add cross-row aggregations for velocity/structuring beyond same-day window.
- Enrich country risk via a maintained list or data service.
- Wire Level 4 collation pipeline after batch completion and integrate PDF report generation.
