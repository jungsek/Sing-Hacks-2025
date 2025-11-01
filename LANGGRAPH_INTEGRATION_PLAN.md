**Models & Inference**

- **Groq**: Blazing-fast inference with Groq LPU™ hardware. Perfect for ultra-low-latency LLM + multimodal applications. Hackathon participants get API credits to test large-scale, real-time AI. [Visit Groq](https://groq.com/)

---

**Agentic AI Frameworks**

- **LangChain:** Industry-standard framework for chaining prompts, memory, and tools. [Visit LangChain](https://www.langchain.com/)
- **LangGraph:** Graph-based orchestration for building reliable multi-agent workflows. [Visit LangGraph](https://www.langchain.com/langgraph)

---


**Web Access**

**File & Document Ingestion**

- **Tavily:** Connect your agent to the Web. [Visit Tavily](https://www.tavily.com/)
- **Llama Index:** Transform unstructured data into LLM optimized formats. [Visit Llama Index](https://www.llamaindex.ai/llamaparse)

what’s in each folder
1) app/agents
page.tsx
UI page that renders a ChatWindow pointing at endpoint="api/chat/agents".
Includes “show intermediate steps” toggle to switch the API mode between streamed token output and JSON responses with intermediate steps.
Purpose: Demo/UX for a LangGraph “ReAct with tools” agent exposed at our Next.js route.
Integration notes:

This is already wired to route.ts—keep as a demo/validation page during development.
Works best when SERPAPI_API_KEY is set (search tool) and OpenAI key is set.
2) app/ai_sdk
This is a pair of React Server Components (RSC) demos showing direct server actions-based streaming with the Vercel AI SDK. Useful patterns to reuse for /api/screen streaming.

page.tsx

Landing page linking to the two demos: Agents and Tools.
action.ts and page.tsx

Server action runAgent(input: string):
Constructs a tool-calling agent using createToolCallingAgent with TavilySearchResults and a prompt from the LangChain Hub.
Streams events with agentExecutor.streamEvents(..., { version: "v2" }).
Uses createStreamableValue() to stream server-to-client in RSC.
Client page calls runAgent and consumes the stream with readStreamableValue, rendering event objects.
action.ts and page.tsx

Server action executeTool(input, { wso, streamEvents }):
Either uses withStructuredOutput (WSO) or function tools with Zod schema (get_weather).
Supports two streaming modes: streamEvents or chain.stream(...).
Client toggles which mode to use and renders streamed records.
Integration notes:

These demos are educational. The RSC streaming pattern is valuable if we want to stream structured step events for /api/screen without building a separate SSE transform.
Requires OPENAI_API_KEY and TAVILY_API_KEY (for Tavily), otherwise swap out tools.
3) app/api/chat
These are ready-made App Router route handlers demonstrating multiple patterns. All are runtime = "edge"—good for serverless.

route.ts

Simple “pirate” chat chain with PromptTemplate + ChatOpenAI + HttpResponseOutputParser.
Streams model output using chain.stream(...), returning StreamingTextResponse.
Good reference for base streaming on Edge.
route.ts

ReAct agent using createReactAgent with tools: SerpAPI and Calculator.
Two modes:
Default: Stream only final LLM tokens (filters on_chat_model_stream events with content).
show_intermediate_steps = true: Returns JSON with full messages (no streaming).
Good pattern for streaming token output from LangGraph agents on Edge.
route.ts

Retrieval chain with Supabase vector store. Constructs:
standaloneQuestionChain (question condensation)
retrievalChain (retriever -> combine docs)
answerChain (prompt -> model)
conversationalRetrievalQAChain (orchestrates above)
Streams text and returns headers:
x-message-index
x-sources (base64 of trimmed source docs)
Requires env: SUPABASE_URL, SUPABASE_PRIVATE_KEY, and an RPC match_documents and table documents.
route.ts

ReAct agent with a retriever tool (createRetrieverTool from a SupabaseVectorStore).
Same two modes as the agents route: streamed tokens vs. JSON with steps.
Requires OpenAI + Supabase env.
route.ts

JSON structured output using Zod + withStructuredOutput.
Returns JSON (no streaming). Useful as a reference for structured task outputs in our compliance workers.
Integration notes:

These are fully usable now if envs are set and the Supabase vector schema exists.
The streaming patterns here (both token streaming and event streaming) are the exact foundations we’ll use for /api/screen.
4) route.ts
Ingest text into Supabase documents using OpenAIEmbeddings.
Splits text with RecursiveCharacterTextSplitter and inserts embeddings with SupabaseVectorStore.fromDocuments.
Requires:
SUPABASE_URL, SUPABASE_PRIVATE_KEY
documents table and match_documents RPC in Supabase
runtime = "edge", so it’s deployable serverlessly.
Integration notes:

Stick to this for initial RAG ingestion, if we choose to use doc-based retrieval for EDD sources later (optional per MVP).
5) app/langgraph
page.tsx

Client page using @langchain/langgraph-sdk/react’s useStream to connect to a LangGraph server at apiUrl: "http://localhost:2024", assistantId: "agent".
Provides thread management, branch picker, edit/regenerate, etc.
This assumes an external LangGraph server is running.
agent.ts

A tiny StateGraph with a single agent node calling OpenAI in pirate dialect.
Compiled to graph export.
langgraph.json

Maps agent name to the graph export in agent.ts. Used by LangGraph server tooling.
Integration notes:

