import React from 'react';
import fs from 'fs';
import path from 'path';
import generatePdf from '../../../lib/pdf/generatePdf';
import ComplianceReport from '../../../lib/pdf/templates/ComplianceReport';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  // Accept a JSON body that matches the SimpleDocument props (title, generatedOn, generatedBy, etc.)
  const body = await request.json().catch(() => ({} as any));
  const filename = (body && (body.filename as string)) || 'document';

  // Try to read the logo from public/images/logo.png and attach as data URI
  try {
    const logoPath = path.resolve(process.cwd(), 'public', 'images', 'logo.png');
    if (fs.existsSync(logoPath)) {
      const img = fs.readFileSync(logoPath);
      const b64 = img.toString('base64');
      (body as any).logoDataUri = `data:image/png;base64,${b64}`;
    }
  } catch (e) {
    // ignore file read errors; template will fall back to placeholder
    // eslint-disable-next-line no-console
    console.warn('Could not read logo file for PDF:', e);
  }

  // Create the React PDF element from the whole payload so the template can use all fields
  // Normalize documents: if uploadedAt is missing, populate with server timestamp.
  let documents = Array.isArray(body?.documents)
    ? (body.documents as any[]).map((d: any) => ({
        id: d.id || `doc-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        filename: d.filename || 'unknown',
        uploadedAt: d.uploadedAt || new Date().toISOString(),
      }))
    : [];

  // If the client didn't pass a documents array but provided a docId (case id),
  // try to fetch uploaded documents from Supabase (best-effort: try several common column names).
  if (documents.length === 0 && body?.docId) {
    try {
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {});

        // Try to fetch documents linked via the join table `aml_case_documents` first
        let found: any[] | null = null;
        try {
          const { data: links, error: linksErr } = await supabase
            .from('aml_case_documents')
            .select('document_id')
            .eq('aml_case_id', body.docId)
            .limit(200);

          if (!linksErr && Array.isArray(links) && links.length > 0) {
            const ids = links.map((l: any) => l.document_id).filter(Boolean);
            if (ids.length > 0) {
              const { data: docs, error: docsErr } = await supabase.from('documents').select('*').in('id', ids as any).limit(200 as any);
              if (!docsErr && Array.isArray(docs) && docs.length > 0) found = docs as any[];
            }
          }
        } catch (e) {
          // ignore and fallback to column-based search
        }

        // If not found via join table, try a few common column names that might reference the case id
        if (!found) {
          const columnCandidates = ['case_id', 'aml_case_id', 'document_id', 'caseid', 'caseId'];

          for (const col of columnCandidates) {
            try {
              const { data, error } = await supabase.from('documents').select('*').eq(col, body.docId).limit(200);
              if (!error && Array.isArray(data) && data.length > 0) {
                found = data as any[];
                break;
              }
            } catch (e) {
              // ignore and try next candidate
            }
          }
        }

        // As a fallback, try to select documents where filename or metadata contains the docId
        if (!found) {
          try {
            const { data, error } = await supabase.from('documents').select('*').ilike('filename', `%${body.docId}%`).limit(200 as any);
            if (!error && Array.isArray(data) && data.length > 0) found = data as any[];
          } catch (e) {
            // ignore
          }
        }

        if (found && found.length > 0) {
          documents = found.map((d: any) => ({
            id: d.id || d.document_id || `doc-${Date.now()}-${Math.floor(Math.random()*10000)}`,
            filename: d.filename || d.name || 'unknown',
            uploadedAt: d.created_at || d.uploaded_at || d.uploadedAt || new Date().toISOString(),
          }));
        }
      }
    } catch (e) {
      // best-effort only; if Supabase isn't configured or query fails, continue with empty documents
      // eslint-disable-next-line no-console
      console.warn('Could not fetch related documents for PDF generation:', String((e as any)?.message ?? e));
    }
  }

  // Create placeholder assessments if not provided. The AI agent integration will replace these.
  const assessments = (body?.assessments && Array.isArray(body.assessments))
    ? body.assessments
    : documents.map((doc, idx) => ({
      id: doc.id,
      riskLevel: idx % 3 === 0 ? 'High' : (idx % 3 === 1 ? 'Medium' : 'Low'),
      summary: 'Mock summary: detailed assessment will be provided by the AI agent when integrated.'
    }));

  const docProps = {
    filename,
    generatedOn: body.generatedOn || new Date().toLocaleString('en-GB', { timeZone: 'Asia/Singapore' }),
    generatedBy: body.generatedBy || 'Agentic AML System',
    logoDataUri: (body as any).logoDataUri,
    // forward originalTitle and docId so the PDF template can show both title and the separate Document ID
    originalTitle: body.originalTitle || null,
    docId: body.docId || null,
    // forward client information
    clientName: body.clientName || null,
    clientId: body.clientId || null,
    documents,
    overallRisk: body?.overallRisk || 'Medium (mock)',
    overallSummary: body?.overallSummary || 'Mock overall summary: a summary of combined document risk. AI agent integration will enhance this.',
    assessments,
  };

  const docElement = React.createElement(ComplianceReport, docProps as any);

  try {
    const buffer = await generatePdf(docElement);
    const uint8 = new Uint8Array(buffer);
    return new Response(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (err: any) {
    // Log server-side and return plain text error for easier debugging
    // eslint-disable-next-line no-console
    console.error('PDF generation error:', err);
    const message = err?.message ? String(err.message) : 'Unknown PDF generation error';
    return new Response(message, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

export const runtime = 'nodejs';
