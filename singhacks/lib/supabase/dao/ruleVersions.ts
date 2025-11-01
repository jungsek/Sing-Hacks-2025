import { createClient } from "@/lib/supabase/server";
import type { Serializable } from "@/lib/types";

export type RuleVersionInsert = {
  id?: string;
  document_id: string;
  regulator: string;
  status: "pending_approval" | "approved" | "rejected" | "draft";
  rule_json: Serializable;
  diff?: Serializable;
  source_url: string;
  effective_date?: string;
};

export async function createRuleVersion(
  input: RuleVersionInsert,
): Promise<RuleVersionInsert | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rule_versions")
      .insert({
        id: input.id,
        document_id: input.document_id,
        regulator: input.regulator,
        status: input.status,
        rule_json: input.rule_json,
        diff: input.diff,
        source_url: input.source_url,
        effective_date: input.effective_date,
      })
      .select("*")
      .maybeSingle<RuleVersionInsert>();

    if (error) {
      console.warn("Failed to create rule version", error.message);
      return null;
    }

    return data ?? null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.warn("Supabase unavailable while creating rule version", message);
    return null;
  }
}
