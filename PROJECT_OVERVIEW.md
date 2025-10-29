# Project Overview — Aura (Automated Universal Risk Assessment)

Aura is a multi-agent RegTech Intelligence MVP that automates Enhanced Due Diligence (EDD) for financial compliance. It combines a Next.js frontend, serverless APIs, a LangGraph-based multi-agent backend, and Supabase for data, auth, and (optionally) vectors. The goal is a “glass box” system that streams reasoning, sources, and a final, auditable risk report in real time.

This overview cross-references the Hackathon Plan and translates it into concrete technical, architectural, and structural decisions for implementation in this repository.


## Product vision and success criteria

- Problem: Compliance failures are costly and often stem from manual, siloed processes and backlogs in KYC/EDD.
- Solution: A goal-directed agentic system that screens names against sanctions/PEP lists, scans adverse media, and synthesizes a transparent risk report.
- MVP success (hackathon):
	- End-to-end flow: input client → agent workflow → streamed progress → final report saved in Supabase.
	- Deployable on Vercel with configured env vars.
	- Clear audit trail of agent steps and sources.


## High-level architecture

- Frontend: Next.js App Router + Tailwind + shadcn/ui. Streams agent updates via Vercel AI SDK to a real-time dashboard.
- Backend: Next.js Route Handlers (Edge where possible) that invoke a LangGraph multi-agent system using Groq LLMs (fallbacks allowed). SSE/streaming to the UI.
- Data: Supabase (Postgres, Auth, optional pgvector). Tables for clients, reports, report_findings, conversations, messages, documents, document_chunks, and agent_runs.
- Hosting: Vercel (frontend + serverless), Supabase Cloud for DB and auth.
- Secrets: .env.local (dev) and Vercel project envs for Supabase and LLM/tooling keys.

Data flow
1) User submits screening form (name, country) in the UI.
2) Frontend POSTs to /api/screen (serverless route handler).
3) LangGraph orchestrates worker agents: Watchlist Screener → Adverse Media → Report Synthesizer (conditional routing by Supervisor).
4) Agent steps stream to UI; results persist to Supabase.
5) Final report and sources render in dashboard; audit trail available.


## Repository structure (relevant parts)

Your app is under `./singhacks` and already includes a modern Next.js setup with shadcn/ui components and ai-elements for AI UX.

- `singhacks/app/` — Next.js App Router, global styles, layout, and pages.
- `singhacks/components/ai-elements/` — UI building blocks for agent streams, messages, sources, etc. Reuse these for the “glass box” UI.
- `singhacks/components/ui/` — shadcn/ui primitives (Button, Card, Dialog, etc.).
- `singhacks/lib/supabase/` — Supabase client/server helpers.

Planned additions (MVP)
- `singhacks/app/api/screen/route.ts` — Entry point for the screening workflow (SSE/streaming response).
- `singhacks/app/api/ingest/route.ts` — Optional: ingest docs to `document_chunks` with embeddings.
- `singhacks/app/api/chat/route.ts` — Optional: conversational agent endpoint using the same LangGraph core.
- `singhacks/lib/agents/` — LangGraph graph definition, nodes, tools, types.


## Frontend architecture (Compliance Officer’s Cockpit)

- Framework: Next.js 14+ App Router, React Server Components for fast initial data fetch (clients/reports), Client Components for interactive streams.
- Styling: Tailwind CSS (already configured) + shadcn/ui.
- Streaming UI: Vercel AI SDK for token/step streaming; reuse `ai-elements/*` components for messages, steps, artifacts, and sources.
- Core views:
	- Dashboard (list of clients/reports, status and risk levels)
	- New Screening form (client name, country)
	- Report detail (executive summary, risk score, findings, sources, audit trail)
	- Optional: Ingestion page (upload text/markdown, see chunking status)
- State and data fetching:
	- Server Components load lists (e.g., reports for logged-in user) via Supabase SSR.
	- Client Components subscribe to streaming events from `/api/screen`.
- Accessibility: Ensure semantic roles, keyboard navigation, focus states, and color contrast (red/amber/green) for risk statuses.


## Backend & agentic AI orchestration

- Runtime: Next.js Route Handlers; prefer Edge runtime for latency (fallback to Node where SDKs need it).
- Orchestration: LangGraph.js with a supervisor-worker pattern.
- LLMs: Groq (Gemma/Mixtral) as primary; allow OpenAI fallback via env flags if desired.
- Streaming: Use AsyncIterable or Vercel AI SDK utilities to stream step events and final report.

