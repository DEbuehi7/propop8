-- ============================================================================
-- PropOps8 — audit review trail (Phase 1B)
-- Run after 005–008 in the AUDIT project (tjxnxescjcvpzthmhvuh), not Plate8.
-- Idempotent; safe to re-run. Additive only: no existing column or row changes.
--
-- audit_intakes.review_stage   where the human review of this intake stands
-- audit_intake_events          append-only log of every stage change / send
-- audit_reviews                append-only: engine output and reviewer edits
--                              kept SEPARATE, with the engine version and a
--                              hash of the exact PDF that was approved
--
-- RLS is on with no policies: only the service-role key (server routes behind
-- the admin cookie) can read or write.
-- ============================================================================

create extension if not exists pgcrypto;

alter table public.audit_intakes
  add column if not exists review_stage text not null default 'not_started';

alter table public.audit_intakes drop constraint if exists audit_intakes_review_stage_check;
alter table public.audit_intakes add constraint audit_intakes_review_stage_check
  check (review_stage in ('not_started', 'draft', 'approved', 'sent', 'send_failed'));

-- Intakes already delivered before this migration: say so rather than leaving
-- them looking unreviewed.
update public.audit_intakes
   set review_stage = 'sent'
 where report_sent_at is not null and review_stage = 'not_started';

create table if not exists public.audit_intake_events (
  id         uuid primary key default gen_random_uuid(),
  intake_id  uuid not null references public.audit_intakes (id) on delete cascade,
  event_type text not null,        -- e.g. review_saved, review_approved, report_sent, report_send_failed
  from_stage text,
  to_stage   text,
  detail     jsonb not null default '{}'::jsonb,
  actor      text not null default 'admin',
  created_at timestamptz not null default now()
);
create index if not exists audit_intake_events_intake_idx
  on public.audit_intake_events (intake_id, created_at);

create table if not exists public.audit_reviews (
  id              uuid primary key default gen_random_uuid(),
  intake_id       uuid not null references public.audit_intakes (id) on delete cascade,
  engine_version  text not null,
  engine_output   jsonb not null,   -- exactly what runEngine returned, untouched
  reviewer_edits  jsonb not null,   -- what the human changed on top of it
  gate_checks     jsonb not null default '[]'::jsonb,
  approved        boolean not null default false,
  pdf_sha256      text,             -- hash of the exact PDF bytes approved
  pdf_path        text,             -- storage path of those bytes (for retry)
  created_at      timestamptz not null default now()
);
create index if not exists audit_reviews_intake_idx
  on public.audit_reviews (intake_id, created_at desc);

alter table public.audit_intake_events enable row level security;
alter table public.audit_reviews       enable row level security;

-- Append-only: a correction is a new row, never an edit or a delete.
create or replace function public.audit_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

-- Updates are blocked. Deletes are left open on purpose: the retention purge
-- deletes an intake and the foreign key cascades here; a delete trigger would
-- make that purge fail. Nothing in the app deletes these rows.
drop trigger if exists audit_intake_events_append_only on public.audit_intake_events;
drop trigger if exists audit_intake_events_no_update on public.audit_intake_events;
create trigger audit_intake_events_no_update
  before update on public.audit_intake_events
  for each row execute function public.audit_block_mutation();

drop trigger if exists audit_reviews_no_update on public.audit_reviews;
create trigger audit_reviews_no_update
  before update on public.audit_reviews
  for each row execute function public.audit_block_mutation();
