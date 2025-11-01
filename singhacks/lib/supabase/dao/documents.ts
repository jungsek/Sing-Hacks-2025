import { createClient } from "@/lib/supabase/server";
import type { SerializableRecord } from "@/lib/types";

export type RegulatoryDocumentInsert = {
  id?: string;
  type: string;
  title?: string;
  url: string;
  domain?: string;
  published_at?: string;
  meta?: SerializableRecord;
};

export async function upsertRegulatoryDocument(
  input: RegulatoryDocumentInsert,
): Promise<RegulatoryDocumentInsert | null> {
  try {
    const supabase = await createClient();
    // Build row without undefined fields to avoid schema issues when optional columns are missing
    const row: Record<string, unknown> = {
      id: input.id,
      type: input.type,
      title: input.title,
      url: input.url,
      published_at: input.published_at,
      meta: input.meta,
    };
    if (typeof input.domain === "string") {
      row.domain = input.domain;
    }

    const { data, error } = await supabase
      .from("documents")
      .upsert(row, { onConflict: "url" })
      .select("*")
      .maybeSingle<RegulatoryDocumentInsert>();

    if (error) {
      console.warn("Failed to upsert regulatory document", error.message);
      return null;
    }

    return data ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while upserting regulatory document", message);
    return null;
  }
}
