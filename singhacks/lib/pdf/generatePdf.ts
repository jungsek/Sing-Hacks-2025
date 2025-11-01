import type { ReactElement, JSXElementConstructor } from "react";

export type PdfFont = { name: string; path: string };

export type PdfOptions = {
  filename?: string;
  format?: string;
  fonts?: PdfFont[];
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error ?? "");
};

const toBufferChunk = (chunk: unknown): Buffer => {
  if (typeof Buffer === "undefined") {
    throw new Error("Buffer is not available in this environment");
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk);
  }

  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }

  throw new TypeError(`Unsupported PDF chunk type: ${typeof chunk}`);
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
  if (!value) return false;
  return (
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
};

const isNodeReadable = (value: unknown): value is NodeJS.ReadableStream => {
  return Boolean(value && typeof (value as NodeJS.ReadableStream).on === "function");
};

const isWebReadableStream = (value: unknown): value is ReadableStream<Uint8Array> => {
  return Boolean(value && typeof (value as ReadableStream<Uint8Array>).getReader === "function");
};

async function collectFromAsyncIterable(iterable: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of iterable) {
    chunks.push(toBufferChunk(chunk));
  }
  return Buffer.concat(chunks);
}

async function collectFromNodeStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (data: unknown) => {
      try {
        chunks.push(toBufferChunk(data));
      } catch (conversionError) {
        reject(conversionError);
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return Buffer.concat(chunks);
}

async function collectFromWebStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
    }
  }

  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return Buffer.from(merged);
}

async function normalisePdfOutput(output: unknown): Promise<Buffer> {
  if (typeof Buffer === "undefined") {
    throw new Error("Buffer constructor not available in this runtime");
  }

  if (Buffer.isBuffer(output)) {
    return output;
  }

  if (isNodeReadable(output)) {
    return collectFromNodeStream(output);
  }

  if (isAsyncIterable(output)) {
    return collectFromAsyncIterable(output);
  }

  if (isWebReadableStream(output)) {
    return collectFromWebStream(output);
  }

  if (output instanceof Uint8Array || output instanceof ArrayBuffer || typeof output === "string") {
    return toBufferChunk(output);
  }

  return Buffer.from(String(output ?? ""));
}

/**
 * Render a React PDF Document (built with @react-pdf/renderer) to a Buffer.
 *
 * The function uses dynamic imports so the repo doesn't require @react-pdf/renderer
 * unless you actually use PDF generation. If the package is not installed, the
 * function throws a helpful error instructing how to add it.
 */
export async function generatePdf(
  doc: ReactElement<any, string | JSXElementConstructor<any>>,
  options: PdfOptions = {},
): Promise<Buffer> {
  try {
    const pdfModule = await import("@react-pdf/renderer");

    if (Array.isArray(options.fonts) && options.fonts.length > 0 && pdfModule.Font) {
      for (const font of options.fonts) {
        try {
          pdfModule.Font.register({ family: font.name, src: font.path });
        } catch (fontError) {
          const message = getErrorMessage(fontError);
          console.warn(`Failed to register font '${font.name}': ${message}`);
        }
      }
    }

    const instance = pdfModule.pdf(doc);
    const candidates = instance as unknown as {
      toBuffer?: () => Promise<unknown>;
      toStream?: () => Promise<unknown>;
    };

    let output: unknown;

    if (typeof candidates.toBuffer === "function") {
      try {
        output = await candidates.toBuffer();
      } catch (innerError) {
        const methods = Object.keys(instance as Record<string, unknown>).join(", ");
        const message = getErrorMessage(innerError);
        const augmented = new Error(`toBuffer() failed: ${message}; instanceKeys=${methods}`);
        augmented.cause = innerError instanceof Error ? innerError : undefined;
        throw augmented;
      }
    } else if (typeof candidates.toStream === "function") {
      try {
        output = await candidates.toStream();
      } catch (innerError) {
        const methods = Object.keys(instance as Record<string, unknown>).join(", ");
        const message = getErrorMessage(innerError);
        const augmented = new Error(`toStream() failed: ${message}; instanceKeys=${methods}`);
        augmented.cause = innerError instanceof Error ? innerError : undefined;
        throw augmented;
      }
    } else {
      output = instance;
    }

    return await normalisePdfOutput(output);
  } catch (error) {
    const message = getErrorMessage(error);
    if (/Cannot find module|ERR_MODULE_NOT_FOUND/.test(message)) {
      throw new Error(
        "@react-pdf/renderer is not installed. Run: 'npm install @react-pdf/renderer' or 'pnpm add @react-pdf/renderer' and retry. If you plan to use Puppeteer instead, implement generatePdf accordingly.",
      );
    }

    if (error instanceof Error) throw error;
    throw new Error(message);
  }
}

export default generatePdf;
