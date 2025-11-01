-- Create table regulatory_sources if not exists
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

-- Ensure unique index on policy_url
create unique index if not exists regulatory_sources_policy_url_idx
  on public.regulatory_sources (policy_url);

-- Add missing columns defensively
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'regulatory_sources' and column_name = 'last_updated_date'
  ) then
    alter table public.regulatory_sources add column last_updated_date timestamptz default now();
  end if;
end $$;

-- Optional: add domain to documents if your pipeline still uses it
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'domain'
  ) then
    alter table public.documents add column domain text;
  end if;
end $$;
