import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { BaseMessage, ChatMessage } from "@langchain/core/messages";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

import { baseLangGraphAgent } from "@/lib/agents/baseAgent";
import type { AgentEvent } from "@/lib/agents/types";

export const runtime = "edge";

const convertVercelMessageToLangChainMessage = (message: VercelChatMessage) => {
  if (message.role === "user") {
    return new HumanMessage(message.content);
  }
  if (message.role === "system") {
    return new SystemMessage(message.content);
  }
  if (message.role === "assistant") {
    return new AIMessage(message.content);
  }

  return new ChatMessage(message.content, message.role);
};

const convertLangChainMessageToVercelMessage = (message: BaseMessage) => {
  if (message._getType() === "human") {
    return { content: message.content, role: "user" };
  }
  if (message._getType() === "ai") {
    return {
      content: message.content,
      role: "assistant",
      tool_calls: (message as AIMessage).tool_calls,
    };
  }
  if (message._getType() === "system") {
    return { content: message.content, role: "system" };
  }

  return { content: message.content, role: message._getType() };
};

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Missing GROQ_API_KEY. Add it to your environment to enable Groq-backed LangGraph runs.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const returnIntermediateSteps = Boolean(body.show_intermediate_steps);
    const messages = (body.messages ?? [])
      .filter(
        (message: VercelChatMessage) =>
          message.role === "user" || message.role === "assistant" || message.role === "system",
      )
      .map(convertVercelMessageToLangChainMessage);

    if (!returnIntermediateSteps) {
      const eventStream = await baseLangGraphAgent.streamEvents({ messages }, { version: "v2" });

      const textEncoder = new TextEncoder();
      const transformStream = new ReadableStream({
        async start(controller) {
          for await (const { event, data } of eventStream) {
            if (event === "on_chat_model_stream") {
              const content = data?.chunk?.content;
              if (Array.isArray(content)) {
                for (const part of content) {
                  if (part.type === "text" && part.text) {
                    controller.enqueue(textEncoder.encode(part.text));
                  }
                }
              } else if (typeof content === "string") {
                controller.enqueue(textEncoder.encode(content));
              }
            }
          }
          controller.close();
        },
      });

      return new StreamingTextResponse(transformStream);
    }

    const eventStream = await baseLangGraphAgent.streamEvents({ messages }, { version: "v2" });

    const events: AgentEvent[] = [];
    let finalMessages: BaseMessage[] = [];

    for await (const { event, data, runId } of eventStream) {
      switch (event) {
        case "on_tool_start":
          events.push({
            type: "tool_start",
            name: data?.name ?? "unknown",
            input: data?.input,
            runId,
            timestamp: Date.now(),
          });
          break;
        case "on_tool_end":
          events.push({
            type: "tool_end",
            name: data?.name ?? "unknown",
            output: data?.output,
            runId,
            timestamp: Date.now(),
          });
          break;
        case "on_chat_model_stream": {
          const content = data?.chunk?.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part.type === "text" && part.text) {
                events.push({
                  type: "model_chunk",
                  content: part.text,
                  timestamp: Date.now(),
                });
              }
            }
          } else if (typeof content === "string") {
            events.push({
              type: "model_chunk",
              content,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case "on_graph_end":
          finalMessages = data?.output?.messages ?? finalMessages;
          break;
        default:
          break;
      }
    }

    if (!finalMessages.length) {
      const result = await baseLangGraphAgent.invoke({ messages });
      finalMessages = result.messages;
    }

    return NextResponse.json(
      {
        events,
        messages: finalMessages.map(convertLangChainMessageToVercelMessage),
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown LangGraph error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
