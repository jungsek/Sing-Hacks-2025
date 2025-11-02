-- Alerts table for persisted Sentinel alert artifacts
create table if not exists public.alerts (
  id text primary key,
  transaction_id text not null,
  severity text not null check (severity in ('low','medium','high')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists alerts_transaction_id_idx on public.alerts (transaction_id);
create index if not exists alerts_severity_idx on public.alerts (severity);
create index if not exists alerts_created_at_idx on public.alerts (created_at desc);

-- Monitor rows table to persist ingested transactions shown in the feed
create table if not exists public.monitor_rows (
  run_id text not null,
  index integer not null,
  transaction_id text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists monitor_rows_created_at_idx on public.monitor_rows (created_at desc);
create index if not exists monitor_rows_transaction_id_idx on public.monitor_rows (transaction_id);

-- Optional: RLS example (adjust to your auth model)
-- alter table public.alerts enable row level security;
-- alter table public.monitor_rows enable row level security;
-- create policy "read_all_for_demo_alerts" on public.alerts for select using (true);
-- create policy "read_all_for_demo_monitor_rows" on public.monitor_rows for select using (true);
