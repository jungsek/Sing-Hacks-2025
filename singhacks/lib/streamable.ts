// Minimal stream helpers to replace deprecated `ai/rsc` imports.
// Provides createStreamableValue (server) and readStreamableValue (client).

export type StreamableValue<T> = {
  value: ReadableStream<T>;
  update: (chunk: T) => void;
  done: () => void;
};

export function createStreamableValue<T>(): StreamableValue<T> {
  let controller: ReadableStreamDefaultController<T> | null = null;

  const stream = new ReadableStream<T>({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = null;
    },
  });

  return {
    value: stream,
    update(chunk: T) {
      controller?.enqueue(chunk);
    },
    done() {
      controller?.close();
    },
  };
}

export async function* readStreamableValue<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value as T;
    }
  } finally {
    reader.releaseLock();
  }
}
