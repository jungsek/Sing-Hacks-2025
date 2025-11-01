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
