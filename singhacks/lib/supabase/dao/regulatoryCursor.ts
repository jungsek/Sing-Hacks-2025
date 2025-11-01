import { createClient } from "@/lib/supabase/server";

export type RegulatoryCursor = {
  regulator: string;
  last_run_at: string;
};

const TABLE = "regulatory_cursors";

export async function getRegulatoryCursor(
  regulator: string,
): Promise<RegulatoryCursor | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("regulator, last_run_at")
      .eq("regulator", regulator)
      .maybeSingle<RegulatoryCursor>();

    if (error) {
      console.warn("Failed to fetch regulatory cursor", error.message);
      return null;
    }

    return data ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while fetching regulatory cursor", message);
    return null;
  }
}

export async function setRegulatoryCursor(
  regulator: string,
  lastRunAt: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from(TABLE).upsert({
      regulator,
      last_run_at: lastRunAt,
    });

    if (error) {
      console.warn("Failed to upsert regulatory cursor", error.message);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while setting regulatory cursor", message);
  }
}
