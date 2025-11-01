import Link from "next/link";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { createClient as createServerClient } from "@/lib/supabase/server";

type Params = {
  // Next may pass params as a plain object or as a Promise that resolves to the params.
  params: { id: string } | Promise<{ id: string }>;
};

export default async function CasePage({ params }: Params) {
  // `params` can be a Promise in some Next.js runtime configurations — unwrap it safely.
  const resolvedParams = await params;
  const { id } = resolvedParams || {};

  const client = await createServerClient();

  let caseItem: any = null;
  let loadError: any = null;
  let caseFiles: Array<any> | null = null;

  try {
    // Defensive: if id is missing or a literal "undefined" string, avoid querying the DB
    if (!id || id === "undefined") {
      loadError = new Error("Missing or invalid case id");
    } else {
      const { data, error } = await client
        .from("aml_cases")
        .select("id, title, client_name, client_id, status, updated_at")
        .eq("id", id)
        .single();

      if (error) {
        loadError = error;
      } else {
        caseItem = data || null;

        // If the case has a linked document_id, attempt to load the file metadata
        try {
          const docId = (caseItem && caseItem.document_id) || null;
          if (docId) {
            const { data: docsData, error: docsErr } = await client
              .from("documents")
              .select("id, filename, storage_path, created_at")
              .eq("id", docId);

            if (!docsErr && Array.isArray(docsData) && docsData.length > 0) {
              // create signed urls for each document (1h)
              const filesWithUrls = await Promise.all(
                docsData.map(async (d: any) => {
                  let signedUrl: string | null = null;
                  try {
                    const { data: sUrlData, error: sErr } = await client.storage
                      .from("Files")
                      .createSignedUrl(d.storage_path, 60 * 60);
                    if (!sErr) signedUrl = sUrlData?.signedUrl ?? null;
                  } catch (_) {
                    signedUrl = null;
                  }

                  return { ...d, signedUrl };
                }),
              );

              caseFiles = filesWithUrls;
            }
          }
        } catch (err) {
          // non-fatal: leave caseFiles null
        }
      }
    }
  } catch (err) {
    loadError = err;
  }

  return (
    <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-800/10">
      <JbSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 space-y-6 p-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
                <BreadcrumbSeparator />
              </BreadcrumbItem>
              <BreadcrumbItem>
                <BreadcrumbPage>Case</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{caseItem?.title ? caseItem.title : `Case ${caseItem?.id ?? id}`}</h1>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            <Card className="flex-1 max-w-2xl bg-white/70 dark:bg-slate-900/40">
              <CardHeader>
                <CardTitle>Case Details</CardTitle>
              </CardHeader>
              <CardContent>
                {loadError ? (
                  <div className="text-rose-600">Failed to load case: {String(loadError?.message ?? loadError)}</div>
                ) : caseItem ? (
                  <div className="space-y-3">
                    <div className="text-sm">
                      <div className="font-medium">Title</div>
                      <div className="text-muted-foreground text-sm">{caseItem.title || `Case ${caseItem.id}`}</div>
                    </div>

                    <div className="text-sm">
                      <div className="font-medium">Case ID</div>
                      <div className="font-mono text-xs text-muted-foreground">{caseItem.id}</div>
                    </div>

                    <div className="text-sm">
                      <div className="font-medium">Client</div>
                      <div className="text-muted-foreground text-sm">{caseItem.client_name || '-' } · {caseItem.client_id || '-'}</div>
                    </div>

                    <div className="text-sm">
                      <div className="font-medium">Updated</div>
                      <div className="text-muted-foreground text-sm">{caseItem.updated_at ? new Date(caseItem.updated_at).toLocaleString('en-GB', { timeZone: 'Asia/Singapore' }) : '-'}</div>
                    </div>
                    {/* Files section: reuse the small file card layout from the upload page */}
                    {caseFiles && caseFiles.length > 0 ? (
                      <div>
                        <div className="mt-4 mb-2 font-medium">Files</div>
                        <div className="space-y-2">
                          {caseFiles.map((f: any) => (
                            <Card key={f.id} className="bg-white/60 dark:bg-slate-900/30">
                              <CardContent className="flex items-center justify-between gap-4">
                                <div className="flex-1 flex flex-col justify-center">
                                  <div className="font-medium pt-2">{f.filename}</div>
                                  <div className="text-xs text-muted-foreground">{f.storage_path?.split('.')?.pop() ?? 'file'}</div>
                                </div>
                                <div className="mr-3 text-xs text-muted-foreground">
                                  {f.created_at ? new Date(f.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Singapore' }) : ''}
                                </div>
                                <div>
                                  {f.signedUrl ? (
                                    <a href={f.signedUrl} target="_blank" rel="noreferrer" className="underline text-sm">Open</a>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No preview</span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No case found.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
