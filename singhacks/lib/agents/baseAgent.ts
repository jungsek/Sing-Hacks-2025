import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGroq } from "@langchain/groq";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { tool } from "@langchain/core/tools";
import { SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { nanoid } from "nanoid";

type StoredChunk = {
  id: string;
  documentId: string;
  text: string;
  length: number;
};

const documentChunks = new Map<string, StoredChunk[]>();

const ingestDocumentSchema = z.object({
  documentId: z.string().describe("Stable identifier for the document, e.g., a filename."),
  title: z.string().optional().describe("Optional short title describing the document."),
  content: z.string().min(10).describe("Full plaintext content to break down and store."),
});

type IngestDocumentInput = z.infer<typeof ingestDocumentSchema>;

const ingestDocumentTool = tool(
  async ({ documentId, content, title }: IngestDocumentInput) => {
    const chunkSize = 800;
    const overlap = 80;

    const splitIntoChunks = (text: string): string[] => {
      const parts: string[] = [];
      // Prefer paragraph boundaries first
      const paragraphs = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      for (const para of paragraphs) {
        if (para.length <= chunkSize) {
          parts.push(para);
          continue;
        }
        let start = 0;
        while (start < para.length) {
          const end = Math.min(start + chunkSize, para.length);
          parts.push(para.slice(start, end));
          if (end === para.length) break;
          start = Math.max(0, end - overlap);
        }
      }

      return parts;
    };

    const texts = splitIntoChunks(content);
    const chunks: StoredChunk[] = texts.map((text) => ({
      id: `${documentId}-${nanoid(6)}`,
      documentId,
      text,
      length: text.length,
    }));

    documentChunks.set(documentId, chunks);

    return {
      documentId,
      title,
      chunkCount: chunks.length,
      preview: chunks.slice(0, 3).map((chunk) => ({
        id: chunk.id,
        length: chunk.length,
        text: chunk.text.slice(0, 280),
      })),
    };
  },
  {
    name: "ingest_document",
    description:
      "Parse a provided document into smaller chunks using LlamaIndex so you can reference it later. Use when the user supplies long text that should inform future answers.",
    schema: ingestDocumentSchema,
  },
);

const queryDocumentSchema = z.object({
  query: z.string().describe("Natural language question or keyword search."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(4)
    .describe("Maximum number of snippets to return."),
});

type QueryDocumentInput = z.infer<typeof queryDocumentSchema>;

const queryDocumentTool = tool(
  async ({ query, limit }: QueryDocumentInput) => {
    const normalized = query.toLowerCase();

    const results: Array<{
      documentId: string;
      chunkId: string;
      text: string;
      score: number;
    }> = [];

    for (const [documentId, chunks] of documentChunks.entries()) {
      for (const chunk of chunks) {
        const index = chunk.text.toLowerCase().indexOf(normalized);
        if (index === -1) continue;

        const score = 1 - index / chunk.text.length;
        results.push({
          documentId,
          chunkId: chunk.id,
          text: chunk.text,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map((result) => ({
      documentId: result.documentId,
      chunkId: result.chunkId,
      score: Number(result.score.toFixed(3)),
      text: result.text.slice(0, 500),
    }));
  },
  {
    name: "search_ingested_documents",
    description:
      "Search across the text that was previously ingested from LlamaIndex. Returns the most relevant snippets to ground your answer.",
    schema: queryDocumentSchema,
  },
);

const tavilySearch = new TavilySearchResults({
  maxResults: 5,
  apiKey: process.env.TAVILY_API_KEY,
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const groqModel = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: requiredEnv("GROQ_MODEL"),
  temperature: 0.2,
  maxTokens: 1024,
});

const AGENT_SYSTEM_PROMPT = `You are Aura, a Singhacks AI research assistant focused on compliance and risk discovery.
Use the available tools to ground your answers:
- "tavily_search_results_json" yields current web evidence.
- "ingest_document" breaks down long text that the user wants you to remember.
- "search_ingested_documents" surfaces stored snippets.
Always cite where facts come from and highlight potential risks or next steps when relevant.`;

export const baseLangGraphAgent = createReactAgent({
  llm: groqModel,
  tools: [tavilySearch, ingestDocumentTool, queryDocumentTool],
  messageModifier: new SystemMessage(AGENT_SYSTEM_PROMPT),
});

export type BaseLangGraphAgent = typeof baseLangGraphAgent;

export const getDocumentChunks = () => documentChunks;
