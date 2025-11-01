import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Server route: upload a file to Supabase Storage (bucket: `documents`).
 * - Uses the SUPABASE_SERVICE_ROLE_KEY server env var. Do NOT expose this key to the browser.
 * - Expects a multipart/form-data POST with a `file` field and optional `clientName`/`clientId` fields.
 * - Uploads into the Supabase Storage bucket named `Files` (project-specific).
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as any;
    const clientName = formData.get("clientName")?.toString() || null;
    const clientId = formData.get("clientId")?.toString() || null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Convert the uploaded file to a Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = file.name || `upload-${Date.now()}`;
    const mimeType = file.type || "application/octet-stream";

    // Create a server-side Supabase client using the service role key
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase configuration on server" },
        { status: 500 },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      // keep default options
    });

    // Ensure we don't overwrite existing files. Attempt to upload with upsert:false
    // and, if a conflict occurs, try a different filename suffix until unique.
    const dir = `uploads/${clientId ?? "anonymous"}`;

    const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9.\-_ ]/g, "_");
    const safeFileName = sanitize(fileName);

    let attempt = 0;
    const maxAttempts = 10;
    let uploadData: any = null;
    let uploadError: any = null;

    // base timestamp to keep names stable across attempts
    const ts = Date.now();

    while (attempt < maxAttempts) {
      const candidate = attempt === 0 ? `${ts}_${safeFileName}` : `${ts}_${attempt}_${safeFileName}`;
      const path = `${dir}/${candidate}`;

      const res = await supabase.storage.from("Files").upload(path, buffer, {
        contentType: mimeType,
        upsert: false,
      });

      uploadData = res.data;
      uploadError = res.error;

      if (!uploadError) {
        // success
        break;
      }

      // If the error indicates the file already exists, try another name.
      const msg = String(uploadError?.message || '').toLowerCase();
      const status = uploadError?.status;
      if (status === 409 || msg.includes('already exists') || msg.includes('object already exists')) {
        attempt += 1;
        continue;
      }

      // other error -> abort
      return NextResponse.json({ ok: false, error: uploadError.message ?? String(uploadError) }, { status: 500 });
    }

    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError.message ?? 'Upload failed (conflict)' }, { status: 409 });
    }

    // Create a signed URL (time-limited) for the uploaded file
    const { data: signedData, error: signedErr } = await supabase.storage
      .from("Files")
      .createSignedUrl(uploadData.path, 60 * 60); // 1 hour

    // Insert basic metadata into the `documents` table using the project's schema.
    // The repository's table definition includes: id, filename, storage_path, created_at.
    let insertedDoc = null;
    try {
      const { data: docData, error: docError } = await supabase
        .from("documents")
        .insert([
          {
            filename: fileName,
            storage_path: uploadData.path,
          },
        ])
        .select()
        .single();

      if (!docError) insertedDoc = docData;
    } catch (err) {
      // ignore insert errors (table might not exist or permissions missing)
    }

    return NextResponse.json(
      {
        ok: true,
        path: uploadData.path,
        signedUrl: signedData?.signedUrl ?? null,
        signedUrlError: signedErr?.message ?? null,
        upload: uploadData,
        document: insertedDoc,
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