Agent graph (nodes)
1) Orchestrator (Supervisor)
	 - Analyzes AgentState, decides which worker to run next using conditional edges.
	 - Early FINISH when critical sanctions match is found.
2) GlobalWatchlistScreener (Worker)
	 - Tool: REST call to a screening API (e.g., NameScan, Castellum, or dilisense; behind a feature flag).
	 - Updates `sanctionsHits` and `pepHits` with structured results.
3) AdverseMediaAnalyst (Worker)
	 - Tool: Tavily Search API (optimized for AI agents) with boolean query construction.
	 - Updates `adverseMediaHits` with summaries and source links.
4) ReportSynthesizer (Worker)
	 - LLM prompt as senior compliance officer; generates executive summary, overall risk level, and recommendation.
	 - Writes `riskSummary` and `finalReport`.

Agent state (TypeScript)

```ts
// singhacks/lib/agents/types.ts (planned)
export interface AgentMessage {
	role: 'user' | 'system' | 'assistant' | 'tool';
	content: string;
	timestamp?: string;
}

export interface AgentStep {
	name: string;           // node or tool name
	status: 'start' | 'end' | 'error';
	detail?: string;        // short description for UI
	at: string;             // ISO timestamp
}

export interface Finding {
	source: string;         // API name or URL
	title?: string;
	summary?: string;
	score?: number;         // optional risk/strength score
	raw?: unknown;          // original API payload subset
}

export interface AgentState {
	// Inputs
	clientName: string;
	clientCountry: string;
	taskDescription?: string;

	// Findings
	sanctionsHits: Finding[];
	pepHits: Finding[];
	adverseMediaHits: Finding[];

	// Synthesized
	riskSummary?: string;
	finalReport?: string;

	// Trace & context
	messages: AgentMessage[];
	runId?: string;
	steps?: AgentStep[];    // audit trail for UI and persistence
}
```

Guardrails and ops
- Max steps / max duration to avoid loops.
- Structured outputs for worker updates.
- Error handling: step-level errors are logged to `agent_runs` with context; user gets a safe summary.
- Observability: aggregate timings and tool latencies; optional LangSmith tracing if time permits.


## Data and persistence (Supabase)

Schema (core tables)

- profiles: id (uuid), email, role
- clients: id (uuid), name, country, created_by, created_at
- reports: id (uuid), client_id, overall_risk, summary, recommendation, created_at
- report_findings: id, report_id, type ('sanctions'|'pep'|'adverse'), source, title, url, score, snippet, raw jsonb
- conversations: id, title, owner_id, created_at
- messages: id, conversation_id, role, content, metadata jsonb, created_at
- documents: id, owner_id, title, source_url, created_at
- document_chunks: id, document_id, embedding vector, chunk_text, token_count
- agent_runs: id, run_id, conversation_id nullable, status, steps jsonb, created_at

Example DDL (illustrative)

```sql
create table if not exists clients (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	country text not null,
	created_by uuid references auth.users(id),
	created_at timestamptz default now()
);

create table if not exists reports (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references clients(id) on delete cascade,
	overall_risk text check (overall_risk in ('low','medium','high','critical')),
	summary text,
	recommendation text,
	created_at timestamptz default now()
);

create table if not exists report_findings (
	id bigserial primary key,
	report_id uuid not null references reports(id) on delete cascade,
	type text check (type in ('sanctions','pep','adverse')),
	source text,
	title text,
	url text,
	score numeric,
	snippet text,
	raw jsonb
);

-- Indexes
create index if not exists idx_reports_client on reports(client_id);
create index if not exists idx_findings_report on report_findings(report_id);
```

RLS and security
- Enable RLS on all tables; default deny.
- Row ownership: records owned by `created_by`; reports and findings scoped by client ownership.
- Admin actions: gated by role claim or a server-side secret token for MVP.
- Log every agent run to `agent_runs.steps` for audit.

Vectors (optional)
- Enable pgvector and create `document_chunks(embedding vector)` for RAG over internal policies or regulatory docs.
- Embeddings provider: Groq/OpenAI embedding model, behind a feature flag.


## API surface (serverless)

Route handlers (App Router)

- POST `/api/screen`
	- Payload: `{ clientName: string; clientCountry: string }`
	- Behavior: starts a LangGraph run; streams Server-Sent Events (or Vercel AI SDK stream) with step updates and final report.
	- Persists: client (if new), report, report_findings, agent_runs.

