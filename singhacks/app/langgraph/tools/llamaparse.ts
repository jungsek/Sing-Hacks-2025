export type ParsedDocument = {
  text: string;
  pages: number;
  metadata?: Record<string, unknown>;
};

export async function parseDocumentBuffer(buffer: Buffer): Promise<ParsedDocument> {
  // Currently only supports PDF via pdf-parse; extend later for images/docx
  // Import the core parser directly to avoid the index.js debug harness
  // Note: Import internal "lib/pdf-parse.js" to avoid index.js debug harness that reads ./test/data/*
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - pdf-parse does not publish types for the internal path
  const mod = (await import("pdf-parse/lib/pdf-parse.js").catch(() => import("pdf-parse"))) as any;
  const pdfParseFn = (mod && (mod.default ?? mod)) as (buf: Buffer) => Promise<any>;
  const result = await pdfParseFn(buffer);
  const pages = typeof (result as any).numpages === "number" ? (result as any).numpages : 0;
  const metadata = (result as any).info ?? undefined;
  return {
    text: result.text ?? "",
    pages,
    metadata,
  };
}

export function chunkText(text: string, maxLen = 1200): string[] {
  const chunks: string[] = [];
  if (!text || text.length === 0) return chunks;
  let i = 0;
  while (i < text.length) {
    const slice = text.slice(i, i + maxLen);
    chunks.push(slice);
    i += maxLen;
  }
  return chunks;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough heuristic: ~4 chars per token
  return Math.ceil(text.length / 4);
}
