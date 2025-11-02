import { createClient } from "@/lib/supabase/server";
import type { SerializableRecord } from "@/lib/types";

export type MonitorRowRecord = {
  run_id: string;
  index: number;
  transaction_id: string;
  meta?: SerializableRecord;
  created_at?: string;
};

export async function logMonitorRow(row: MonitorRowRecord): Promise<void> {
  const supabase = await createClient();
  await supabase.from("monitor_rows").insert({
    run_id: row.run_id,
    index: row.index,
    transaction_id: row.transaction_id,
    meta: row.meta,
  });
}

export async function getLatestMonitorRowMeta(
  transaction_id: string,
): Promise<SerializableRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("monitor_rows")
    .select("meta, created_at")
    .eq("transaction_id", transaction_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ meta: SerializableRecord | null }>();
  if (error) return null;
  return (data?.meta as SerializableRecord | null) ?? null;
}
