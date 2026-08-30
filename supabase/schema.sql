-- ============================================================================
-- PropOps8 — complete schema, Tally flow
-- ============================================================================
--
-- This REPLACES 001–005. Those were written as sequential migrations, but 003
-- drops columns 001 creates and 005 renames a table 001 made — so running them
-- in order builds and tears down the same structures. Since nothing has been
-- applied to the database yet, there is no history worth preserving. This is
-- the final state, in one file.
--
-- Paste the whole thing into the Supabase SQL editor and run once.
-- Idempotent; safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Intakes
-- ---------------------------------------------------------------------------

create table if not exists public.audit_intakes (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- qualification, from the Tally form
  name                text not null,
  email               text not null,
  company             text not null,
  role                text,
  portfolio_size      text not null,
  primary_concern     text not null,
  data_availability   text,
  authority_confirmed boolean not null default false,

  -- what the calculator handed over via Tally hidden fields
  calculator_snapshot jsonb,

  tally_response_id   text,

  status text not null default 'submitted'
    check (status in (
      'submitted',       -- form in, payment NOT proven — held, see release_intake()
      'paid',
      'files_received',
      'in_analysis',
      'delivered',
      'refunded'
    )),
  paid_at             timestamptz,

  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending', 'sending', 'sent', 'failed')),
  fulfillment_error   text,

  files_submitted_at  timestamptz,
  purge_after         timestamptz   -- enforce your stated retention window
);

create index if not exists audit_intakes_email_idx  on public.audit_intakes (email);
create index if not exists audit_intakes_status_idx on public.audit_intakes (status);
create unique index if not exists audit_intakes_tally_response_idx
  on public.audit_intakes (tally_response_id) where tally_response_id is not null;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists audit_intakes_touch on public.audit_intakes;
create trigger audit_intakes_touch
  before update on public.audit_intakes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Webhook event log — the idempotency guard
--
-- Tally retries on any non-2xx and can deliver the same event twice on
-- success. Without a primary key on event_id, a retry re-runs fulfilment and
-- the customer gets a second upload email.
-- ---------------------------------------------------------------------------

create table if not exists public.webhook_events (
  event_id     text primary key,
  source       text not null default 'tally',
  event_type   text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  status       text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  error        text,
  payload      jsonb
);

create index if not exists webhook_events_source_idx on public.webhook_events (source);

-- ---------------------------------------------------------------------------
-- Upload tokens
-- ---------------------------------------------------------------------------

create table if not exists public.upload_tokens (
  id           uuid primary key default gen_random_uuid(),
  intake_id    uuid not null references public.audit_intakes(id) on delete cascade,
  token        uuid not null unique default gen_random_uuid(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  seen_count   integer not null default 0
);

-- The UNIQUE on token already creates its index; this is the one that was
-- missing — needed for the cascade delete and for finding a live token.
create index if not exists upload_tokens_intake_idx on public.upload_tokens (intake_id);

-- At most one live token per intake, so reissuing forces a revoke and a
-- forwarded old link stops working the moment a replacement is sent.
create unique index if not exists upload_tokens_one_live_idx
  on public.upload_tokens (intake_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Uploads — one row per file. Most intakes arrive as two or three exports.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_uploads (
  id            uuid primary key default gen_random_uuid(),
  intake_id     uuid not null references public.audit_intakes(id) on delete cascade,
  storage_path  text not null unique,
  original_name text not null,
  content_type  text,
  size_bytes    bigint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists audit_uploads_intake_idx on public.audit_uploads (intake_id);

-- ---------------------------------------------------------------------------
-- RLS: no policies means no anon/authenticated access at all.
-- Only the service-role key reaches these. Never expose it to the browser.
-- ---------------------------------------------------------------------------

alter table public.audit_intakes  enable row level security;
alter table public.webhook_events enable row level security;
alter table public.upload_tokens  enable row level security;
alter table public.audit_uploads  enable row level security;

-- ---------------------------------------------------------------------------
-- Storage: private bucket. Public buckets are not an option for operational
-- exports, even de-identified ones.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audit-uploads', 'audit-uploads', false, 52428800,
  array[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Access trail. Called fire-and-forget from the upload GET; must never raise.
create or replace function public.increment_upload_token_seen(p_token uuid)
returns void language sql security definer set search_path = public as $$
  update public.upload_tokens
     set last_seen_at = now(), seen_count = seen_count + 1
   where token = p_token;
$$;

-- Release a held intake once you've confirmed the $497 landed.
--   select public.release_intake('<uuid>');
create or replace function public.release_intake(p_intake_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.audit_intakes
     set status = 'paid', paid_at = now()
   where id = p_intake_id and status = 'submitted';
$$;

revoke all on function public.increment_upload_token_seen(uuid) from public, anon, authenticated;
revoke all on function public.release_intake(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Views — your working queues
-- ---------------------------------------------------------------------------

-- Paid, waiting on you.
create or replace view public.audit_queue as
select i.id, i.created_at, i.name, i.company, i.email, i.portfolio_size,
       i.primary_concern, i.status, i.paid_at, i.files_submitted_at,
       count(u.id) as file_count,
       coalesce(sum(u.size_bytes), 0) as total_bytes
from public.audit_intakes i
left join public.audit_uploads u on u.intake_id = i.id
where i.status in ('paid', 'files_received', 'in_analysis')
group by i.id
order by i.paid_at asc nulls last;

-- Submitted but payment unproven. Work from this until TALLY_PAYMENT_ENABLED.
create or replace view public.held_intakes as
select id, created_at, name, company, email, portfolio_size,
       primary_concern, calculator_snapshot, tally_response_id
from public.audit_intakes
where status = 'submitted'
order by created_at asc;

create or replace view public.active_upload_tokens as
select t.intake_id, t.token, t.expires_at, t.created_at, t.last_seen_at,
       t.seen_count, i.company, i.email, i.status,
       (t.expires_at < now()) as is_expired
from public.upload_tokens t
join public.audit_intakes i on i.id = t.intake_id
where t.revoked_at is null;

-- ---------------------------------------------------------------------------
-- Retention. Schedule once you've published a window; the copy on /audit has
-- to match what this actually does.
-- ---------------------------------------------------------------------------

-- select cron.schedule('purge-audit-uploads', '0 3 * * *',
--   $$ delete from storage.objects
--      where bucket_id = 'audit-uploads'
--        and created_at < now() - interval '90 days' $$);
