"use client";

import { FormEvent, ReactNode, memo, useCallback, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Role = "user" | "assistant" | "system";

type ChatWindowMessage = {
  id: string;
  role: Role;
  content: string;
};

type ChatWindowProps = {
  endpoint: string;
  placeholder?: string;
  emptyStateComponent?: ReactNode;
  emoji?: string;
  showIntermediateStepsToggle?: boolean;
};

type ChatInputProps = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop?: () => void;
  loading?: boolean;
  placeholder?: string;
  actions?: ReactNode;
};

type ChatLayoutProps = {
  content: ReactNode;
  footer: ReactNode;
};

const toRequestMessages = (messages: ChatWindowMessage[]) =>
  messages.map(({ role, content }) => ({ role, content }));

type AssistantApiMessage = { role: string; content: unknown };

const mapResponseMessages = (messages: AssistantApiMessage[] | undefined) =>
  (messages ?? [])
    .filter((message) => message?.role && message?.content != null)
    .map((message) => {
      let content: string;

      if (typeof message.content === "string") {
        content = message.content;
      } else if (Array.isArray(message.content)) {
        content = message.content
          .map((part: unknown) => {
            if (typeof part === "string") return part;
            if (
              typeof part === "object" &&
              part !== null &&
              "text" in part &&
              typeof (part as { text?: unknown }).text === "string"
            ) {
              return (part as { text: string }).text;
            }
            return typeof part === "object" ? JSON.stringify(part) : "";
          })
          .join("");
      } else if (message.content?.text) {
        content = message.content.text;
      } else {
        content = JSON.stringify(message.content);
      }

      return {
        id: nanoid(),
        role: message.role as Role,
        content,
      };
    });

export const ChatLayout = memo(function ChatLayout(props: ChatLayoutProps) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-muted bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">{props.content}</div>
      <div className="border-t px-4 py-4 sm:px-8">{props.footer}</div>
    </div>
  );
});

export const ChatInput = memo(function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  loading,
  placeholder,
  actions,
}: ChatInputProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "Ask the agent a question..."}
        className="min-h-[96px] resize-y rounded-2xl border-muted bg-background focus-visible:ring-2 focus-visible:ring-ring/30"
        disabled={loading}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">{actions}</div>
        <div className="flex items-center gap-2">
          {loading && onStop ? (
            <Button type="button" variant="outline" onClick={onStop} className="rounded-full">
              Stop
            </Button>
          ) : null}

          <Button type="submit" disabled={loading || !value.trim()} className="rounded-full">
            Send
          </Button>
        </div>
      </div>
    </form>
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  emoji,
}: {
  message: ChatWindowMessage;
  emoji?: string;
}) {
  const isUser = message.role === "user";
  const label = useMemo(() => {
    if (isUser) return "You";
    if (message.role === "system") return "System";
    return "Aura";
  }, [isUser, message.role]);

  return (
    <div
      className={cn(
        "flex max-w-3xl flex-col gap-2 text-sm leading-relaxed",
        isUser ? "ml-auto items-end text-right" : "mr-auto items-start",
      )}
    >
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div
        className={cn(
          "rounded-3xl px-5 py-3 shadow-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground",
        )}
      >
        <p className="whitespace-pre-line">
          {message.role === "assistant" && emoji ? `${emoji} ` : null}
          {message.content}
        </p>
      </div>
    </div>
  );
});

export function ChatWindow({
  endpoint,
  placeholder,
  emptyStateComponent,
  emoji,
  showIntermediateStepsToggle = false,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController>();
  const [showIntermediateSteps, setShowIntermediateSteps] = useState(false);
  type IntermediateEvent = { type?: string; name?: string };
  type IntermediatePayload = { events?: IntermediateEvent[] } | null;
  const [intermediatePayload, setIntermediatePayload] = useState<IntermediatePayload>(null);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setAbortController(undefined);
    setIsLoading(false);
  }, [abortController]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }

      const userMessage: ChatWindowMessage = {
        id: nanoid(),
        role: "user",
        content: trimmed,
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInputValue("");
      setIsLoading(true);
      setIntermediatePayload(null);

      try {
        if (showIntermediateSteps) {
          const response = await fetch(`/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: toRequestMessages(nextMessages),
              show_intermediate_steps: true,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
          }

          const payload = (await response.json()) as unknown;
          const assistantMessages = mapResponseMessages(
            (payload as { messages?: AssistantApiMessage[] }).messages,
          );
          setMessages([...nextMessages, ...assistantMessages]);
          setIntermediatePayload((payload as { events?: IntermediateEvent[] }) ?? null);
        } else {
          const controller = new AbortController();
          setAbortController(controller);
          const response = await fetch(`/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              messages: toRequestMessages(nextMessages),
              show_intermediate_steps: false,
            }),
          });

          if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(errorText || response.statusText);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let assistantContent = "";

          setMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              content: "",
            },
          ]);

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            assistantContent += decoder.decode(value, { stream: true });
            setMessages((prev) => {
              const next = [...prev];
              const lastIndex = next.length - 1;
              next[lastIndex] = {
                ...next[lastIndex],
                content: assistantContent,
              };
              return next;
            });
          }

          reader.releaseLock();
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        const message = error instanceof Error ? error.message : "Agent request failed";
        toast.error("Agent request failed", { description: message });
        setMessages(nextMessages);
      } finally {
        setIsLoading(false);
        setAbortController(undefined);
      }
    },
    [endpoint, inputValue, messages, showIntermediateSteps],
  );

  const conversationContent = useMemo(() => {
    if (!messages.length) {
      return (
        emptyStateComponent ?? (
          <div className="rounded-3xl border border-dashed border-muted-foreground/30 p-6 text-center text-muted-foreground">
            <p className="text-sm">Ask the agent something to kick off the conversation.</p>
          </div>
        )
      );
    }

    return (
      <div className="flex flex-col gap-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} emoji={emoji} />
        ))}

        {showIntermediateSteps && intermediatePayload?.events ? (
          <div className="rounded-2xl border border-muted bg-muted/40 p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Intermediate steps
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {intermediatePayload.events.map((event: IntermediateEvent, index: number) => (
                <li key={index}>
                  <code>{event.type}</code>
                  {event.name ? ` — ${event.name}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }, [messages, emptyStateComponent, emoji, intermediatePayload, showIntermediateSteps]);

  return (
    <ChatLayout
      content={conversationContent}
      footer={
        <ChatInput
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onSubmit={handleSubmit}
          onStop={handleStop}
          loading={isLoading}
          placeholder={placeholder}
          actions={
            showIntermediateStepsToggle ? (
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-muted-foreground/40"
                  checked={showIntermediateSteps}
                  onChange={(event) => setShowIntermediateSteps(event.target.checked)}
                />
                Show intermediate steps
              </label>
            ) : null
          }
        />
      }
    />
  );
}
