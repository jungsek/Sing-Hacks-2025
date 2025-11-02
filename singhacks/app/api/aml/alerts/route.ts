import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const cursor = url.searchParams.get("cursor"); // ISO timestamp
  const direction = url.searchParams.get("direction") || "before"; // before|after
  const severity = url.searchParams.get("severity"); // optional filter: low|medium|high
  const transactionId = url.searchParams.get("transaction_id");

  const limit = Math.max(1, Math.min(500, Number(limitParam) || 50));
  const offset = Math.max(0, Number(offsetParam) || 0);

  try {
    const supabase = await createClient();
    let query = supabase
      .from("alerts")
      .select("id, transaction_id, severity, payload, created_at")
      .order("created_at", { ascending: false });

    if (severity) query = query.eq("severity", severity);
    if (transactionId) query = query.eq("transaction_id", transactionId);
    if (cursor) {
      if (direction === "after") query = query.gt("created_at", cursor);
      else query = query.lt("created_at", cursor);
    }

    // @ts-ignore range is supported by supabase js client
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw error;

    const nextCursor = data && data.length > 0 ? (data[data.length - 1]?.created_at ?? null) : null;
    return new Response(
      JSON.stringify({
        items: data ?? [],
        paging: {
          limit,
          offset,
          cursor: cursor ?? null,
          direction,
          nextCursor,
          hasMore: (data ?? []).length >= limit,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
