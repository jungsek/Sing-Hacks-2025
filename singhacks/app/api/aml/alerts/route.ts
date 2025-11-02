import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const transactionId = url.searchParams.get("transaction_id");

  try {
    const supabase = await createClient();

    // 🔧 Top 5 alerts ordered by newest first
    let query = supabase
      .from("alerts")
      .select("id, transaction_id, severity, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(3);

    if (severity) query = query.eq("severity", severity);
    if (transactionId) query = query.eq("transaction_id", transactionId);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ items: data ?? [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
