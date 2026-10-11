-- ============================================================================
-- PropOps8 — admin login attempt limit (audit finding M3)
-- Idempotent; safe to re-run. Service-role only (RLS on, no policies).
-- client_hash is an HMAC of the client IP keyed with ADMIN_SESSION_SECRET;
-- raw IP addresses are never stored. Rows are never edited.
-- ============================================================================

create table if not exists public.admin_login_attempts (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  ok          boolean not null
);
create index if not exists admin_login_attempts_client_idx
  on public.admin_login_attempts (client_hash, at desc) where not ok;

alter table public.admin_login_attempts enable row level security;

create or replace function public.b5r_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists admin_login_attempts_no_update on public.admin_login_attempts;
create trigger admin_login_attempts_no_update before update on public.admin_login_attempts
  for each row execute function public.b5r_block_mutation();

-- Housekeeping you can run any time (keeps 90 days):
--   delete from public.admin_login_attempts where at < now() - interval '90 days';
