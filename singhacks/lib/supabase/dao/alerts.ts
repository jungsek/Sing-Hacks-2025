import { createClient } from "@/lib/supabase/server";
import type { Serializable } from "@/lib/types";

export type AlertRecord = {
  id: string;
  transaction_id: string;
  severity: string;
  payload: Serializable;
  created_at?: string;
};

export async function createAlert(alert: AlertRecord): Promise<AlertRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .insert({
      id: alert.id,
      transaction_id: alert.transaction_id,
      severity: alert.severity,
      payload: alert.payload,
    })
    .select("*")
    .maybeSingle<AlertRecord>();
  if (error) return null;
  return data ?? null;
}
