# PropOps8 Admin — Audit Review Backend

Upload a CSV → the engine runs deterministic checks → you review and
correct every finding → approve → download the branded PDF. Runs at
`/admin/review` on propops8.com itself, gated behind a password so it's
not public.

## How this relates to generate_audit_report.py

You now have two report generators — that's intentional, not
redundant:

- **`generate_audit_report.py`** (Python, from earlier) — a standalone
  script for scripting/automation. Good for batch-generating reports,
  or wiring into the CSV engine's own pipeline in Codespaces.
- **This admin tool** (TypeScript, lives in the site itself) — the
  interactive review step specifically: upload, see findings, edit
  anything that's wrong, toggle findings off, approve, download. This
  is what "process, review, correct, approve" actually needed — a
  script can't do the "correct" part.

Both produce visually identical PDFs — same tokens, same layout, same
data contract (`Finding` / `SpendRow` here mirror the Python `dict`
shapes exactly). Use whichever fits the moment; they're not competing.

## File placement

Drop these into your existing repo at the same relative paths:

```
middleware.ts                        <- repo root, next to package.json
app/admin/login/page.tsx
app/admin/review/page.tsx
app/api/admin/login/route.ts
app/api/admin/logout/route.ts
lib/adminAuth.ts
lib/auditEngine.ts
lib/reportPdf.tsx
lib/reportTypes.ts
public/fonts/*.ttf                   <- 5 font files
public/assets/ugly8-mark.jpg
```

**If you already have a `middleware.ts`** (for the Tally webhook or
anything else), don't overwrite it — merge the `/admin` check from
this one into your existing matcher instead. Next.js only runs one
middleware file per project.

## Setup

1. Install the two new dependencies (everything else — React, Next,
   TypeScript — you already have):
   ```
   npm install @react-pdf/renderer papaparse
   ```

2. Add two environment variables in Netlify (Site settings → Environment
   variables), not in a committed file:
   ```
   ADMIN_PASSWORD=<pick something>
   ADMIN_SESSION_SECRET=<random string>
   ```
   Generate the secret with `openssl rand -hex 32` — it signs the
   session cookie so it can't be forged. Rotating it logs everyone out,
   which is a fine way to force a re-login if you're ever unsure.

3. Deploy (draft first, same habit as always), then visit
   `/admin/login` on the draft URL.

## Using it

1. Go to `/admin/review`, drop in a CSV.
2. Expected columns: `date, vendor, category, amount`, plus optional
   `unit`, `description`, `work_order_id`, `status`, `opened_date`,
   `closed_date` for the aging check. Header names are
   case/whitespace-insensitive and a few common aliases are handled
   (`invoice date`, `cost`, `total`, etc.) — see the `HEADER_ALIASES`
   map in `lib/auditEngine.ts` if your export uses something else.
3. Fill in property/client/period, write (or paste) the summary
   paragraph.
4. Edit any finding — title, description, amount, recommendation,
   whether it's included at all, whether it's a cost (pink) or healthy
   (mint).
5. Approve & download — PDF generates in your browser and downloads
   immediately. No server round-trip for this step, so there's nothing
   to time out.

## The one thing that's genuinely a placeholder, not a shortcut

`lib/auditEngine.ts` implements three real, working checks (vendor
concentration, duplicate billing, aging) against a reasonable ledger
shape — I don't have your actual thresholds or your real baseline
methodology, so I built something that demonstrably works end-to-end
rather than guessing at rules you'd have to rip out anyway. The
`Finding` and `SpendRow` shapes it returns are the actual contract the
review UI and PDF depend on — keep those two shapes even if you
replace everything inside the three check functions with your real
"math over magic" logic.

## What this deliberately doesn't do

No database writes. Nothing here touches Supabase — every approved
report exists only as the downloaded PDF, nothing is logged anywhere.
If you want a record of past audits, that's a real, separate feature
worth doing properly against your actual table conventions rather than
me guessing a schema you'd have to migrate away from — just say so.

No multi-user auth. This is one shared password for one operator, not
a login system. Fine for now; worth revisiting with real Supabase Auth
if a second person ever needs their own access.
