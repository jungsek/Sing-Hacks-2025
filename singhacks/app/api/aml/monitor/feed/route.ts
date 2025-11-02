import { createClient } from "@/lib/supabase/server";
import type { SerializableRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FeedItem = {
  transaction_id: string;
  meta: SerializableRecord | null;
  created_at?: string | null;
  alert?: {
    id: string;
    severity: string;
    payload: any;
    created_at?: string | null;
  } | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const cursor = url.searchParams.get("cursor"); // ISO timestamp
  const direction = url.searchParams.get("direction") || "before"; // before|after
  const limit = Math.max(1, Math.min(500, Number(limitParam) || 200));
  const offset = Math.max(0, Number(offsetParam) || 0);

  try {
    const supabase = await createClient();
    // 1) Get most recent monitor rows
    let rowsQuery = supabase
      .from("monitor_rows")
      .select("transaction_id, meta, created_at")
      .order("created_at", { ascending: false });

    if (cursor) {
      if (direction === "after") {
        rowsQuery = rowsQuery.gt("created_at", cursor);
      } else {
        rowsQuery = rowsQuery.lt("created_at", cursor);
      }
    }

    // Apply offset/limit via range
    const rangeStart = offset;
    const rangeEnd = offset + limit - 1;
    // @ts-ignore supabase typings allow range
    rowsQuery = rowsQuery.range(rangeStart, rangeEnd);

    const { data: rows, error: rowsError } = await rowsQuery;
    if (rowsError) throw rowsError;

    const uniqueOrderedTxnIds: string[] = [];
    const seen = new Set<string>();
    for (const r of rows ?? []) {
      const id = r.transaction_id as string;
      if (id && !seen.has(id)) {
        seen.add(id);
        uniqueOrderedTxnIds.push(id);
      }
    }

    // 2) Fetch latest alert per transaction_id
    let alertsByTxn: Record<string, FeedItem["alert"]> = {};
    if (uniqueOrderedTxnIds.length > 0) {
      const { data: alerts, error: alertsError } = await supabase
        .from("alerts")
        .select("id, transaction_id, severity, payload, created_at")
        .in("transaction_id", uniqueOrderedTxnIds)
        .order("created_at", { ascending: false });
      if (alertsError) throw alertsError;
      for (const a of alerts ?? []) {
        const txid = a.transaction_id as string;
        if (!alertsByTxn[txid]) {
          alertsByTxn[txid] = {
            id: a.id as string,
            severity: String(a.severity ?? ""),
            payload: a.payload,
            created_at: a.created_at ?? null,
          };
        }
      }
    }

    const feed: FeedItem[] = (rows ?? []).map((r) => ({
      transaction_id: r.transaction_id as string,
      meta: (r.meta as SerializableRecord) ?? null,
      created_at: r.created_at ?? null,
      alert: alertsByTxn[r.transaction_id as string] ?? null,
    }));

    const nextCursor = feed.length > 0 ? (feed[feed.length - 1]?.created_at ?? null) : null;

    return new Response(
      JSON.stringify({
        items: feed,
        paging: {
          limit,
          offset,
          cursor: cursor ?? null,
          direction,
          nextCursor,
          hasMore: (rows ?? []).length >= limit,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
