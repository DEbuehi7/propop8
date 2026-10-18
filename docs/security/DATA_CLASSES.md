# Data classes

**Why:** canon Phase 0D. Every kind of data PropOps8 handles has one class,
and the class decides where it may be stored, whether AI may see it, what may
be logged and how long it is kept. Classes come from the canon
(`lib/canon/vocab.ts`, `PRIVACY_CLASSES`).

## Rules per class

| Class | Stored where | AI may see it? | In logs? | Kept |
|---|---|---|---|---|
| Public | Anywhere, including the public repo | Yes | Yes | Indefinitely |
| Internal | Repo (if not sensitive), Supabase, Netlify | Yes, for development | Yes | As long as useful |
| Confidential | Supabase (private tables and buckets), Resend, Tally | Only de-identified extracts the owner approves | IDs and counts only, never contents | Per the published window (uploads 30 days) |
| PII | Supabase, Tally, Resend, only where the workflow needs it | No | Never | Minimum needed; deleted on request |
| Sensitive | AIM Vault, or the user's own browser only | No | Never | Owner decides per item |
| Regulated | The provider that is regulated for it (Stripe for cards), or the user's own browser | No | Never | As the regulation requires |
| Secret (credentials) | Netlify environment, `.env.local` on the owner's Mac, password manager | Never, not even the value's shape | Never | Rotated on any suspicion |

## What PropOps8 holds

| Data | Class | Where | Notes |
|---|---|---|---|
| Intake contact details (name, email, company) | PII | Supabase `audit_intakes`, Tally, Resend | Needed to deliver the audit |
| Uploaded operational exports | Confidential | Supabase `audit-uploads` bucket | Privacy policy: de-identified data only; deleted 30 days after upload, immediately on refund (finding R1) |
| Approved report PDFs | Confidential | Supabase `audit-reports` bucket, emailed via Resend | Retention for reports is an open decision |
| Review trail and intake events | Confidential | Supabase `audit_reviews`, `audit_intake_events` | Append-only; updates blocked |
| Payment card data | Regulated | Stripe only | Never reaches PropOps8 |
| Recert household data | Regulated | The user's browser tab only (`/tools/recert/engine`) | Never sent to the server; leaving the page discards it |
| Admin password, session secret, API keys | Secret | Netlify, owner's Mac | `tests/secretScan.test.ts` blocks them from the repo |
| Login throttle records | Internal | Supabase `admin_login_attempts` | IP addresses stored only as an HMAC |
| B5R deals and runs | Internal | Supabase `b5r_*` tables | Owner's research; no tenant data (canon GOV-15) |
| Kern/Fresno parcel evidence | Public | Repo `data/aim-b5r/` | Public records only |
| Plate8 sessions | Internal | Supabase (Plate8 project once configured) | Personal rig |
| Stuttr and Dance8 media | Internal | Local library, Dance8's own account | Never mixed with property data (GOV-15) |
| Employer or worksite material | Not allowed | Nowhere | Written clearance required first (GOV-16) |

## Rules that follow from this

- No confidential, PII, sensitive or regulated data in the public GitHub repo,
  in AI prompts, in screenshots shared outside, or in logs.
- Server logs record IDs, counts and error codes, never file contents, form
  answers or email bodies.
- A request to delete personal data is honoured across Supabase, Tally and
  Resend; record the date in the incident log.
