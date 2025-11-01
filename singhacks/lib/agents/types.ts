import type { BaseMessage } from "@langchain/core/messages";

export type AgentMessage = BaseMessage;

export type AgentToolStart = {
  type: "tool_start";
  name: string;
  input: unknown;
  runId?: string;
  timestamp: number;
};

export type AgentToolEnd = {
  type: "tool_end";
  name: string;
  output: unknown;
  runId?: string;
  timestamp: number;
};

export type AgentModelStream = {
  type: "model_chunk";
  content: string;
  timestamp: number;
};

export type AgentEvent = AgentToolStart | AgentToolEnd | AgentModelStream;

export type AgentResponse = {
  messages: AgentMessage[];
  events: AgentEvent[];
};
