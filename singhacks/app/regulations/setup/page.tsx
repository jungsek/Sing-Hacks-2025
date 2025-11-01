"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function RegulatorySetupPage() {
  const [sql, setSql] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const runSetup = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/setup/regulatory-sources", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setMessage("Setup completed successfully.");
      } else {
        setMessage(json.message || "Automatic setup not available. Copy SQL below.");
        if (json.sql) setSql(json.sql);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Regulatory Sources Setup</CardTitle>
          <CardDescription>
            Initialize the Supabase schema for the regulatory_sources table. Requires service role
            for automatic execution; otherwise, copy the SQL and run in Supabase SQL Editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runSetup} disabled={loading}>
            {loading ? "Running…" : "Run setup"}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          {sql && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Copy SQL:</p>
              <Textarea className="h-64 font-mono text-xs" value={sql} readOnly />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
