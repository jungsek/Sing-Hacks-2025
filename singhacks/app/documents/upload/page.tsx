"use client";

import { useState } from "react";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/ui/shadcn-io/dropzone";

export default function UploadDocumentPage() {
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[] | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      alert('Please choose a file to upload');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientName', clientName);
      formData.append('clientId', clientId);

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      const shareUrl = data?.share?.url || data?.share?.link || null;
      alert(`Upload successful. ${shareUrl ? `Share link: ${shareUrl}` : 'No share link created.'}`);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Upload failed', err);
      alert(err?.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      <JbSidebar />
      <div className="flex min-h-screen flex-1 flex-col">

  <main className="flex-1 space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                <h1 className="text-2xl font-semibold">Document Processor</h1>
                </div>
            </div>
          <Card className="max-w-2xl  bg-white/70 dark:bg-slate-900/40">
            <CardHeader>
              <CardTitle>Upload document</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Client name</p>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client Name" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Client ID</p>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Files</p>
                  <Dropzone
                    src={files}
                    maxFiles={10}
                    onDrop={(acceptedFiles) => {
                      setFiles(acceptedFiles);
                      setFile(acceptedFiles?.[0] ?? null);
                    }}
                  >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                  </Dropzone>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>{submitting ? 'Uploading...' : 'Upload'}</Button>
                  <Button variant="ghost" type="button" onClick={() => { setClientName(''); setClientId(''); setFile(null); }}>Clear</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
