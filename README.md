# Aura

> Automated Universal Risk Assessment — a glass-box RegTech cockpit for transaction monitoring, regulatory intelligence, document review, and auditable compliance reporting.

Aura is a hackathon prototype that brings several compliance workflows into one web application. It screens transaction data, explains why a transaction was flagged, cross-references regulatory material, processes client documents, and streams agent activity to the interface instead of hiding the analysis behind a single score.

The application is branded as the **Julius Baer Compliance Hub** in the UI. “Aura” is the product and repository name.

## What is it?

Aura is a Next.js compliance operations dashboard backed by Supabase and two agent workflows:

- **Sentinel** reviews transactions for AML and control risks. It uses a Groq-hosted language model to produce structured rule hits and a normalized score, enriches the result with regulatory evidence, and creates a low-, medium-, or high-severity alert.
- **Veritas** reviews uploaded PDFs. It extracts and chunks text, runs lightweight format checks, creates a risk assessment, and stores the report against a case.

| Workspace | Route | Purpose |
| --- | --- | --- |
| Dashboard | `/dashboard` | Summarizes alert volume and recent risk activity. |
| Transactions | `/transactions` | Streams mock transaction ingestion and screening and links to detailed evidence. |
| Cases / Docs | `/documents` | Uploads PDFs, groups them into cases, runs Veritas, and exports reports. |
| Regulations | `/regulations` | Runs the regulatory agent and displays discovered sources and artefacts. |

The root route (`/`) redirects to the dashboard.

## What problem does it solve?

Financial-crime teams often work across disconnected transaction-monitoring systems, policy portals, document stores, and reporting tools. Analysts lose time assembling context; scores can lack explanations; regulatory updates are difficult to translate into rules; and investigation evidence can become separated from its case.

Aura demonstrates a unified workflow in which each stage produces visible, streamable evidence. It keeps transaction facts, rule hits, regulatory snippets, agent events, alerts, documents, and reports connected so an analyst can move from detection to investigation and reporting in one place.

> Aura is a prototype, not a production AML decision engine. Generated results require human review. Its rules, prompts, access controls, schema, and operational safeguards must be validated before using real customer data.

## Why did we build it?

We built Aura to explore an explainable, agent-assisted compliance desk. The goal was not merely to add a chatbot, but to make AI observable inside an analyst workflow:

1. ingest a transaction or document;
2. show each analysis stage as it happens;
3. preserve rationale and supporting sources;
4. route higher-risk work into deeper regulatory enrichment;
5. leave final decisions with a human reviewer; and
6. generate a reviewable, shareable artefact.

## Main features

### Live transaction monitoring

- Loads the included 1,000-row mock CSV and processes records sequentially.
- Streams node starts/results, tool calls, artefacts, and errors through Server-Sent Events (SSE).
- Supports starting, pausing, and resuming the UI feed.
- Persists monitor rows and restores the latest feed after refresh.
- Supports cursor-, offset-, and limit-based feed retrieval.

### Explainable AML analysis

- Sends normalized single-transaction context to Groq with a constrained rule catalogue.
- Returns structured rule hits with a short rationale and weight.
- Covers large or structured cash activity, sanctions results, PEP status, high-risk corridors, incomplete travel-rule fields, unusual FX spreads, overdue KYC, missing EDD, and recorded suspicion.
- Normalizes the score to `0–1` and shows the model origin in the drill-down view.

### Risk evaluation and alerts

- Refines the initial model score in a separate evaluation stage.
- Maps results to low-, medium-, or high-severity alert artefacts.
- Persists alerts and exposes them through an API.
- Displays global high-severity toast notifications.
- Shows transaction metadata, rule hits, regulatory snippets, and alert evidence per transaction.

### Regulatory intelligence

- Searches the MAS portal and Tavily-backed web results using regulator-specific configurations.
- Tracks a cursor so later scans can focus on new material.
- Extracts HTML/PDF content and stores a bounded local manifest under `data/regulatory/`.
- Chunks documents and persists source metadata when Supabase is configured.
- Generates draft rule proposals and `pending_approval` version records with source URLs.
- Cross-references transaction hits against stored regulatory sources.
- Runs deeper enrichment only when Sentinel's score reaches the current `0.65` threshold.

### Case and document processing

- Accepts up to 10 PDFs from the current upload UI with client metadata.
- Uploads documents to Supabase Storage and links them to a case.
- Extracts and chunks PDF text, estimates token count, and checks document formatting.
- Streams Veritas stages: processing, format validation, image forensics, and risk assessment.
- Saves the final report on the case and generates downloadable compliance PDFs.

The current image-forensics node is an MVP placeholder: it reports that embedded images were not analyzed. It is not an authenticity detector.

