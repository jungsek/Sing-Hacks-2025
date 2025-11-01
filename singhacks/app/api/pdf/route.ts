import React from 'react';
import fs from 'fs';
import path from 'path';
import generatePdf from '../../../lib/pdf/generatePdf';
import ComplianceReport from '../../../lib/pdf/templates/ComplianceReport';

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
  const documents = Array.isArray(body?.documents)
    ? (body.documents as any[]).map((d: any) => ({
        id: d.id || `doc-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        filename: d.filename || 'unknown',
        uploadedAt: d.uploadedAt || new Date().toISOString(),
      }))
    : [];

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