- POST `/api/ingest` (optional)
	- Payload: `{ title: string; text?: string; url?: string }`
	- Behavior: chunk -> embed -> upsert into `documents` and `document_chunks`.

- POST `/api/chat` (optional)
	- Payload: `{ conversationId?: string; message: string }`
	- Behavior: conversational interface to the same graph/components; streams assistant messages.

- GET `/api/system` (optional)
	- Behavior: health check, version, enabled feature flags.

Event format (stream)

```json
{ "type": "step", "data": { "name": "GlobalWatchlistScreener", "status": "start", "detail": "Running sanctions & PEP check" } }
{ "type": "finding", "data": { "category": "sanctions", "source": "Castellum", "score": 0.8, "title": "Potential match" } }
{ "type": "final", "data": { "overall_risk": "medium", "summary": "...", "recommendation": "Proceed with caution" } }
```


## External services and tools

- Sanctions/PEP: NameScan, Castellum, or dilisense (choose one via env flag). Parse JSON and normalize to `Finding`.
- Adverse media: Tavily Search API for web results; build boolean queries per client name + risk keywords.
- LLMs: Groq SDK (primary); optional OpenAI fallback.
- Observability: Console + `agent_runs`; optional LangSmith if time permits.


## Deployment & environments

- Hosting: Vercel (auto previews on PRs; `main` → production).
- Supabase: Cloud project; enable pgvector if using RAG; set CORS for Vercel domain.
- Environment variables (examples):
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	- `SUPABASE_SERVICE_ROLE_KEY` (server only)
	- `GROQ_API_KEY`
	- `OPENAI_API_KEY` (optional fallback)
	- `SANCTIONS_API_PROVIDER` (`namescan|castellum|dilisense`)
	- `SANCTIONS_API_KEY`
	- `TAVILY_API_KEY`
- Runtime choice per route: Edge where SDKs allow; otherwise Node runtime.


## Security considerations

- Never hardcode secrets; use `.env.local` and Vercel project envs.
- Enforce RLS; restrict admin routes with role checks or secret header.
- Sanitize and store only necessary fields from third-party APIs; keep raw payloads in `report_findings.raw` under RLS.
- Rate-limit `/api/screen` to prevent abuse; basic input validation on name/country.


## UI/UX and “glass box” trust

- Live status banners: connecting, screening, analyzing, synthesizing.
- Step timeline: show node start/end, errors, durations; hyperlink sources.
- Risk badge: red/amber/green, with concise rationale.
- Drill-down modals: display detailed findings and raw snippets.


## Roadmap (aligned to Hackathon Plan)

Phase 1 (0–4h)
- Scaffold UI shell (layout, form), configure envs, link Supabase, deploy baseline to Vercel.

Phase 2 (5–12h)
- Implement minimal graph: START → GlobalWatchlistScreener → END. Wire `/api/screen` to stream raw results. Show on dashboard.

Phase 3 (13–24h)
- Add Orchestrator, AdverseMediaAnalyst, and ReportSynthesizer. Implement conditional routing and persistence.

Phase 4 (25–40h)
- Polish dashboard, add streaming “glass box,” drill-downs, mock data population, and demo script.


## Risks and mitigations

- Dependency or quota limits: Feature flags + fallbacks (e.g., OpenAI). Pin versions.
- Latency spikes: Early streaming, concise prompts, and timeouts; background job for ingestion.
- Security gaps: RLS and minimal data retention; human-in-the-loop for risky actions if added.
- Scope creep: Stick to MVP pipeline; log stretch goals.


## Stretch goals

- Multi-user collaboration and shared conversations.
- Additional tools (calendar/email) behind approval gate.
- Supabase Edge Functions for heavy ingestion.
- Observability dashboard and analytics.
- Reflection loops and long-term memory summaries.


## References

- See Hackathon Plan for detailed citations, architecture decisions, and milestone breakdowns.
- Key tech docs: LangGraph, Vercel AI SDK, Supabase (Auth, pgvector), Groq SDK.


## Appendix: Success checklist

- [ ] `/api/screen` streams steps and final report.
- [ ] Supabase tables created and RLS enabled.
- [ ] UI shows risk score, summary, and audit trail with source links.
- [ ] Deployed preview on Vercel with env vars set.
- [ ] Demo script prepared with at least two personas (clean vs flagged).

