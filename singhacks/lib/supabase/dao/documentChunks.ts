import { createClient } from "@/lib/supabase/server";
import type { SerializableRecord } from "@/lib/types";

export type DocumentChunkInsert = {
  document_id: string;
  text: string;
  tags?: string[];
  meta?: SerializableRecord;
};

export async function insertDocumentChunks(
  chunks: DocumentChunkInsert[],
): Promise<void> {
  if (!Array.isArray(chunks) || chunks.length === 0) return;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("document_chunks").insert(
      chunks.map((chunk) => ({
        document_id: chunk.document_id,
        text: chunk.text,
        tags: chunk.tags,
        meta: chunk.meta,
      })),
    );

    if (error) {
      console.warn("Failed to insert document chunks", error.message);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while inserting document chunks", message);
  }
}
