# Identity and roles

**Why:** canon GOV-09, Phase 0D. Every actor is named, gets the least access
it needs, and is told apart from the others: real people, deliberate system
actors, test fixtures and the public.

| Actor | Who or what | How it proves itself | Can do | Cannot do |
|---|---|---|---|---|
| Owner (admin) | Daniel | `ADMIN_PASSWORD` login, then a signed 12-hour session cookie (`ADMIN_SESSION_SECRET`) | Every `/admin` page and `/api/admin/*` route; send reports; Plate8 | Nothing in the app is above this role |
| Client | A paying customer | Tally submission; an expiring, revocable upload token | Upload files to their own intake's folder only | See other intakes; download anything |
| Public visitor | Anyone | Nothing | Marketing pages, calculators, `/legal`, `/api/health`, the public routes listed in `tests/routeAuth.test.ts` | Any admin or client data |
| Tally (webhook) | Tally's servers | HMAC signature with `TALLY_SIGNING_SECRET`, checked first | Create one intake per event id | Anything if the signature fails (401) or the secret is missing (500) |
| Server (service role) | The deployed app's server code | `SUPABASE_SERVICE_ROLE_KEY`, server-only | Read and write the tables and buckets, which have RLS on and no policies | Run in the browser; appear in client code |
| State8 system actor | `users` row from migration 002 | `STATE8_SYSTEM_USER_ID` | Own unauthenticated Plate8 session rows | Stand in for a real person; missing id fails loudly (500) |
| Test fixtures | Automated tests | Fake values marked "not-real" | Run in `npm test` only | Reach production; the Tally tests stop before the database |

## Rules

1. **Default deny.** A new API route requires the admin cookie unless it is
   added to the public list in `tests/routeAuth.test.ts` with a reason.
2. **RLS stays on.** Tables have RLS enabled and no policies; only the server
   key reads them. Never disable RLS to make something work (canon GOV-09).
3. **One shared admin password is a known weakness** (audit finding M3). It is
   rate-limited (five tries in 15 minutes). Use 20+ characters from the
   password manager; rotate `ADMIN_SESSION_SECRET` to end every session.
4. **Public routes still have guards:** the Tally signature, upload tokens,
   the login throttle and SSRF checks on `/api/rss`. `/api/yt` is open finding
   L2 (it spends the YouTube quota).
5. **No second admin** until there is a real second person, and then with
   their own login rather than the shared password.

## Checked by

- `tests/routeAuth.test.ts`: every non-public handler checks the admin session first.
- `tests/securityGuards.test.ts`: forged, tampered and expired cookies fail; the Tally signature is enforced.
- `tests/loginThrottle.test.ts`: the login rate limit.
