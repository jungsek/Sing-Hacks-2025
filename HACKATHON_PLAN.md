# Project Plan — Hackathon MVP (3 Days)

## 0. Guiding Principles
- **Bias to shipping:** Favor working end-to-end slices over deep polishing. Prototype fast, tighten loops.
- **Security first:** Never hardcode secrets; use `.env.local`, Supabase Row Level Security, and human-in-the-loop for sensitive tool actions.
- **Observability:** Log agent steps, vector queries, and API latencies early to accelerate debugging.
- **Parallelize:** Split workstreams (frontend, orchestration, data, deployment) and reconvene for integration checkpoints.

## 1. Product Vision & Success Criteria
- Deliver a multi-agent conversational assistant that retrieves knowledge from Supabase, calls Groq LLMs via LangGraph, and renders a responsive chat UI with shadcn/UI components.
- Support document/query ingestion into Supabase vector store and retrieval-augmented responses.
- Expose at least one deployable instance on Vercel with environment variables configured.
- Success indicators: usable demo flow (upload docs → chat → agent reasons w/ tools), stable deployment, and clear follow-up backlog.

## 2. Architecture Overview
- **Frontend/UI:** Next.js (App Router) with shadcn/UI + Tailwind for chat layout, document management, and admin controls.
- **Serverless API:** Next.js Route Handlers for agent endpoints (`/api/chat`, `/api/ingest`, `/api/system`). Edge runtime where possible for latency; fallback to Node runtime for SDK compatibility.
- **AI Orchestration:** LangGraph.js to define agent graph with:
  - User message node → retrieval node → Groq LLM call node → tool/action nodes.
  - Optional approval node to gate high-risk actions.
  - Event streaming back to UI via web sockets or Next.js Server-Sent Events.
- **Data Layer:** Supabase for Postgres + pgvector. Tables: `profiles`, `conversations`, `messages`, `documents`, `document_chunks`, `agent_runs`.
- **Auth:** Supabase Auth (email magic link) for MVP; gated admin actions. Alternatively leave gated by shared secret if auth not ready.
- **Deployment:** Vercel (frontend + serverless), Supabase Cloud (DB + edge functions if needed).
- **Secrets:** `.env.local` (dev), Vercel project env for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, LangChain keys, optional `NEXT_PUBLIC_*` variables.

## 3. Milestones & Timeline

### Day 0 (Pre-hack / Hour 0-2)
1. Confirm team roles, repo structure, and tooling (Node LTS, pnpm, IDE extensions).
2. Create shared task board (Linear/Trello/GitHub Projects) with this plan as baseline.
3. Provision Supabase project; capture connection info, enable pgvector.
4. Collect initial datasets/documents to ingest.

### Day 1 — Foundations & E2E Skeleton
1. **Repo bootstrap**
   - Initialize Next.js 14 (App Router, TypeScript, Tailwind, shadcn/ui).
   - Configure ESLint, Prettier, Husky (optional) for baseline quality.
2. **UI Scaffold**
   - Implement base layout: sidebar (documents), chat pane, message composer.
   - Integrate shadcn theme, dark mode toggle, and typographic scale.
3. **Supabase integration**
   - Install `@supabase/supabase-js`; configure client and server helpers.
   - Define SQL schema migrations; run initial migration locally.
4. **LangGraph skeleton**
   - Install `@langchain/langgraph`, `langchain`, `groq-sdk`.
   - Outline agent graph with mock LLM/tool call nodes.
   - Expose `/api/chat` returning stubbed streaming responses.
5. **DevOps basics**
   - Setup `.env.example`; document secrets in README.
   - Configure Vercel project (manual deployment with placeholder API keys).

### Day 2 — Core Functionality & Data
1. **Vector pipeline**
   - Build ingestion API (`/api/ingest`) to chunk text, embed (Groq or OpenAI fallback), and store embeddings in Supabase.
   - Add UI to upload text/markdown/PDF (start with text/markdown) and show ingestion status.
2. **Retrieval-augmented agent**
   - Implement retrieval node querying Supabase `document_chunks`.
   - Update LangGraph flow: user message → retrieval → Groq LLM → formatter.
   - Stream tokens back to UI via SSE or websockets.
3. **Conversation persistence**
   - Persist conversations/messages in Supabase.
   - Load history in chat UI (infinite scroll or fixed window).
4. **Approval/sandbox tooling**
   - Add optional tool node requiring user confirmation (e.g., sending email placeholder).
   - Provide UI modal for approvals.
5. **Testing & logging**
   - Add unit tests for graph logic (where feasible) and integration test hitting `/api/chat`.
   - Instrument logging for each node (start/end timestamps, errors).

### Day 3 — Polish, Deployment, Demo Readiness
1. **UI polish**
   - Improve chat animations, typing indicator, message metadata.
   - Add system status indicators (connected, ingesting).
2. **Security & hardening**
   - Verify RLS policies for Supabase tables.
   - Ensure admin-only routes/actions require auth token.
3. **Performance**
   - Cache embeddings, reduce duplicate inserts, index conversation tables.
   - Validate LangGraph loop safeguards (max steps, timeout).
