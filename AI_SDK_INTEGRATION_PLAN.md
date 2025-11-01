# AI SDK Integration Plan – Regulations Page

## 1. Objectives

- Use the Vercel AI SDK as the streaming bridge between the Regulations page and the LangGraph regulatory agent.
- Surface the agent’s reasoning and task progression through the `ai-elements` (`Reasoning`, `Task`) components already present in the component library.
- Preserve the existing Supabase refresh behaviour so the UI reflects newly persisted regulatory artefacts once the agent run completes.

## 2. Current State Summary

- `/api/aml/regulatory/scrape` runs `regulatoryNode`, returning the updated state and a list of `GraphEvent` objects. It does **not** currently stream; clients poll or trigger refreshes.
- `RegulatoryConsole` uses a manual SSE connection to `/api/aml/monitor`, ingesting LangGraph events and showing raw logs.
- The Regulations page fetches persisted Supabase records and offers a “Update Regulations” button that synchronously calls the scrape API and re-queries the database once finished.
- Sample AI SDK usage exists in `app/ai_sdk/agent` demonstrating how to wrap LangChain/LangGraph streaming events with `createStreamableValue` + `readStreamableValue`.
- The broader architecture (see “Agentic AI Integration Plan”) already runs LangGraph as a runtime on port 2024 and exposes multiple patterns:
  - Direct LangGraph client (`app/langgraph/page.tsx`) calling the runtime.
  - Next.js API routes streaming model output (`app/api/chat/*`).
  - AI SDK server actions streaming agent events (`app/ai_sdk/*`).

## 3. Target Architecture

1. **Server streaming layer (AI SDK middleman)**

   - Introduce a new server action (or edge-compatible route) under `app/regulations` that wraps `regulatoryNode` execution with `createStreamableValue`, mirroring `app/ai_sdk/agent/action.ts`.
   - The action will become the “AI SDK middleman”: it invokes LangGraph server-side (same process) and emits structured streaming payloads that the React client can consume through `readStreamableValue`.
   - It should accept optional regulator filters, align with existing `/api/aml/regulatory/scrape` input, and return a final state summary for post-run refresh.

2. **LangGraph invocation strategy**

   - Use the same LangGraph runtime that already powers Sentinel nodes. Because the Next.js API and the LangGraph agent reside in the same codebase, call `regulatoryNode` directly (same as the current API), but stream internal `emitEvent` outputs to the AI SDK action.
   - Alternatively (future-proofing), parameterize the action to optionally proxy to the standalone LangGraph runtime (`http://localhost:2024`) using the LangGraph SDK client, keeping the AI SDK layer as translator. This mirrors `app/langgraph/page.tsx` but keeps credentials on the server.

3. **Client streaming hook/component**

   - Build a `useRegulationAgentStream` hook or `RegulationAgentStream` component inside `components/regulations`.
   - Responsibilities:
     - Trigger the server action and iterate over the `StreamableValue` with `readStreamableValue`.
     - Normalise incoming payloads into `tasks`, `reasoning`, `status` states.
     - Invoke the existing Supabase refresh (from `fetchEntries`) once the stream signals completion.

4. **UI composition on the Regulations page**

   - Position the streaming panel next to the existing action controls.
   - Use `Reasoning`, `ReasoningTrigger`, `ReasoningContent` to display a rolling narrative (agent thoughts, final snippets).
   - Use `Task`, `TaskTrigger`, `TaskContent`, `TaskItem` to show per-node/tool progress.
   - Retain the current cards grid for persisted documents; only enhance the top-of-page experience.

5. **Alignment with “Agentic AI Integration Plan”**
   - Follow the documented development workflow: Next.js dev server + LangGraph runtime in tandem.
   - Ensure required env vars (OpenAI/Tavily) are declared in `.env` so both LangGraph and the AI SDK action can access tools.
   - Adopt the same streaming error-handling patterns as `app/api/chat/agents/route.ts` and `app/ai_sdk/agent/action.ts`.

## 4. Streaming Payload Mapping

| LangGraph Event                        | UI Target                            | Notes                                           |
| -------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| `on_node_start`                        | Task start                           | Label with node name (e.g., “Scan MAS portal”). |
| `on_tool_call`                         | Task detail                          | Include tool name, counts, and queries.         |
| `on_node_end`                          | Task completion                      | Update task status to “Done”.                   |
| `on_artifact`                          | Reasoning snippet and/or task detail | Attach text to reasoning feed.                  |
| `on_error`                             | Task + Reasoning                     | Flag failure, surface actionable message.       |
| Snippets (`state.regulatory_snippets`) | Reasoning                            | Append to reasoning content once run completes. |

