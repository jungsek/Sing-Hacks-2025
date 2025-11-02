import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ caseId: string }> }) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { caseId } = await ctx.params;

  // Fetch latest artifact for this case id from agent_runs
  const { data, error } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("status", "artifact")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Find the first artifact payload whose payload.data.case_id matches
  const row = (data || []).find((r: any) => r?.payload?.data?.case_id === caseId) || null;
  if (!row) return NextResponse.json({ ok: true, payload: null });

  return NextResponse.json({ ok: true, payload: row.payload });
}
