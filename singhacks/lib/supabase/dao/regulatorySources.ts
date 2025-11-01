import { createClient } from "@/lib/supabase/server";

export type RegulatorySourceRow = {
  id?: string;
  regulator_name: string;
  title: string;
  description?: string | null;
  policy_url: string;
  regulatory_document_file?: string | null; // URL or storage path
  published_date?: string | null; // YYYY-MM-DD
  last_updated_date?: string | null; // ISO string
};

export async function upsertRegulatorySource(
  input: RegulatorySourceRow,
): Promise<RegulatorySourceRow | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("regulatory_sources")
      .upsert(
        {
          id: input.id,
          regulator_name: input.regulator_name,
          title: input.title,
          description: input.description ?? null,
          policy_url: input.policy_url,
          regulatory_document_file: input.regulatory_document_file ?? null,
          published_date: input.published_date ?? null,
          last_updated_date: input.last_updated_date ?? new Date().toISOString(),
        },
        { onConflict: "policy_url" },
      )
      .select("*")
      .maybeSingle<RegulatorySourceRow>();

    if (error) {
      console.warn("Failed to upsert regulatory source", error.message);
      return null;
    }

    return data ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while upserting regulatory source", message);
    return null;
  }
}
