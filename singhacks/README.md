# Tech stack

LangGraph-powered multi-agent workflow, a Next.js App Router frontend, and Supabase database + Supabase vector database

---

## Repository layout

- `singhacks/app/` - Next.js App Router pages, layouts, and route handlers.
- `singhacks/components/` - UI building blocks, including `ui/` (shadcn/ui primitives) and `ai-elements/` for streaming UX.
- `singhacks/lib/` - Shared utilities plus Supabase server/browser helpers.
- `HACKATHON_PLAN.md` - Day-by-day implementation timeline and milestones.
- `PROJECT_OVERVIEW.md` - Architecture, data model, and success criteria.
- `AGENTS.md` - Short instructions for collaborating coding assistants.

---

- https://ui.shadcn.com/docs/directory
- https://ui.aceternity.com/components
- https://github.com/langchain-ai/langgraphjs
- https://supabase.com/dashboard/project/unueczyhgdhhbpfjatxz/settings/general
-

## Onboarding

1. **Prerequisites**
   - Node.js 18.18+ (Next.js 15 requirement) and npm 9+.
2. **Clone & install**
   ```bash
   git clone <repo-url>
   cd singhacks
   npm install
   ```
3. **Configure environment variables**
   - Copy `.env.example` to `.env.local` in `singhacks/`.
   - Populate values (see [Environment variables](#environment-variables)).
   - Never commit real secrets.

```bash
 cd singhacks
 cp .env.example .env.local
```

4. **Run the app**
   ```bash
   npm run dev
   ```
   The app serves at `http://localhost:3000` with TurboPack enabled.
5. **Lint (optional but recommended)**
   ```bash
   npm run lint
   ```
6. **Supabase setup**
   - Run SQL migrations (when available) against your Supabase instance.
   - Configure local auth providers as needed for testing.
7. **Test third-party integrations**
   - Confirm Groq key works via a smoke request.
   - Validate sanctions API/Tavily credentials before hooking them into new LangGraph nodes.

---

## Environment variables

Add the following to `.env.local` (and to your Vercel project for deployments):

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key-for-server-only-usage
GROQ_API_KEY=groq-key-for-langgraph-llm-calls
GROQ_MODEL=llama3-70b-8192
TAVILY_API_KEY=tavily-search-key
OPENAI_API_KEY=optional-openai-fallback
```

> Keep service-role and provider keys server-side only. Prefix additional public values with `NEXT_PUBLIC_`.

---

## Tech stack & architecture

- **Framework**: Next.js 15 App Router with hybrid rendering (RSC + client components) and serverless route handlers.
- **UI**: Tailwind CSS with shadcn/ui primitives. For any new UI, compose shadcn/ui components and the shared `components/ai-elements` patterns to maintain consistency.
- **State & streaming**: Vercel AI SDK (`ai` package) to stream agent steps/results to the UI.
- **Supabase**: Auth, Postgres, optional pgvector. Use `lib/supabase` helpers for SSR-safe clients and cookie management.
- **AI orchestration**: LangGraph + LangChain running inside route handlers (`/api/langgraph`, `/api/screen`, `/api/ingest`, `/api/chat`). Groq models are the default; build fallbacks behind feature flags.
- **Data flow**: Form submission -> route handler -> LangGraph run -> streamed updates -> persistence of clients/reports/agent_runs in Supabase -> final risk report rendered.
- **Deployment**: Vercel for frontend/serverless runtime, Supabase cloud for data. Edge runtime preferred where dependencies allow; fall back to Node when SDKs require it.

---

## Development guidelines

- **UI rules**
  - Use shadcn/ui components (`components/ui`) as the base for any new visual element. Avoid third-party component libraries unless approved.
  - Follow the streaming UX patterns already defined in `components/ai-elements` so agent reasoning remains transparent.
  - Maintain accessibility: keyboard navigability, semantic HTML, and color contrast for risk badges (red/amber/green).
- **Serverless & agents**
  - Keep LangGraph definitions colocated under `lib/agents/` (create if missing) with clear node responsibilities per the project overview.
  - Stream all long-running tasks (sanctions checks, adverse media) back to the client using AsyncIterable/AI SDK utilities.
  - Guard tools that trigger external side effects behind approval toggles or role checks.
- **Data & security**
  - Implement Supabase tables and RLS policies as specified in `PROJECT_OVERVIEW.md`.
  - Never expose `SUPABASE_SERVICE_ROLE_KEY` or provider secrets to the browser.
  - Log agent runs (`agent_runs`) with steps and timestamps for auditability.
- **Code quality**
  - TypeScript everywhere; keep types in sync across agents, schema, and UI.
  - Prefer functional, composable helpers; `lib/utils.ts` already exposes `cn` and `hasEnvVars` helpers.
  - Run `npm run lint` before committing. Add tests for new LangGraph nodes or utilities where practical.
- **Integrations**
  - External APIs (Groq, Tavily, sanctions providers) should be wrapped in thin adapters with robust error handling and rate-limit awareness.
  - Feature-flag optional providers via env vars so the app can run in demo mode without them.

---

## Documentation map

- `PROJECT_OVERVIEW.md` - Deep-dive on architecture, agent workflow, database schema, deployment strategy, and success checklist. Start here when planning new features.
- `HACKATHON_PLAN.md` - Three-day execution plan with milestones, stretch goals, and risk matrix. Use it to align daily goals and task assignments.
- `AGENTS.md` - Quick reference for collaborating coding assistants (like this one). Extend it with additional automation guidelines if tooling evolves.
- Keep this README aligned with `PROJECT_OVERVIEW.md` and `HACKATHON_PLAN.md` whenever scope or responsibilities change.

---

## npm scripts

- `npm run dev` - Start the Next.js dev server with TurboPack.
- `npm run build` - Production build (required before Vercel deploys).
- `npm run start` - Run the production build locally.
- `npm run lint` - ESLint over the entire project.

---

## Next steps

1. Implement `/api/screen` LangGraph workflow with streaming updates and Supabase persistence.
2. Build dashboards/forms in the App Router using shadcn/ui components.
3. Harden Supabase RLS rules and log agent runs for audit trails.
4. Deploy to Vercel once integration tests pass and environment variables are configured.
