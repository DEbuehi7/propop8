-- ============================================================================
-- PropOps8 — AIM-B5R scheduled data job: run history
-- Independent of 007: creates the append-only trigger function itself
-- (create or replace), so it runs in any order. Idempotent; safe to re-run.
--
-- One row per weekly run of aim-b5r-engine/run_scheduled.py (GitHub Actions).
-- Shown at the top of /admin/b5r so a silently-dead job is visible.
-- Service-role only (RLS on, no policies). Append-only.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.b5r_job_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null,
  finished_at timestamptz not null default now(),
  ok          boolean not null,
  summary     text not null default '',
  report      jsonb not null default '{}'::jsonb,
  trigger     text not null default 'schedule'
);
create index if not exists b5r_job_runs_started_idx on public.b5r_job_runs (started_at desc);

alter table public.b5r_job_runs enable row level security;

-- Same function 007 defines; repeated here so this file stands alone.
create or replace function public.b5r_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists b5r_job_runs_append_only on public.b5r_job_runs;
create trigger b5r_job_runs_append_only before update on public.b5r_job_runs
  for each row execute function public.b5r_block_mutation();
