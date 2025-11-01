// Tiny SSE (Server-Sent Events) parser for AI SDK UI message streams.
// It reads a Response.body (ReadableStream<Uint8Array>) and yields parsed JSON from `data:` lines.

export async function* parseSSE(response: Response): AsyncGenerator<any, void, unknown> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split on double newlines which delimit SSE events
      const events = buffer.split(/\n\n/);
      // Keep the last partial chunk in buffer
      buffer = events.pop() ?? "";

      for (const evt of events) {
        // Each event may have multiple lines, we care about lines starting with 'data:'
        const dataLines = evt
          .split(/\n/)
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length === 0) continue;
        const dataText = dataLines.join("\n");
        if (dataText === "[DONE]") {
          // Conventional terminator; ignore
          continue;
        }
        try {
          const json = JSON.parse(dataText);
          yield json;
        } catch {
          // Ignore malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
