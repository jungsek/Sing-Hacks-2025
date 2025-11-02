import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Server route: fetch an AML case record by id from `aml_cases` table.
 * - Uses SUPABASE_SERVICE_ROLE_KEY on the server.
 * - Query param: ?case_id=<id>
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const caseId = url.searchParams.get("case_id") ?? null;

    if (!caseId) {
      return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase configuration on server" },
        { status: 500 },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {});

    const { data, error } = await supabase.from("aml_cases").select().eq("id", caseId).single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 500 });
    }

    // If the row contains an analysis_report stored as a JSON string, try to parse it so
    // the client receives a structured object. If parsing fails, return the original value.
    try {
      if (data && typeof data.analysis_report === "string") {
        try {
          // parse stringified JSON
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          (data as any).analysis_report = JSON.parse(data.analysis_report);
        } catch (_e) {
          // leave as-is if not JSON
        }
      }
    } catch (_e) {
      // ignore
    }

    return NextResponse.json({ ok: true, case: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
