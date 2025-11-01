import { createClient } from "@/lib/supabase/server";
import type { SerializableRecord } from "@/lib/types";

export type TransactionRecord = {
  id: string;
  amount?: number | null;
  currency?: string | null;
  customer_id?: string | null;
  meta?: SerializableRecord | null;
};

export async function getTransactionById(id: string): Promise<TransactionRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount, currency, customer_id, meta")
    .eq("id", id)
    .maybeSingle<TransactionRecord>();
  if (error) return null;
  return data ?? null;
}
