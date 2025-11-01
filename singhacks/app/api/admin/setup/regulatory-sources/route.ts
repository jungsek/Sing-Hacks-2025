import { NextRequest, NextResponse } from "next/server";

// We avoid importing pg as a dependency; instead, call Supabase SQL HTTP endpoint if service role is present.

async function runSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }

  // Supabase SQL over REST RPC
  const sqlUrl = `${url}/rest/v1/rpc/execute_sql`; // requires an edge function or postgres function; fallback to sql editor copy if not available
  // If the instance doesn't have execute_sql RPC, we'll return sql for manual execution.
  try {
    const res = await fetch(sqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `RPC failed: ${res.status} ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function POST(_req: NextRequest) {
  const sql = await fetch(
    new URL(
      "/lib/supabase/sql/regulatory_sources.sql",
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost",
    ),
  )
    .then(() => null)
    .catch(() => null);

  // Since reading local file via fetch isn't supported here, embed the SQL string by importing with bundler is tricky.
  // As a simple approach, return a static SQL instructive payload for manual run.
  const manualSql = `-- Run this in Supabase SQL editor\n${SQL_TEXT}`;

  // We cannot inline the file content easily without fs; return manual SQL instead.
  return NextResponse.json({
    ok: false,
    message:
      "Automatic SQL execution is not configured. Copy the SQL and run in Supabase SQL editor.",
    sql: SQL_TEXT,
  });
}

// Embed the SQL text here (duplicated from lib/supabase/sql/regulatory_sources.sql)
const SQL_TEXT = `
create table if not exists public.regulatory_sources (
  id uuid primary key default gen_random_uuid(),
  regulator_name text not null,
  title text not null,
  description text,
  policy_url text not null unique,
  regulatory_document_file text,
  published_date date,
  last_updated_date timestamptz default now()
);

create unique index if not exists regulatory_sources_policy_url_idx
  on public.regulatory_sources (policy_url);

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'regulatory_sources' and column_name = 'last_updated_date'
  ) then
    alter table public.regulatory_sources add column last_updated_date timestamptz default now();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'domain'
  ) then
    alter table public.documents add column domain text;
  end if;
end $$;`;