### Audit-oriented agent UX

- Uses a common event contract: `on_node_start`, `on_node_end`, `on_tool_call`, `on_artifact`, and `on_error`.
- Records Sentinel events in `agent_runs` when Supabase is available.
- Renders task progress, reasoning, citations, source links, and artefacts with reusable AI UI components.
- Keeps generated rules in a human-review state instead of activating them automatically.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js App Router, React 19, TypeScript |
| Styling | Tailwind CSS, Radix/shadcn-style primitives, Lucide, Tabler Icons, Motion |
| Agents | LangGraph and LangChain |
| Model | Groq `ChatGroq`; Sentinel currently selects `openai/gpt-oss-20b` |
| Streaming | SSE and Web Streams |
| Database/auth | Supabase Postgres and Supabase SSR |
| Storage | Supabase Storage plus a local regulatory cache |
| Regulatory discovery | MAS portal scraper, Cheerio, Tavily Search/Extract |
| PDFs | `pdf-parse`, `@react-pdf/renderer` |
| AI UI | Vercel AI SDK, Streamdown, Shiki, XYFlow |
| Tooling | npm, ESLint, Prettier, Husky, lint-staged |

Exact versions are locked in `package-lock.json`.

## Architecture

### High-level flow

```text
Browser (Next.js pages/client components)
        |
        | fetch + SSE
        v
Next.js route handlers
        |
        +--> Sentinel transaction/regulatory workflow --> Groq / MAS / Tavily
        +--> Veritas document workflow ----------------> PDF parser
        +--> PDF report generator
        |
        v
Supabase (Postgres + Auth + Storage) and local regulatory cache
```

### Sentinel workflow

```text
Transaction
   |
   v
transaction (LLM rule hits + score)
   |
   v
crossref (stored regulatory evidence)
   |
   v
evaluate (score refinement)
   |
   +---- score < 0.65 ------------------+
   |                                    |
   v                                    |
regulatory (scan -> extract -> generate -> version)
   |                                    |
   +----------------+-------------------+
                    v
alert (persist final artefact)
```

`buildSentinelGraph()` defines the equivalent LangGraph topology. The active API uses `runSentinelSequential()`, a manual runner with the same stages that gives explicit control over SSE and handles client disconnects gracefully.

### Regulatory subflow

1. **Scan** regulator sources and deduplicate candidates by URL/hash.
2. **Extract** relevant HTML/PDF content.
3. **Generate** draft compliance rule proposals.
4. **Version** rules, sources, chunks, and pending-approval records.

The `/regulations` workspace triggers this independently; Sentinel invokes it conditionally for higher-risk transactions.

### Veritas workflow

```text
PDF from Supabase Storage
  -> text extraction/chunking
  -> format heuristics
  -> image-forensics placeholder
  -> risk score + Markdown/JSON report
  -> case persistence + PDF export
```

### Repository layout

```text
singhacks/
├── app/
│   ├── api/                    # AML, document, report, and agent routes
│   ├── langgraph/
│   │   ├── common/             # State, events, and stream helpers
│   │   ├── teams/sentinel/     # Transaction/regulatory workflow
│   │   ├── teams/veritas/      # Document workflow
│   │   └── tools/              # MAS, Tavily, and PDF adapters
│   ├── dashboard/
│   ├── documents/
│   ├── regulations/
│   └── transactions/
├── components/
│   ├── ai-elements/            # Streaming and artefact primitives
│   ├── aml/
│   ├── analysis/
│   ├── transactions/
│   └── ui/
├── data/                       # Mock transactions/local regulatory cache
├── lib/
│   ├── pdf/
│   ├── regulatory/
│   └── supabase/               # Clients, DAOs, and SQL
└── public/
```

### Persistence objects

The code uses these Supabase resources:

- tables: `alerts`, `monitor_rows`, `agent_runs`, `transactions`, `regulatory_sources`, `regulatory_cursors`, `documents`, `document_chunks`, `rule_versions`, `image_checks`, `cases`, and `case_documents`;
- storage bucket: `documents`;
- optional admin RPC: `execute_sql`.

Only `alerts` and `monitor_rows` are defined in the committed `lib/supabase/sql/monitoring.sql`. The regulatory setup endpoint returns SQL for `regulatory_sources` instead of executing it. The remaining tables, relationships, RLS policies, and storage bucket must already exist for every feature to work end to end.

## How to run locally

### Prerequisites

- Node.js 20 LTS or newer (recommended)
- npm 10 or newer
- a Supabase project
- Groq and Tavily API keys

### 1. Install

```bash
git clone <repository-url>
cd Sing-Hacks-2025/singhacks
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Populate `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
GROQ_API_KEY=<groq-api-key>
GROQ_MODEL=openai/gpt-oss-20b
TAVILY_API_KEY=<tavily-api-key>

