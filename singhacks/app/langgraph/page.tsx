"use client";

import { Suspense } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { GuideInfoBox } from "@/components/guide/GuideInfoBox";

function LanggraphClient() {
  const EmptyState = (
    <GuideInfoBox>
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          This LangGraph demo runs entirely inside the Next.js app. It uses Groq for fast inference,
          Tavily for live research, and LlamaIndex to transform any documents you ingest during the
          session.
        </p>
        <p>
          Toggle “Show intermediate steps” to inspect tool calls and reasoning trace. Provide longer
          text snippets to let the agent break them down with LlamaIndex before answering follow-up
          questions.
        </p>
      </div>
    </GuideInfoBox>
  );

  return (
    <ChatWindow
      endpoint="api/langgraph"
      placeholder="Ask about a regulation, paste a policy to ingest, or request fresh research."
      emoji="✨"
      emptyStateComponent={EmptyState}
      showIntermediateStepsToggle
    />
  );
}

export default function LanggraphPage() {
  return (
    <Suspense>
      <LanggraphClient />
    </Suspense>
  );
}
