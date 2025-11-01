import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Server route: create an AML case record in Supabase `aml_cases` table.
 * - Uses SUPABASE_SERVICE_ROLE_KEY on the server.
 * - Expects JSON body: { clientName?: string, clientId?: string, files?: any[] }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
  const clientName = body.clientName ?? null;
  const clientId = body.clientId ?? null;
  const documentId = body.documentId ?? null;
  const files = Array.isArray(body.files) ? body.files : [];

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase configuration on server" },
        { status: 500 },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {});

    // Validate minimal inputs
    if (!clientId && !clientName) {
      return NextResponse.json({ ok: false, error: 'clientId or clientName is required' }, { status: 400 });
    }

    const insertPayload: any = {
      client_id: clientId ?? null,
      client_name: clientName ?? null,
      // status will default to 'open' in DB, but include for clarity
      status: 'open',
    };

    // If a documentId was provided and looks like a UUID-ish string, attach it
    if (documentId) {
      insertPayload.document_id = documentId;
    }

    const { data, error } = await supabase
      .from('aml_cases')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 500 });
    }

    // Optionally, you could also insert file links into a related table.

    return NextResponse.json({ ok: true, case: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