4. **Deployment**
   - Finalize Vercel deployment with production env vars.
   - Run Supabase migration on prod database.
5. **Demo scripting**
   - Prepare scenario walkthrough.
   - Create fallback scripts in case Groq latency spikes.
6. **Backlog**
   - Document stretch goals and post-hack next steps.

## 4. Detailed Task Breakdown

### 4.1 Project Setup
- Create monorepo structure (single Next.js app).
- Configure `pnpm` workspaces if planning extra packages; otherwise simple `pnpm` project.
- Add scripts: `dev`, `build`, `start`, `lint`, `format`, `test`.
- Setup commit hooks (lint on commit) if time allows.

create next-app@latest singhacks --yes

### 4.2 Frontend & UX
- Global layout with responsive breakpoints (desktop-first, mobile fallback).
- Components: `ChatWindow`, `MessageList`, `Composer`, `DocumentList`, `SettingsDrawer`.
- Use shadcn component primitives (Button, Input, Card, Dialog, Tabs).
- Tailwind config with custom colors for role distinctions (user vs agent vs system).
- Implement SSE/WebSocket client to display streaming tokens.
- Error states: offline, Supabase failure, agent error message.

### 4.3 Supabase Schema (SQL Outline)
- `profiles`: id (uuid), email, role.
- `conversations`: id, title, owner_id, created_at.
- `messages`: id, conversation_id, role, content, metadata, created_at.
- `documents`: id, owner_id, title, source_url, created_at.
- `document_chunks`: id, document_id, embedding vector, chunk_text, token_count.
- `agent_runs`: id, conversation_id, status, steps jsonb, created_at.
- Enforce RLS policies and indexes on `conversation_id`, `document_id`, vector column.

### 4.4 LangGraph Orchestration
- Nodes:
  - `InputCollector`: preprocess user input, fetch conversation context.
  - `Retriever`: query Supabase vector store (via REST or `supabase-js`).
  - `LLMResponder`: call Groq LLM (Gemma, Mixtral) using LangChain wrapper.
  - `ToolSelector`: route to custom tools (e.g., document summarizer, action runner).
  - `ApprovalGate`: wait for UI confirmation on risky actions.
  - `ResponseFormatter`: stream final message back.
- Implement streaming with `AsyncIterable` or event emitter.
- Add guardrails: max recursion depth, track tokens, error recovery node.

### 4.5 Tooling & Integrations
- Document ingestion pipeline with adapters for text, markdown, and optional PDF (using `pdf-parse`).
- Embeddings: prefer Groq embedding model if available; otherwise fallback to OpenAI or Supabase function.
- Logging/Analytics: simple server logs + optional Supabase `agent_runs` table for history.
- Feature flags via environment variables for experimental tools.

### 4.6 Testing Strategy
- Unit tests for LangGraph nodes (mock network calls).
- Integration test hitting `/api/chat` with mocked Supabase + Groq.
- Cypress/Playwright smoke test for chat UI if time permits.
- Include manual test checklist (ingest -> chat -> approval flow).

### 4.7 Deployment Checklist
- Review `.env.example` accuracy.
- Configure Vercel project with protected environment variables.
- Set `NEXT_PUBLIC_SUPABASE_URL` (public) vs service role (server only).
- Ensure Supabase CORS allows Vercel domain.
- Run `pnpm lint && pnpm test && pnpm build` before final deploy.
- Validate streaming works in production (Edge vs Node runtime adjustments).

### 4.8 Demo & Handoff
- Script demo storyline, highlight unique agent behaviors.
- Capture screenshots/GIFs for submission materials.
- Prepare README with setup instructions and architecture diagram.
- Document known issues, trade-offs, and future improvements.

## 5. Stretch Goals (If Ahead of Schedule)
- Multi-user collaboration (shared conversations).
- Tooling for external APIs (calendar, email) behind approval gate.
- Supabase Edge Functions for heavy ingestion jobs.
- Observability dashboard (Supabase Logflare / Vercel Analytics).
- Advanced agent behaviors (reflection loops, memory summaries).

## 6. Risk Mitigation
- **Dependency risk:** Lock versions (`pnpm install --frozen-lockfile` in CI). Keep fallback providers (OpenAI) if Groq limits hit.
- **Latency issues:** Use background job for ingestion; prefetch retrieval.
- **Security gaps:** Enforce RLS, sanitize tool outputs, review supabase policies.
- **Scope creep:** Evaluate new ideas against success criteria; log for backlog.
- **Integration failures:** Schedule daily merge window + integration testing to avoid drift.

## 7. Resource Checklist
- Groq API key with sufficient quota.
- Supabase project with pgvector enabled.
- Vercel team access for deployments.
- Shared document repository (Google Drive/Notion) for ingestible content.
- Communication channel (Slack/Discord) + standup schedule.

---

**Next Actions (before coding):**
1. Review and adjust plan with team consensus.
2. Assign owners to Day 1 tasks; create tickets.
3. Confirm access to required services and gather credentials securely.
