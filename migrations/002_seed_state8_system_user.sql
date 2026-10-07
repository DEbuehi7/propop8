-- 002_seed_state8_system_user.sql
-- Deliberate system actor for unauthenticated State8 sessions (Phase 2C).
-- sessions.user_id is NOT NULL REFERENCES users(id), so every persisted
-- session needs a real owner row. auth_id is intentionally NULL: this actor
-- has no Supabase Auth identity. The .invalid TLD (RFC 2606) can never
-- receive mail.
--
-- This UUID must match STATE8_SYSTEM_USER_ID in .env.local.
-- Idempotent: safe to re-run. An email conflict under a different id will
-- still error, which is intended.

INSERT INTO users (id, auth_id, email, full_name)
VALUES (
  '58b69b8d-a2a3-4b85-8f69-fd92553e8e40',
  NULL,
  'state8-system-guest@system.invalid',
  'State8 System Guest'
)
ON CONFLICT (id) DO NOTHING;

-- Verify:
-- SELECT id, auth_id, email FROM users WHERE email = 'state8-system-guest@system.invalid';
