-- ============================================================================
-- PropOps8 — Tally migration
-- Run after 001–004. Converts the Stripe-shaped intake schema to the Tally flow.
-- Idempotent; safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generalise the webhook event log.
--
-- stripe_events becomes webhook_events with a source column, because the
-- idempotency problem is identical whoever is posting: Tally retries on
-- non-2xx exactly like Stripe does, and a retry that re-runs fulfilment sends
-- a second upload email to a paying customer.
-- ---------------------------------------------------------------------------

alter table if exists public.stripe_events rename to webhook_events;

alter table public.webhook_events
  add column if not exists source text not null default 'stripe';

create index if not exists webhook_events_source_idx on public.webhook_events (source);

-- ---------------------------------------------------------------------------
-- Intake: Tally response id replaces the Stripe session id.
-- The old columns stay (nullable) so historic rows keep their meaning.
-- ---------------------------------------------------------------------------

alter table public.audit_intakes
  add column if not exists tally_response_id text;

create unique index if not exists audit_intakes_tally_response_idx
  on public.audit_intakes (tally_response_id)
  where tally_response_id is not null;

-- 'submitted' is new and important: the form is in, but payment is NOT proven.
-- Intakes sit here until released. See TALLY-SETUP.md §5.
alter table public.audit_intakes drop constraint if exists audit_intakes_status_check;

alter table public.audit_intakes add constraint audit_intakes_status_check
  check (status in (
    'requested',
    'submitted',         -- form received, payment unproven, HELD
    'checkout_created',  -- legacy Stripe
    'checkout_failed',   -- legacy Stripe
    'awaiting_payment',
    'paid',
    'payment_failed',
    'expired',
    'files_received',
    'in_analysis',
    'delivered',
    'refunded'
  ));

-- ---------------------------------------------------------------------------
-- Held intakes — the queue you work from when payment isn't auto-confirmed.
-- ---------------------------------------------------------------------------

create or replace view public.held_intakes as
select
  i.id,
  i.created_at,
  i.name,
  i.company,
  i.email,
  i.portfolio_size,
  i.primary_concern,
  i.calculator_snapshot,
  i.tally_response_id
from public.audit_intakes i
where i.status = 'submitted'
order by i.created_at asc;

-- ---------------------------------------------------------------------------
-- Release a held intake once you've confirmed the $497 landed.
-- Flips status to paid; the app then issues the token and sends the link.
--
--   select public.release_intake('<uuid>');
-- ---------------------------------------------------------------------------

create or replace function public.release_intake(p_intake_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.audit_intakes
     set status  = 'paid',
         paid_at = now()
   where id = p_intake_id
     and status = 'submitted';
$$;

revoke all on function public.release_intake(uuid) from public, anon, authenticated;
