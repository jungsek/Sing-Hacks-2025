# Regulatory Agent Plan - Sentinel Team (MAS-Focused MVP)

This plan details the implementation of the AML Regulatory Agent as part of the Sentinel team's sub-flow: External - Regulatory. The MVP targets the Monetary Authority of Singapore (MAS) first and generalizes to HKMA/FINMA next.

---

## 1) Executive Summary & Mandate

- Mandate: Automate discovery, ingestion, and parsing of AML/CFT regulatory updates from official authorities, starting with MAS. Output structured, actionable monitoring criteria with version history.
- Strategy: Replace brittle scrapers with a Tavily-powered search and extract workflow that returns clean content for downstream NLP rule generation and versioning.
- Placement: Specialized worker inside Sentinel (AML) graph; exposed via the existing `/api/aml/monitor` surface and future scheduled jobs.

---

## 2) Scope & Entry Point (Flow 2: External - Regulatory)

- Scope (MVP, MAS only):
  - Discover new circulars/guidelines from MAS.
  - Extract clean plaintext from found URLs (HTML/PDF).
  - Parse text -> candidate monitoring rules (drafts) with metadata.
  - Persist to `rule_versions` and link to the `documents` record for the source.
- Not in MVP:
  - Full supervisor orchestration.
  - Advanced NER/ML beyond deterministic patterns and LLM-assisted extraction.
  - Non-MAS regulators (extend later to HKMA/FINMA).

---

## 3) Architecture & Integration

- Subgraph within Sentinel (LangGraph-ready):
  - `regulatory_scan` + `regulatory_extract` + `rule_generate` + `rule_version`.
  - Each node emits SSE events: `on_node_start`, `on_node_end`, `on_artifact`, `on_error`.
  - The current single `regulatory` node stub will be expanded into the 3-step sub-flow above (kept composable so we can still run the simple node if LangGraph is unavailable).
- Tools (encapsulated):
  - `tavily.search(params)` -> discovery with domain focus and date cursor.
  - `tavily.extract(urls)` -> HTML/PDF extraction into plaintext.
  - (Later) `retrieval` and `embeddings` for internal RAG; `ethos` for compliance prompts.
- Data persistence:
  - `documents` -> one row per discovered source (type=`regulatory`), with `url`, `title`, `published_at`, `meta`.
  - `document_chunks` -> chunks of extracted plaintext for RAG; `tags: ['regulatory','mas']`.
  - `rule_versions` -> proposed rule records with `pending_approval` and linkage to `documents`.
  - `agent_runs` -> per-run audit trail and operational logs.

---

## 4) Tavily-Powered Workflow

### 4.1 MAS Targeting

- Focus domains (MAS first):
  - `mas.gov.sg` (circulars, regulations and guidance pages).
- Primary listing endpoint (queryable):
  - Base: `https://www.mas.gov.sg/regulation/regulations-and-guidance`.
  - Query params supported by MAS search include `topics=<slug>` and `contentType=<type>`; enumerate both `anti-money-laundering` and `regulatory-submissions` across `Notices`, `Circulars`, `Guidelines`, `Regulations`, and `Acts`.
  - Append `?topics=anti-money-laundering&contentType=Notices&page=1` etc. to page through the portal (10 results per page; currently 77 results reported).
  - Parsed cards expose published date, summary, detail href, and topic badges that we store as metadata.
- Sample pages:
  - Listing: `https://www.mas.gov.sg/regulation/regulations-and-guidance?topics=anti-money-laundering&contentType=Notices`.
  - Detail: `https://www.mas.gov.sg/regulation/notices/notice-314` -> contains a "View Notice" call to action linking to a PDF.
  - PDF example: `https://www.mas.gov.sg/-/media/mas-media-library/regulation/notices/id/notice-314/mas-notice-314_30-june-2025.pdf`.
- Continue to use Tavily for long-tail or off-portal discovery (older PDFs, cross-domain references).

### 4.2 Phase 1 - Proactive Horizon Scanning (tavily.search)

- Parameters (representative):
  - `include_domains`: `["mas.gov.sg"]`.
  - `topic`: `"news"` (focus recent announcements).
  - `start_date`: ISO8601 from last successful run timestamp (see section 7 on cursors).
  - Optional: `search_depth`, `max_results`, `filter_duplicates`.
- Output: Ranked results with `url`, `title`, `published_time` (when available), and short summary.