This page is a client for the LangGraph SDK server, not a Next.js route. It does not run in-process.
For our “serverless as much as possible” goal, we should either:
Option A (dev): Run a separate LangGraph server for assistantId: "agent" during development.
Option B (preferred for MVP): Build a Next.js route that imports graph and streams events/tokens in-process, then adapt the page to consume that stream (Vercel AI SDK or SSE)—no separate server needed.
integration steps and recommendations
Here’s a concrete plan to wire these pieces into Aura’s architecture with minimal friction and aligned to PROJECT_OVERVIEW.md.

Environment variables
Required now:
OPENAI_API_KEY (current routes use ChatOpenAI)
SERPAPI_API_KEY (for chat/agents)
SUPABASE_URL, SUPABASE_PRIVATE_KEY (for retrieval + ingest)
Nice-to-have / planned:
TAVILY_API_KEY (if you keep the ai_sdk/agent demo)
For MVP Aura routes: GROQ_API_KEY, TAVILY_API_KEY, SANCTIONS_API_PROVIDER, SANCTIONS_API_KEY
Set them in .env.local (dev) and in Vercel project settings.
Supabase setup (if using retrieval examples)
Ensure:
documents table and match_documents RPC as per LangChain + Supabase vector store docs
RLS enabled; scope access appropriately (for MVP you can start simple; secure later).
Keep demo ingest under dev-only guard (NEXT_PUBLIC_DEMO stops ingestion by default).
Keep the demo pages for validation
/agents is a good example driving api/chat/agents. It proves Edge streaming + tools work.
/ai_sdk/* are excellent RSC streaming references. Don’t rely on them for the main MVP, but reuse the patterns when implementing /api/screen stream events.
Decide how to handle app/langgraph
Option A (dev separate server):
Install LangGraph server tooling and run a local server serving assistantId: "agent" as declared by langgraph.json.
Pros: Great playground for LangGraph features (branching, checkpoints).
Cons: Not serverless-in-Next.js; extra infra.
Option B (recommended for MVP):
Create a Next.js route, e.g. route.ts, that imports graph from agent.ts and runs it in-process.
Stream content using patterns from route.ts (token streaming) or ai_sdk (RSC streaming or streamEvents).
Update page.tsx to consume that Next.js route instead of useStream from LangGraph SDK.
Result: Fully serverless on Vercel without a separate microservice.
Prepare for /api/screen (Aura MVP)
Reuse the streaming patterns:
For JSON step events: mimic action.ts streamEvents and transform to our event schema; or implement a small event emitter to stream step/final payloads.
For token-like streaming: route.ts token filter is a good example, but /api/screen needs step/finding/final events instead of tokens.
Implement the graph in singhacks/lib/agents as planned (supervisor + workers), then:
Add route.ts as Edge runtime, which:
Validates { clientName, clientCountry }
Runs graph with streaming events
Persists client/report/findings/steps to Supabase at the end (or progressively later)
UI:
Point your screening form to POST /api/screen; use client-side EventSource or Vercel AI SDK to consume “step/finding/final” events.
Reuse components/ai-elements/* to render the glass-box timeline.
Persistence and RLS
Retrieval examples write embeddings to documents. Aura’s MVP persistence is separate:
clients, reports, report_findings, and agent_runs as described in PROJECT_OVERVIEW.md.
For MVP, persist final results at stream completion (keep Edge). Phase 3: add checkpointer or resume flows using Node runtime if needed.
Edge vs Node runtime choices
All the included routes declare runtime = "edge", which is ideal.
If you later add a LangGraph Postgres checkpointer or Node-only SDKs, use a separate Node route for that functionality and keep streaming endpoints Edge if possible.
Guardrails and readiness
api/chat/agents: Ensure SERPAPI_API_KEY if you keep the web search tool; otherwise remove SerpAPI or swap for a different tool.
retrieval routes: Ensure Supabase setup; otherwise these routes will fail.
ai_sdk demos: Require OpenAI + Tavily; keep them as reference and dev-only.
quick file-by-file purpose map
page.tsx: UI for agents demo; uses api/chat/agents.
app/ai_sdk/agent/*: RSC demo streaming agent events with tools; educational pattern for /api/screen.
app/ai_sdk/tools/*: RSC demo streaming structured tool outputs; shows both withStructuredOutput and tool functions.
route.ts: simple chat stream.
route.ts: ReAct agent; streamed tokens or JSON messages; Edge.
route.ts: RAG chain; streams + headers with sources; Edge.
route.ts: RAG agent with retriever tool; tokens or JSON; Edge.
route.ts: LLM structured output to JSON; Edge.
route.ts: doc ingest into Supabase vectors; Edge.
page.tsx: LangGraph SDK client page; expects external server.
agent.ts: a compiled LangGraph graph (pirate agent).
langgraph.json: maps assistantId to the graph.
recommended next actions
Choose Option B for app/langgraph (in-process route) to keep the stack serverless and consistent with the rest of the app.
Keep /agents and /api/chat/* routes as working demonstrations.
Use the ai_sdk streaming pattern for /api/screen so you can stream explicit step/finding/final JSON events, not just tokens.
When ready, I can:
Create singhacks/lib/agents/types.ts and minimal scaffolding for /api/screen.
Add an Edge route api/langgraph/agent importing graph and streaming it.
Hook the UI to render streamed events using your ai-elements/*.
