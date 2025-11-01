import React from 'react';
import generatePdf from '../../../lib/pdf/generatePdf';
import SimpleDocument from '../../../lib/pdf/templates/SimpleDocument';

export async function POST(request: Request) {
  // Expect JSON { title, subtitle, items, filename }
  const body = await request.json().catch(() => ({} as any));

  const { title: t, subtitle: s, items: its, filename = 'document' } = body as any;

  // Create the React PDF element using React.createElement to avoid JSX parsing in a .ts route
  const docElement = React.createElement(SimpleDocument, {
    title: t,
    subtitle: s,
    items: its || [],
  });

  const buffer = await generatePdf(docElement);

  // Convert Node Buffer to Uint8Array for Response body
  const uint8 = new Uint8Array(buffer);

  return new Response(uint8, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    },
  });
}

export const runtime = 'nodejs';
