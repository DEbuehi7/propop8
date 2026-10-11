-- ============================================================================
-- PropOps8 — private bucket for the APPROVED report PDF (Phase 1B)
-- Run after 009, in the AUDIT project. Idempotent.
--
-- The exact bytes a reviewer approved are kept so a failed send can be retried
-- with the same document, not a re-render. Private: no public URL, service-role
-- access only. Retention follows audit_intakes.purge_after like the uploads.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audit-reports', 'audit-reports', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
