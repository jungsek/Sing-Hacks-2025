import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Server route: update an AML case record in Supabase `aml_cases` table.
 * - Uses SUPABASE_SERVICE_ROLE_KEY on the server.
 * - Expects JSON body: { caseId: string|number, status?: string, analysis_report?: any }
 *
 * When `analysis_report` is provided we persist it into the `analysis_report` column
 * on `aml_cases` (JSON/JSONB column expected). The handler will update any provided
 * fields (status and/or analysis_report).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const caseId = body.caseId ?? null;
    const status = body.status ?? null;
    const analysis_report = body.analysis_report ?? undefined;

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase configuration on server" },
        { status: 500 },
      );
    }

    if (!caseId) {
      return NextResponse.json({ ok: false, error: 'caseId is required' }, { status: 400 });
    }
    // Build update payload only with provided fields.
    const updatePayload: Record<string, any> = {};
    if (status !== null && status !== undefined) updatePayload.status = status;
    if (analysis_report !== undefined) updatePayload.analysis_report = analysis_report;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {});

    const { data, error } = await supabase.from('aml_cases').update(updatePayload).eq('id', caseId).select().single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, case: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
