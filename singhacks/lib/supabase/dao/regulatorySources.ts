import { createClient } from "@/lib/supabase/server";

export type RegulatorySourceRow = {
  id?: string;
  regulator_name: string;
  title: string;
  description?: string | null;
  policy_url: string;
  regulatory_document_file?: string | null; // URL or storage path
  domain?: string | null;
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
          domain: input.domain ?? null,
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

export async function searchRegulatorySources(params: {
  keywords: string[];
  regulator?: string | null;
  limit?: number;
}): Promise<RegulatorySourceRow[]> {
  const { keywords, regulator, limit = 10 } = params;
  try {
    const supabase = await createClient();
    let query = supabase.from("regulatory_sources").select("*").order("last_updated_date", {
      ascending: false,
      nullsFirst: false,
    });

    if (regulator && regulator.trim().length > 0) {
      query = query.ilike("regulator_name", regulator.trim());
    }

    // Apply a basic OR ilike filter across title/description/domain for all keywords
    // Supabase JS doesn't support dynamic OR builder; construct via .or()
    const ors: string[] = [];
    for (const kw of keywords) {
      const k = kw.trim();
      if (!k) continue;
      const esc = k.replace(/[,]/g, " ");
      ors.push(`title.ilike.%${esc}%,description.ilike.%${esc}%,domain.ilike.%${esc}%`);
    }
    if (ors.length > 0) {
      query = query.or(ors.join(","));
    }

    // @ts-ignore: range exists on supabase query
    query = query.range(0, Math.max(0, limit - 1));

    const { data, error } = await query;
    if (error) {
      console.warn("Failed to search regulatory sources", error.message);
      return [];
    }
    return (data as RegulatorySourceRow[]) ?? [];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while searching regulatory sources", message);
    return [];
  }
}
