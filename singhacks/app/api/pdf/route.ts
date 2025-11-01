import React from "react";
import generatePdf from "../../../lib/pdf/generatePdf";
import SimpleDocument from "../../../lib/pdf/templates/SimpleDocument";

type PdfRequestPayload = {
  title?: string;
  subtitle?: string;
  items?: string[];
  filename?: string;
};

const parsePdfRequest = (payload: unknown): PdfRequestPayload => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;

  const items = Array.isArray(record.items)
    ? record.items.filter((item): item is string => typeof item === "string")
    : undefined;

  return {
    title: typeof record.title === "string" ? record.title : undefined,
    subtitle: typeof record.subtitle === "string" ? record.subtitle : undefined,
    items,
    filename: typeof record.filename === "string" ? record.filename : undefined,
  };
};

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const { title, subtitle, items, filename } = parsePdfRequest(rawBody);

  const docElement = React.createElement(SimpleDocument, {
    title,
    subtitle,
    items: items ?? [],
  });

  const buffer = await generatePdf(docElement);
  const uint8 = new Uint8Array(buffer);

  const safeFilename = (filename ?? "document").trim() || "document";

  return new Response(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
    },
  });
}

export const runtime = "nodejs";