### 4.3 Phase 2 - Content Ingestion (tavily.extract)

- Input: Array of candidate URLs from search (filter by domain/novelty).
- Output: Clean, normalized plaintext per URL, including title/metadata when available.
- Benefit: Unifies HTML and PDF ingestion without bespoke parsers.

### 4.4 Phase 3 - Rule Generation & Versioning

- Input: Extracted plaintext plus source metadata.
- Processing:
  - LLM-assisted pattern extraction: detect thresholds, due-diligence requirements, obligations, effective dates, impacted sectors.
  - Normalize into schema (example):
    ```json
    {
      "regulator": "MAS",
      "document_url": "https://www.mas.gov.sg/...pdf",
      "document_title": "AMLD Circular 08/2024 - Establishing the SOW of Customers",
      "effective_date": "2024-08-10",
      "criteria": [
        {
          "id": "mas_sow_threshold_01",
          "type": "threshold",
          "field": "source_of_wealth",
          "rule": ">= enhanced_due_diligence",
          "rationale": "SOW must be established for high-risk customers"
        }
      ]
    }
    ```
- Persistence:
  - Create/Upsert `documents` (type=`regulatory`, domain=`mas.gov.sg`).
  - Insert `document_chunks` for retrieval with tags `['regulatory','mas']`.
  - Insert `rule_versions` with `status='pending_approval'`, link `document_id`, `source_url`, diff metadata.

### 4.5 MAS Portal Harvest Flow

1. Enumerate listing URLs by crossing `topics` (`anti-money-laundering`, `regulatory-submissions`) with `contentType` (Notices, Circulars, Guidelines, Regulations, Acts) and paginating via `page`.
2. Fetch each listing (cache-friendly GET) through a new `masPortalListings` helper; parse HTML with Cheerio to extract cards (title, summary, published date, relative detail link, badge metadata).
3. Normalize detail URLs to absolute `https://www.mas.gov.sg/...` addresses and emit candidate metadata (including `source_hash = sha1(url + published_at)`) for dedupe.
4. Fetch each detail page to capture canonical metadata and locate CTA anchors such as `View Notice`, `View Circular`, or `Download PDF` selectors.
5. Queue discovered PDF links for `tavily.extract`; fall back to direct download plus PDF text parsing if Tavily cannot extract.
6. Persist detail HTML snippets with the PDF plaintext (store under `documents.meta.portal`) and annotate metadata with `listing_topic`, `listing_content_type`, and published date.
7. Update the run cursor based on the newest `published_date` observed; skip documents older than the stored cursor.
8. Merge deterministic portal hits with Tavily search results before downstream dedupe so the agent keeps broad discovery coverage.

- Store extracted plaintext in `document_chunks` (tag with `["regulatory","mas","pdf"]` when sourced from a PDF) and emit progress snippets for listing fetch, detail parse, and PDF ingest.

---

## 5) LangGraph Design (Nodes & Edges)

- Nodes (Sentinel/Regulatory sub-flow):
  - `regulatory_scan`
    - Tooling: deterministic `masPortalListings` helper plus `tavily.search`.
    - Steps: enumerate portal listings, parse detail metadata, merge with Tavily hits, dedupe, and advance the cursor.
    - Emits: list of new candidate URLs plus basic metadata.
  - `regulatory_extract`
    - Tool: `tavily.extract`.
    - Emits: plaintext payloads and derived `documents` candidates.
  - `rule_generate`
    - Tooling: LLM structured extraction, deterministic patterns.
    - Emits: normalized rule proposal(s).
  - `rule_version`
    - DAO: persist rules into `rule_versions` with `pending_approval`.
    - Emits: artifact `{ type:'rule_proposed', rule_version_id }`.
- Edges: `regulatory_scan` -> `regulatory_extract` -> `rule_generate` -> `rule_version`.
- SSE: Fire `on_node_start|end`, `on_artifact`, `on_error` with `{ run_id, graph:'sentinel', node, ts, data }`.

---

## 6) Supabase Schema (Delta/Assumptions)

- `documents` (add/confirm fields):
  - `id uuid pk`, `type text` ('regulatory'), `title text`, `url text`, `domain text`, `published_at timestamptz`, `meta jsonb`, `created_at timestamptz`.
- `document_chunks`:
  - `id uuid pk`, `document_id uuid fk`, `text text`, `embedding vector?`, `tags text[]`, `meta jsonb`.
