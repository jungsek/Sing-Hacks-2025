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

    const { data, error } = await supabase
      .from('aml_cases')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 500 });
    }

    // If files were uploaded, link each uploaded document to the new case via aml_case_documents.
    // Files array items are expected to contain the inserted document under `document.id`.
    try {
      const linksToCreate: Array<{ aml_case_id: string; document_id: string }> = [];

      if (Array.isArray(files) && files.length > 0) {
        for (const f of files) {
          const docId = f?.document?.id ?? f?.document_id ?? f?.id ?? null;
          if (docId) linksToCreate.push({ aml_case_id: data.id, document_id: docId });
        }
      }

      // also support a single documentId param for compatibility
      if (documentId && !linksToCreate.find((l) => l.document_id === documentId)) {
        linksToCreate.push({ aml_case_id: data.id, document_id: documentId });
      }

      if (linksToCreate.length > 0) {
        await supabase.from('aml_case_documents').insert(linksToCreate);
      }
    } catch (err) {
      // non-fatal: log and continue. The case was created successfully.
      // eslint-disable-next-line no-console
      console.warn('Failed to create aml_case_documents links:', err);
    }

    return NextResponse.json({ ok: true, case: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
