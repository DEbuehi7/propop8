-- ============================================================================
-- PropOps8 — AIM-B5R deal pipeline
-- Run after 001–006. Idempotent; safe to re-run.
--
-- b5r_deals        one row per deal under underwriting (latest inputs + call)
-- b5r_runs         append-only history: every saved simulation, inputs and all
-- b5r_calibration  append-only predicted-vs-actual log (the "Recalibrate" step)
--
-- RLS is on with no policies: only the service-role key (server API routes
-- behind the admin cookie) can read or write. Nothing here is public.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.b5r_deals (
  id            uuid primary key default gen_random_uuid(),
  deal_id       text not null unique,
  status        text not null default 'screening'
                check (status in ('screening','modeling','offer','bought','rehab','stabilized','refinanced','dead')),
  inputs        jsonb not null,
  latest_call   text check (latest_call in ('EXECUTE','DEFER','ESCALATE','KILL')),
  latest_result jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.b5r_runs (
  id           uuid primary key default gen_random_uuid(),
  deal_id      text not null references public.b5r_deals (deal_id) on delete cascade,
  inputs       jsonb not null,
  result       jsonb not null,
  call         text not null check (call in ('EXECUTE','DEFER','ESCALATE','KILL')),
  reasons      jsonb not null default '[]'::jsonb,
  policy_id    text not null,
  n_iterations integer not null,
  seed         integer not null,
  created_at   timestamptz not null default now()
);
create index if not exists b5r_runs_deal_idx on public.b5r_runs (deal_id, created_at desc);

create table if not exists public.b5r_calibration (
  id               uuid primary key default gen_random_uuid(),
  deal_id          text not null references public.b5r_deals (deal_id) on delete cascade,
  run_id           uuid not null references public.b5r_runs (id) on delete cascade,
  metric           text not null,
  predicted_p10    numeric not null,
  predicted_p50    numeric not null,
  predicted_p90    numeric not null,
  actual           numeric not null,
  error_pct_of_p50 numeric,
  source           text not null default '',
  logged_at        timestamptz not null default now()
);
create index if not exists b5r_calibration_metric_idx on public.b5r_calibration (metric);

alter table public.b5r_deals       enable row level security;
alter table public.b5r_runs        enable row level security;
alter table public.b5r_calibration enable row level security;

-- History tables are append-only: a corrected observation is a new row.
create or replace function public.b5r_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists b5r_runs_append_only on public.b5r_runs;
create trigger b5r_runs_append_only before update on public.b5r_runs
  for each row execute function public.b5r_block_mutation();

drop trigger if exists b5r_calibration_append_only on public.b5r_calibration;
create trigger b5r_calibration_append_only before update on public.b5r_calibration
  for each row execute function public.b5r_block_mutation();
