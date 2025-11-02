import { createClient } from "@/lib/supabase/server";
import type { SerializableRecord } from "@/lib/types";

export type ImageCheckInsert = {
  document_id: string;
  file_name?: string | null;
  exif?: SerializableRecord | null;
  heuristics?: SerializableRecord | null;
  ai_generated_score?: number | null;
};

export async function insertImageChecks(rows: ImageCheckInsert[]): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;
  try {
    const supabase = await createClient();
    await supabase.from("image_checks").insert(
      rows.map((r) => ({
        document_id: r.document_id,
        file_name: r.file_name ?? null,
        exif: r.exif ?? null,
        heuristics: r.heuristics ?? null,
        ai_generated_score: r.ai_generated_score ?? null,
      })),
    );
  } catch (error) {
    // swallow for demo if table doesn't exist
    console.warn("insertImageChecks failed", (error as any)?.message ?? String(error));
  }
}
