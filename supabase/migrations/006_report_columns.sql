-- ============================================================================
-- PropOps8 — report delivery columns
-- app/api/send-report/route.ts reads and writes report_sent_at and
-- resend_message_id, but neither column was in schema.sql or any migration, so
-- a database built from this repo would fail every send. The live database may
-- already have them; this is idempotent and safe to run either way.
-- ============================================================================

alter table public.audit_intakes
  add column if not exists report_sent_at    timestamptz,
  add column if not exists resend_message_id text;
