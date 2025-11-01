"use client";

import { useState, useEffect, useRef } from "react";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/ui/shadcn-io/dropzone";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Map MIME types or file extensions to friendly names shown in the UI.
function getFriendlyType(file: File) {
  const mime = file.type || '';
  const name = file.name || '';
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (mime.includes('pdf') || ext === 'pdf') return 'PDF';
  if (mime.includes('word') || mime === 'application/msword' || ext === 'doc' || ext === 'docx') return 'Word Document';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff'].includes(ext)) return 'Image';
  if (mime.includes('excel') || ext === 'xls' || ext === 'xlsx' || mime.includes('spreadsheet')) return 'Spreadsheet';
  if (mime.includes('presentation') || ext === 'ppt' || ext === 'pptx') return 'Presentation';
  if (mime === 'text/csv' || ext === 'csv') return 'CSV';
  if (mime === 'text/plain' || ext === 'txt') return 'Text file';
  if (mime === '' && ext) return ext.toUpperCase();
  if (mime) {
    // Show a short friendly mime when possible (e.g., application/zip -> Archive)
    if (mime.includes('zip') || ext === 'zip') return 'Archive';
    if (mime.includes('json') || ext === 'json') return 'JSON';
    // fallback to the raw mime type
    return mime;
  }

  return 'Unknown';
}

