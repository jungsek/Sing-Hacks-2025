"use client";

import Link from "next/link";
import { useState } from "react";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const documents = [
  {
    id: 'C-00984',
    title: 'EDD Review - Tan Wei Jun',
    client: 'Tan Wei Jun',
    updated: '15 Sep 2025',
    status: 'Open',
  },
  {
    id: 'D-20251028-01',
    title: 'Sanctions match report',
    client: 'Crypto Holdings Ltd',
    updated: '28 Oct 2025',
    status: 'In progress',
  },
];

export default function DocumentsPage() {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function downloadDoc(doc: { id: string; title: string; client: string }) {
    try {
      setLoadingId(doc.id);

      // Build payload for PDF generation. Add extra client fields for known sample case.
      const payload: any = {
        title: 'DOCUMENT & TRANSACTION RISK ANALYSIS REPORT',
        generatedOn: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Singapore' }),
        generatedBy: 'System',
        items: [doc.title],
        filename: `report-${doc.id}`,
        clientName: doc.client,
        clientId: doc.id,
      };

      // Known client-specific values (user-provided)
      if (doc.id === 'C-00984') {
        payload.jurisdiction = 'Singapore';
        payload.regulator = 'MAS';
        payload.customerRiskRating = 'High';
        payload.pepStatus = 'Yes';
        payload.lastKycCompleted = '15 Sep 2025';
        payload.eddRequired = 'Yes';
      }

      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`PDF generation failed: ${res.status} ${text}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : `${payload.filename}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Download failed', err);
      alert(err?.message || 'Failed to generate PDF.');
    } finally {
      setLoadingId(null);
    }
  }

  return (
  <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      <JbSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <JbTopbar />

        <main className="flex-1 space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Cases & Documents</h1>
              <p className="text-sm text-muted-foreground">Manage case files, EDD notes and generated reports</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/documents/upload" className="no-underline">
                <Button variant="secondary">Upload document</Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <Card key={doc.id} className="border-border/60 bg-white/70 dark:bg-slate-900/40">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg font-semibold">{doc.title}</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">{doc.client} · {doc.id}</CardDescription>
                  </div>
                  <div className="text-right">
                    <Badge variant={doc.status === 'Open' ? 'destructive' : 'secondary'}>{doc.status}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">Updated {doc.updated}</div>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="text-sm text-muted-foreground">Actions</div>
                  <div className="flex gap-2">
                    <Link href={`/documents/${doc.id}`} className="no-underline">
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                    <Button
                      size="sm"
                      onClick={() => downloadDoc(doc)}
                      disabled={loadingId === doc.id}
                    >
                      {loadingId === doc.id ? 'Downloading...' : 'Download'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