- `rule_versions` (new or extend):
  - `id uuid pk`, `document_id uuid fk`, `regulator text`, `status text` ('pending_approval'|'approved'|'rejected'), `rule_json jsonb`, `diff jsonb`, `source_url text`, `effective_date date`, `created_at timestamptz`.
- `agent_runs` (already planned):
  - `run_id text`, `graph text`, `node text`, `status text`, `payload jsonb`, `created_at timestamptz`.
- RLS: Documents readable (demo scope), `rule_versions` restricted to reviewers.

---

## 7) Cursors & Scheduling

- `regulatory_cursors` (optional table) or reuse `agent_runs` last success per regulator to compute `start_date` for `tavily.search`.
- Scheduling options:
  - Dev: manual trigger via `/api/aml/monitor` body `{ regulatory_scan: true }`.
  - Prod: platform cron (e.g., Vercel Cron) invoking a dedicated route (future `/api/aml/regulatory/scan`).

---

## 8) Tooling Implementation Notes

- File: `singhacks/app/langgraph/tools/tavily.ts`
  - Expose a thin wrapper around Tavily Search and Extract with env `TAVILY_API_KEY`.
  - Methods:
    - `search({ query, include_domains, topic, start_date, ... })`.
    - `extract({ urls })`.
  - Return shapes normalized for graph nodes.
- File: `singhacks/app/langgraph/tools/masPortal.ts`
  - `fetchListing({ topic, contentType, page })` -> returns cards with metadata and absolute detail URLs.
  - `fetchDetail(url)` -> returns HTML, canonical metadata, CTA links, and inferred published date.
  - `resolvePdfLinks(detail)` -> normalizes PDF URLs for extraction fallback handling.
- Node wiring (expand current stub): integrate `masPortal` deterministic crawler before Tavily fallbacks. `regulatory.ts` will dispatch sub-steps or call the wrappers in order for MVP.

---

## 9) Acceptance Criteria (MVP, MAS)

1. The Regulatory Agent runs within the Sentinel graph and can be invoked over SSE.
2. MAS portal enumeration (topics x content types x pagination) executes each run and populates `regulatory_candidates` with new metadata.
3. Tavily search restricts to `mas.gov.sg` and uses `topic=news` plus `start_date` cursor to avoid reprocessing.
4. Detail pages yield both HTML content and `View Notice`/PDF assets extracted to plaintext and persisted into `documents`/`document_chunks`.
5. The plaintext payload is passed downstream to the parsing step.
6. A new rule is created in `rule_versions` with `status='pending_approval'` and links back to the source `documents.url`.

---

## 10) Risks & Mitigations

- Risk: Tavily quota/latency -> Mitigation: backoff/retry, cap `max_results`, cache.
- Risk: Duplicate ingestion -> Mitigation: de-dupe by `url` plus `published_at` hash; use cursors.
- Risk: Ambiguous rule extraction -> Mitigation: default to conservative drafts with explicit reviewer approval.
- Risk: PDF parsing fidelity -> Mitigation: rely on Tavily extract; if gaps, add LlamaParse as fallback later.

---

## 11) Milestones & Deliverables

- P0 (This plan): Architecture, MAS scope, acceptance criteria.
- P1 (Tools): `tavily.ts` wrappers; env wiring; basic logging.
- P1.1 (Portal ingestion): build `masPortal.ts`, listing enumeration, detail/PDF parsing, and cursor updates.
- P2 (Nodes): Implement `regulatory_scan`, `regulatory_extract`, `rule_generate`, `rule_version` within the Sentinel sub-flow.
- P3 (Persistence): Upsert `documents`, chunk text, create `rule_versions (pending_approval)`.
- P4 (Validation): Manual run over one MAS HTML circular and one MAS PDF; confirm SSE events, portal snippets, and DB records.

---

## 12) Testing Approach

- Dry-run mode: emit SSE with found URLs and extracted text lengths, without DB writes.
- Live mode (staged): enable writes behind a flag; verify `documents`, `document_chunks`, `rule_versions` rows.
- Unit: tavily wrappers (mocked responses); rule normalization; portal listing parser (HTML fixture covering pagination and CTA detection).
- Integration: end-to-end sub-flow with fixture URLs plus a local MAS listing HTML snapshot to validate PDF detection.
