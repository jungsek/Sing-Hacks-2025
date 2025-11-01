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
    const { data, error } = await supabase
      .from("documents")
      .upsert(
        {
          id: input.id,
          type: input.type,
          title: input.title,
          url: input.url,
          domain: input.domain,
          published_at: input.published_at,
          meta: input.meta,
        },
        { onConflict: "url" },
      )
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