export default function UploadDocumentPage() {
  const [clientName, setClientName] = useState("");
  // clientId stores only the 8 digits entered by the user (no prefix). When sending to the server
  // we will prepend the permanent "CL-" prefix.
  const [clientId, setClientId] = useState("");

  type FileStatus = 'pending' | 'uploading' | 'uploaded' | 'error';
  type FileWithStatus = { file: File; status: FileStatus; error?: string | null };

  const [filesWithStatus, setFilesWithStatus] = useState<FileWithStatus[] | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const errorTimeoutRef = useRef<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
  // Validate required fields: clientName, clientId (exactly 8 digits), and at least one selected file.
  const missing: string[] = [];
  if (!clientName || clientName.trim() === "") missing.push('Client name');
  // clientId should be exactly 8 digits (we store digits only in state)
  if (!clientId || clientId.trim().length !== 8 || /\D/.test(clientId)) missing.push('Client ID (must be 8 digits)');
  if (!filesWithStatus || filesWithStatus.length === 0) missing.push('File');

    if (missing.length > 0) {
      setUploadError(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`);
      return;
    }

    // If multiple files are selected, upload them sequentially and update status cards.
    setSubmitting(true);
    setUploadError(null);
    setUploadResult(null);

    const results: any[] = [];

  const updated = filesWithStatus!.map((f) => ({ ...f }));

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      // mark uploading
      item.status = 'uploading';
      setFilesWithStatus([...updated]);

      try {
  const formData = new FormData();
  formData.append('file', item.file);
  formData.append('clientName', clientName);
  // prepend permanent prefix with no spaces
  formData.append('clientId', `CL-${clientId}`);

        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Upload failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        results.push(data);
        // mark uploaded
        item.status = 'uploaded';
        setFilesWithStatus([...updated]);
      } catch (err: any) {
        // mark error
        item.status = 'error';
        item.error = err?.message || String(err);
        setFilesWithStatus([...updated]);
      }
    }

    setUploadResult(results.length === 1 ? results[0] : results);
    setSubmitting(false);

    // If uploads succeeded, create an AML case on the server (server will use service role key).
    if (results.length > 0) {
      try {
        // prefer the document id from the first successful upload result (server returns `document` when inserted)
        const firstDocumentId = Array.isArray(results) && results.length > 0 ? results[0]?.document?.id ?? null : null;

        const caseRes = await fetch('/api/documents/create-case', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientName,
            clientId: `CL-${clientId}`,
            documentId: firstDocumentId,
            files: results,
          }),
        });

        if (!caseRes.ok) {
          const text = await caseRes.text().catch(() => '');
          throw new Error(`Create case failed: ${caseRes.status} ${text}`);
        }

    // mark submitted after case creation and keep it true until page reload
  setSubmitted(true);
  setShowSuccess(true);
      } catch (err: any) {
        // show error but keep upload results available
        setUploadError(err?.message || String(err));
      }
    }
  }

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  // auto-dismiss uploadError after 5s
  useEffect(() => {
    if (!uploadError) return;
    if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = window.setTimeout(() => setUploadError(null), 5000);
    return () => {
      if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    };
  }, [uploadError]);

  // Ensure the page resets when loaded from cache (bfcache) or on a normal reload.
  useEffect(() => {
    const resetState = () => {
      setClientName('');
      setClientId('');
      setFile(null);
      setFilesWithStatus(undefined);
      setUploadError(null);
      setUploadResult(null);
      setSubmitted(false);
      setShowSuccess(false);
      setSubmitting(false);
    };

    // pageshow handles bfcache navigation where the page might be restored from cache.
    const onPageShow = (e: PageTransitionEvent) => {
      if ((e as any).persisted) resetState();
    };

    // Reset on mount as well
    resetState();

    window.addEventListener('pageshow', onPageShow as EventListener);

    return () => {
      window.removeEventListener('pageshow', onPageShow as EventListener);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-800/10">
      {/* Alert popups (top-right) */}
      <div className="fixed top-6 right-6 z-50 w-80">
        {uploadError ? (
          <Alert
            variant="destructive"
            className="bg-rose-50 text-rose-500 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200"
          >
            <button
              aria-label="Close alert"
              className="absolute top-2 right-2 text-sm text-foreground/80 hover:text-foreground p-1 rounded"
              onClick={() => setUploadError(null)}
            >
              ×
            </button>

            <AlertTitle>Error</AlertTitle>

            <AlertDescription>
              <div className="pr-4">{uploadError}</div>
            </AlertDescription>
          </Alert>
        ) : null}

        {submitted && showSuccess ? (
          <Alert className="bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200">
            <button
              aria-label="Close success alert"
              className="absolute top-2 right-2 text-sm text-foreground/80 hover:text-foreground p-1 rounded"
              onClick={() => setShowSuccess(false)}
            >
              ×
            </button>

            <AlertTitle>Success</AlertTitle>

            <AlertDescription>Files uploaded successfully.</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <JbSidebar />
      <div className="flex min-h-screen flex-1 flex-col">

  <main className="flex-1 space-y-6 p-6">
            {/* Breadcrumb (using shared component; exclude Home) */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
                  <BreadcrumbSeparator />
                </BreadcrumbItem>

                <BreadcrumbItem>
                  <BreadcrumbPage>Upload</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

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
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-3 py-2 rounded-l-md border bg-gray-50 text-sm text-gray-700 font-bold">CL-</span>
                    <input
                      // value kept as digits only (max 8)
                      value={clientId}
                      onChange={(e) => {
                        const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
                        setClientId(digits);
                      }}
                      onPaste={(e) => {
                        // ensure pasted content is cleaned to digits only
                        e.preventDefault();
                        const paste = (e.clipboardData || (window as any).clipboardData).getData('text') || '';
                        const digits = paste.replace(/\D/g, '').slice(0, 8);
                        setClientId(digits);
                      }}
                      placeholder="XXXXXXXX"
                      inputMode="numeric"
                      aria-label="Client ID digits (8 digits)"
                      maxLength={8}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Enter 8 digits.</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Files</p>
                  <Dropzone
                    src={filesWithStatus?.map((f) => f.file)}
                    maxFiles={10}
                    onDrop={(acceptedFiles) => {
                      // Append new files to existing selection instead of overwriting.
                      // Deduplicate by name+size+lastModified.
                      setFilesWithStatus((prev) => {
                        const existing = prev ?? [];
                        const makeId = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;
                        const existingIds = new Set(existing.map((e) => makeId(e.file)));

                        const wrappedNew = acceptedFiles
                          .filter((f) => !existingIds.has(makeId(f)))
                          .map((f) => ({ file: f, status: 'pending' as FileStatus, error: null }));

                        // Enforce maxFiles (Dropzone also enforces, but keep a guard here)
                        const maxFiles = 10;
                        const allowed = existing.length + wrappedNew.length > maxFiles
                          ? wrappedNew.slice(0, Math.max(0, maxFiles - existing.length))
                          : wrappedNew;

                        return [...existing, ...allowed];
                      });

                      // keep a reference to the first newly dropped file for convenience
                      setFile(acceptedFiles?.[0] ?? null);
                    }}
                  >
                    <DropzoneEmptyState />
                    <DropzoneContent />
                  </Dropzone>
                </div>

                {/* Per-file status cards */}
                {filesWithStatus && filesWithStatus.length > 0 ? (
                  <div className="space-y-2">
                    {filesWithStatus.map((fws, idx) => (
                      <Card key={`${fws.file.name}-${fws.file.size}`} className="bg-white/60 dark:bg-slate-900/30">
                        <CardContent className="flex items-center justify-between gap-4">
                          <div className="flex-1 flex flex-col justify-center">
                            <div className="font-medium pt-2">{fws.file.name}</div>
                            <div className="text-xs text-muted-foreground">{getFriendlyType(fws.file)}</div>
                          </div>
                          <div className="mr-3">
                            {fws.status === 'pending' && <span className="text-sm">Pending upload</span>}
                            {fws.status === 'uploading' && <span className="text-sm">Uploading...</span>}
                            {fws.status === 'uploaded' && <span className="text-sm text-emerald-400">Uploaded</span>}
                            {fws.status === 'error' && <span className="text-sm text-rose-500">Error: {fws.error}</span>}
                          </div>
                          <div>
                            <button
                              type="button"
                              aria-label={`Remove ${fws.file.name}`}
                              className="text-xl text-gray-500 hover:text-red-600 rounded-full p-1 w-8 h-8 flex items-center justify-center"
                              onClick={() => {
                                setFilesWithStatus((prev) => prev?.filter((_, i) => i !== idx));
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting || submitted}>{submitting ? 'Submitting...' : submitted ? 'Submitted' : 'Submit'}</Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      // Reset all form-related state so the page returns to its initial state
                      setClientName('');
                      setClientId('');
                      setFile(null);
                      setFilesWithStatus(undefined);
                      setUploadError(null);
                      setUploadResult(null);
                      setSubmitting(false);
                      setSubmitted(false);
                      setShowSuccess(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