# Optional
TAVILY_API_URL=https://api.tavily.com
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is required by document upload, case mutation, report retrieval, and PDF persistence routes, although it is missing from the current `.env.example`. Never prefix it with `NEXT_PUBLIC_`.

The main transaction node hard-codes `openai/gpt-oss-20b`; `GROQ_MODEL` affects the separate Level 1 route. Update both implementations for consistent model selection.

### 3. Prepare Supabase

1. Run `lib/supabase/sql/monitoring.sql` in the Supabase SQL editor.
2. Create the additional tables listed above with columns matching the DAO and route inserts/selects.
3. Create a private `documents` Storage bucket.
4. Configure Row Level Security and policies for your auth model.
5. Grant authorized browser users access to their dashboard, cases, sources, monitor rows, and alerts.
6. Keep service-role access limited to server routes.

The repository does not contain a complete migration set, so a fresh Supabase project cannot yet be bootstrapped with one command. This is the main onboarding gap.

### 4. Start Aura

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root redirects to `/dashboard`.

### 5. Exercise the flows

Open `/transactions` to start mock screening. The fixture is:

```text
data/transactions/transactions_mock_1000_for_participants.csv
```

The monitor API accepts an explicit path. Use it because the legacy default path currently points outside this repository:

```bash
curl -N http://localhost:3000/api/aml/monitor \
  -H 'Content-Type: application/json' \
  -d '{"csv_demo":true,"csv_path":"data/transactions/transactions_mock_1000_for_participants.csv","limit":10}'
```

Other smoke requests:

```bash
curl 'http://localhost:3000/api/aml/monitor/feed?limit=20'
curl 'http://localhost:3000/api/aml/alerts'

curl -N http://localhost:3000/api/regulations/stream \
  -H 'Content-Type: application/json' \
  -d '{}'
```

For document analysis, open `/documents/upload`, enter client details, upload PDFs, and wait for Veritas. This requires the case/document tables and Storage bucket.

### 6. Validate

```bash
npm run build
```

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js with Turbopack. |
| `npm run build` | Create a production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint with automatic fixes. |
| `npm run format` | Format with Prettier. |

`npm run lint` mutates files because it includes `--fix`.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/aml/monitor` | Run Sentinel for IDs or CSV rows and stream SSE. |
| `GET` | `/api/aml/monitor/feed` | Get monitor rows with their latest alerts. |
| `GET` | `/api/aml/alerts` | Get recent alerts with optional filters. |
| `POST` | `/api/aml/transactions/ingest` | Accept a transaction CSV upload. |
| `POST` | `/api/aml/transactions/analyze/level1` | Stream single-transaction Level 1 analysis. |
| `POST` | `/api/regulations/stream` | Run regulatory Sentinel and stream progress. |
| `POST` | `/api/aml/regulatory/scrape` | Run a direct regulatory scrape. |
| `GET` | `/api/aml/regulatory/documents/:id` | Return a locally stored regulatory document. |
| `POST` | `/api/documents/upload` | Upload a document and create its record. |
| `POST` | `/api/documents/create-case` | Create a case and document links. |
| `GET` | `/api/documents/get-case` | Get a case by `case_id`. |
| `POST` | `/api/documents/update-case` | Save analysis/report fields. |
| `GET` | `/api/docs/analyze` | Run Veritas and stream SSE. |
| `POST` | `/api/pdf` | Generate and optionally persist a PDF. |
| `GET` | `/api/reports/latest/:caseId` | Get a signed URL for the latest case report. |

## Security and production considerations

- Middleware currently treats dashboard, transactions, and regulations as public; document routes require a session. Review this before deployment.
- Design tenant-aware RLS policies; the committed SQL contains demo suggestions only.
- Never send service-role, Groq, or Tavily credentials to client code.
- Avoid real PII. Prompt instructions are not a complete data-loss-prevention control.
- Add authorization, input schemas, malware scanning, rate limiting, retries, structured logs, and retention policies.
- Validate model outputs deterministically before affecting a compliance decision.
- Record who approves every generated rule version.
- Replace the image-forensics placeholder before making authenticity claims.
- Add automated unit, integration, and end-to-end tests; none are currently configured.

## Current limitations

- No complete Supabase migration set is committed.
- The CSV runner's default path is stale; pass the checked-in path explicitly.
- Regulatory discovery depends on external sources and Tavily availability.
- The primary Sentinel model ID is hard-coded.
- Veritas uses simple heuristics and does not inspect embedded images.
- No automated test script is defined.
- Screenshots and a demo GIF are not included yet.

## License

No license file is included. Unless the owner adds one, the source is not automatically licensed for redistribution or reuse.