## 5. Implementation Steps (Expanded)

1. **Server Action (AI SDK layer)**

   - File: `app/regulations/actions.ts` (server) exporting `streamRegulationAgent`.
   - Steps:
     1. Import `createStreamableValue`/`StreamData` from `ai/rsc`.
     2. Accept payload `{ regulators?: string[] }`.
     3. Initialise `createStreamableValue`, spawn async worker similar to `runAgent` in `app/ai_sdk/agent/action.ts`.
     4. Inside worker:
        - Build initial LangGraph state from parameters.
        - Wrap `emitEvent` so each LangGraph event is `stream.update({ type: "event", event })`.
        - On completion, send `{ type: "final", state }`.
        - On error, send `{ type: "error", message }`.
     5. Return `{ streamData: stream.value }`.
   - Keep existing Supabase persistence unchanged; the action only orchestrates and forwards events.

2. **Client Hook / Controller**

   - File: `components/regulations/use-regulation-agent-stream.ts` (client).
   - Steps:
     1. Expose `runAgent` method that calls the server action.
     2. Consume the stream via `readStreamableValue`.
     3. Maintain local state objects:
        - `tasks: Array<{ id; title; status; details[] }>`
        - `reasoning: Array<{ id; text; level }>`
        - `status: "idle" | "running" | "success" | "error"`
        - `error?: string`
     4. Translate incoming event payloads using the mapping table.
     5. Resolve a promise when final payload arrives so the caller can trigger `fetchEntries`.

3. **UI Integration**

   - Within `app/regulations/page.tsx`:
     1. Import and invoke the hook.
     2. Replace `handleUpdateRegulations` logic with `await runAgent({ regulators: [...] })`.
     3. Trigger the Supabase refetch once `status === "success"`.
     4. Render:
        - `<Reasoning>` with `isStreaming={status === "running"}` and `ReasoningContent` bound to current reasoning text (join or show list).
        - `<Task>` per active task (or one Task component with nested items).
     5. Provide fallback to traditional POST if the stream errors immediately (network issues).

4. **Verification & Dev Loop**

   - Follow the “Start Everything Locally” instructions from the integration plan:
     - `npx @langchain/langgraph-sdk dev --port 2024` for LangGraph runtime when needed.
   - Ensure env vars are set so Tavily/OpenAI tools succeed.
   - Test:
     - Start a run and confirm tasks/reasoning update live.
     - Confirm cards refresh after success.
     - Verify errors bubble up gracefully.

5. **Optional Enhancements**
   - Add progress metrics (percentage) using known steps from the regulatory node pipeline.
   - Persist run history (using `logAgentRun`) and render in a collapsible timeline.
   - Provide a toggle to stream from a remote LangGraph runtime (prod vs dev).

## 6. Open Questions / Considerations

- Determine whether to expose regulator filters in the new UI (propagate to server action).
- Decide how much of the raw snippet text should surface in Reasoning vs. remain in toast/log form.
- Ensure the new action respects authentication / rate limiting rules (if any) that exist for the current POST handler.
- Consider how the streaming UI behaves if the LangGraph runtime is offline; provide user-facing feedback and fallback.
- Align naming with the integration plan’s terminology (assistant IDs, runtime ports) so future developers can map concepts quickly.

The Agents example contains an agent which streams data back to the client using the streamEvents API.

The Tools example shows how to invoke a simple tool calling model, and stream back the result.

streamEvents
streamEvents(input, options, streamOptions?): IterableReadableStream<StreamEvent>
Generate a stream of events emitted by the internal steps of the runnable.

Use to create an iterator over StreamEvents that provide real-time information about the progress of the runnable, including StreamEvents from intermediate results.

A StreamEvent is a dictionary with the following schema:

event: string - Event names are of the format: on*[runnable_type]*(start|stream|end).
name: string - The name of the runnable that generated the event.
run_id: string - Randomly generated ID associated with the given execution of the runnable that emitted the event. A child runnable that gets invoked as part of the execution of a parent runnable is assigned its own unique ID.
tags: string[] - The tags of the runnable that generated the event.
metadata: Record<string, any> - The metadata of the runnable that generated the event.
data: Record<string, any>
Below is a table that illustrates some events that might be emitted by various chains. Metadata fields have been omitted from the table for brevity. Chain definitions have been included after the table.

ATTENTION This reference table is for the V2 version of the schema.
