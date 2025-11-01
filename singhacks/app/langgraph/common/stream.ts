import { toSSE, type GraphEvent } from "@/app/langgraph/common/events";

export type SSEController = {
  write: (event: GraphEvent) => Promise<void>;
  close: () => Promise<void>;
  response: Response;
};

export function createSSEController(): SSEController {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  let isClosed = false;

  const write = async (event: GraphEvent) => {
    if (isClosed) return;
    const chunk = toSSE(event);
    try {
      await writer.write(encoder.encode(chunk));
    } catch (error: unknown) {
      // Swallow write errors when client disconnects or stream is closed
      const message = error instanceof Error ? error.message : String(error ?? "");
      const name = error instanceof Error ? error.name : "";
      const normalizedMessage = message.toLowerCase();
      const normalizedName = name.toLowerCase();
      if (
        normalizedName.includes("abort") ||
        normalizedMessage.includes("abort") ||
        normalizedMessage.includes("aborted") ||
        normalizedMessage.includes("closed")
      ) {
        isClosed = true;
        return;
      }
      // For other errors, mark closed to avoid repeated exceptions
      isClosed = true;
    }
  };

  const close = async () => {
    if (isClosed) return;
    isClosed = true;
    try {
      await writer.close();
    } catch {
      // no-op
    }
  };

  const response = new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Allow CORS in dev by default; tighten in prod as needed
      "Access-Control-Allow-Origin": "*",
    },
  });

  return { write, close, response };
}
