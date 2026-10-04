-- ============================================================================
-- PropOps8 — AIM-B5R scheduled data job: run history
-- Run after 007. Idempotent; safe to re-run.
--
-- One row per weekly run of aim-b5r-engine/run_scheduled.py (GitHub Actions).
-- Shown at the top of /admin/b5r so a silently-dead job is visible.
-- Service-role only (RLS on, no policies). Append-only.
-- ============================================================================

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

drop trigger if exists b5r_job_runs_append_only on public.b5r_job_runs;
create trigger b5r_job_runs_append_only before update on public.b5r_job_runs
  for each row execute function public.b5r_block_mutation();
