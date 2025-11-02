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

export async function getLatestAlertByTransactionId(
  transaction_id: string,
): Promise<AlertRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("id, transaction_id, severity, payload, created_at")
    .eq("transaction_id", transaction_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AlertRecord>();
  if (error) return null;
  return data ?? null;
}
