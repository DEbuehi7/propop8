## Round 6

You sent back all three posters regenerated against the round-5 critique. Short version: Eon and Lumen came back essentially clean — I put the actual artwork on the pages now, not just the transcribed text. Transect is the best of the three (the world map got replaced with a real California map) but its own art introduces one new doctrine conflict — flagged below, not fixed, because it's in the pixels.

### New/changed files

| File | What changed |
|---|---|
| `public/lvn/eon-labs-poster.webp`, `lumen-labs-poster.webp`, `transect-poster.webp` | **New.** The three regenerated posters, re-encoded from your PNGs to WebP (quality 90) to cut page weight roughly 85% — 2.5–3.5MB each down to 390–560KB — with no visible loss on the dense infographic text. Real pixel dimensions: Eon 1024×1536, Lumen 1055×1491, Transect 1024×1536. |
| `components/admin/ConceptPoster.tsx` | **Replaces the version already in your repo.** Added an optional `image` prop (`{ src, alt, width, height }`), rendered via `next/image` right under the tagline. A page that doesn't pass it renders exactly as before. |
| `components/admin/ConceptPoster.module.css` | **Replaces the version already in your repo.** One addition: `.poster` (responsive width, rounded border, matches the existing card styling). |
| `app/admin/lvn/eon/page.tsx` | **Replaces the version already in your repo.** Poster image added; new cards block transcribing the poster's six-part "AI-Driven Resilience Node" diagram (now legible and non-duplicated, unlike round 5's source); Scale-Up Path Stage 3 now explicitly names the Kern/Fresno regional hub, tying it to Transect's own scouting geography; caveat rewritten — see below. |
| `app/admin/lvn/lumen/page.tsx` | **Replaces the version already in your repo.** Poster image added; content blocks unchanged (they already held up); caveat rewritten to note the revision actually reinforces the "not a compute node" position. |
| `app/admin/lvn/transect/page.tsx` | **Replaces the version already in your repo.** Poster image added; the gear matrix now uses the poster's real, place-named columns (Desert/Eon Labs, Mountain/Lumen Labs, Kern-Fresno/Scouting) and its full 18-row list, replacing round 5's generic Desert/Mountain/City/Coastal guess; added the poster's "Essential gear" 4-card kit and a new "California Circuit" list; trimmed "Use cases" from 6 cards to the poster's actual 5. Caveat flags the one open issue — see below. |

### Verified

Typechecked all five files above against real `react`/`next`/`@types/*` packages (temporarily installed, then removed) — zero errors, including the new `next/image` usage.

One thing I couldn't verify from here: `next/image` needs the project's default image optimization enabled. If `next.config.js` sets `images: { unoptimized: true }` or uses `output: "export"`, the images will still render (just unoptimized) — nothing breaks either way, just mentioning it since I can't see your real config.

### What's fixed vs. the round-5 critique

**Lumen** — essentially everything: SBI's full name, "AIM" instead of "AIModular", the AI/compute-lab leaf and "Cognition Engine Supercomputer Mode" label both gone, "Backup Power" instead of "Backup Computing," concrete phrases instead of vague tree-trunk poetry, the run-on tagline punctuated. The building-section cutaway still visually resembles a server room, but it's now labeled "MEP / Storage" — a normal room for a cabin with a solar array (inverters, batteries, a water heater), not a compute chamber, so I read this as cosmetic, not a doctrine problem.

**Eon** — essentially everything: fully legible captions throughout; lot size now reconciles (11,236 sq ft / 0.28 ac, versus the current board's 0.26-acre APN figure — close, not identical, so I described rather than asserted it in the caveat); coordinates are now real Twentynine Palms coordinates; the hub-spoke diagram has six distinct, non-duplicated spokes including the new BRRRR-tied "Real Estate Intelligence" one; Scale-Up Path stages are now distinct. Two small copy-editing glitches remain on the art itself, both noted in the page's caveat rather than fixed (I can't edit pixels): the Program Fit list renumbers 1-2-3 then 2-5-6, and one caption reads "a distinctly identity" instead of "a distinct identity." Neither blocks anything — just worth a touch-up whenever it's regenerated again.

**Transect** — the world map is gone, replaced with an accurate "California Circuit" map showing the three real stops (Crestline/Lumen, Kern-Fresno, Twentynine Palms/Eon) — best fix of the three. The gear matrix now uses real, differentiated columns instead of generic archetypes. Icon mismatches are fixed (handshake for Acquire, target for Operate).

### Still open — one doctrine conflict, in the art itself

The Transect poster's top banner and its new California Circuit map both tag **Lumen Labs "Compute · Research · Optimize" / "Compute & Optimize."** That's the exact framing Lumen's own page rejects ("not a compute node under the current canon") — likely a leftover from the earlier Lumen compute-lab concept that didn't get scrubbed everywhere in this regeneration. I didn't silently carry that wording into the site: the new "California Circuit" list on the Transect page describes the Crestline stop as "mountain research, cold-climate testing and retreat" instead. But the poster image itself — which is now embedded on the page — still shows "Compute" twice. Worth flagging when you regenerate next; until then it's a labeling inconsistency in the artwork, not in anything the site actually asserts.

### Paste into Claude Code (or Cline) inside the propops8 folder

```
Read CLAUDE.md and AGENTS.md first. I've added public/lvn/{eon-labs-poster,lumen-labs-poster,transect-poster}.webp (the regenerated LVN concept posters, re-encoded to WebP), replaced components/admin/ConceptPoster.tsx + .module.css (added an optional `image` prop rendered via next/image — backward compatible), and replaced app/admin/lvn/{eon,lumen,transect}/page.tsx (each now renders its poster image plus refreshed concept-poster content matching the corrected posters). Diff all of it against your live copies, merge, confirm next.config.js doesn't set images.unoptimized or output:"export" in a way that would need adjusting, confirm all three node pages render the new poster image and updated sections correctly, run `npm run build`, fix only errors caused by these files, commit on a new branch, deploy the same way as last time.
```

---

## Round 5

Added the three concept-poster images (Transect, 29 Palms Eon Labs, Snowline Crestline Lumen Labs) to their matching LVN node pages — but not as a straight transcription. Read on before merging Eon and Lumen especially.

### New shared piece

| File | What it is |
|---|---|
| `components/admin/LabDetail.tsx` | **Replaces the version already in your repo.** One addition: an optional `children` prop, rendered after Gates and before the source footer. Everything else is unchanged — a page that doesn't pass children renders byte-identical to before. |
| `components/admin/ConceptPoster.tsx` (+ `.module.css`) | **New.** A shared renderer for "vision poster" content — cards, lists, numbered steps, or a comparison matrix — visually distinct (dashed amber-top divider) from the current-board content above it, so a reader can't mistake concept material for the authoritative board. |

### Per-node content

| File | What changed |
|---|---|
| `app/admin/lvn/transect/page.tsx` | **Replaces the version already in your repo.** Added the full Transect poster as a `<ConceptPoster>`: lifestyle pillars, a destination gear matrix, use cases, smart travel principles. No conflict with the current board — Transect's poster is a lifestyle/kit reference, not a building program, and the page already says "a circuit, not a site." |
| `app/admin/lvn/eon/page.tsx` | **Replaces the version already in your repo.** Added the 29 Palms Eon Labs poster as a `<ConceptPoster>`, framed explicitly as the *long-horizon* version of the node, not the current one — see below. |
| `app/admin/lvn/lumen/page.tsx` | **Replaces the version already in your repo.** Added the Snowline Crestline Lumen Labs poster as a `<ConceptPoster>`, kept to only the two things already flagged as still-canonical (technique + material direction) — see below. |

### Why Eon and Lumen aren't a straight copy of the posters

Both of those pages already carry a deliberate `supersedes` note from an earlier round: Eon's current board is a single-level house on the real 0.26-acre lot, not the earlier ~22,000 SF compound; Lumen's current board is a modest two-level cabin, explicitly "not a compute node." The two new posters you sent are exactly those earlier, larger concepts — Eon's poster is a full off-grid research campus with sensor networks and an "Energy Compute Cap"; Lumen's is an AI/compute lab built around a below-grade "cognition engine" with server-grade snow-cooling.

Rather than overwrite the current-board facts with poster content (or ignore the posters), each page now carries both, clearly separated: the current board stands exactly as it was, and the poster is added below it as labeled concept/precedent material — for Eon, the long-horizon direction if the gates ever clear; for Lumen, only the parts of the old compute-lab poster that still genuinely apply to a cabin (the WUI wall/roof/window assemblies, the site elements), with the compute-lab program itself explicitly called out as NOT carrying over. If you actually want either board upgraded to match the fuller poster concept — i.e., un-superseding it — say so and I'll do that instead; I didn't want to make that call silently.

One more thing, not a doctrine call: Eon's poster lists specific site metrics (lot size, elevation, lat/long). They don't match this lot's real APN/board data, and the coordinates given don't even correspond to Twentynine Palms — read as placeholder poster text, not survey facts, so I left them out rather than reproduce numbers that would contradict the real board above them.

### Paste into Claude Code (or Cline) inside the propops8 folder

```
Read CLAUDE.md and AGENTS.md first. I've replaced components/admin/LabDetail.tsx (added an optional children prop, otherwise unchanged), added components/admin/ConceptPoster.tsx + .module.css (new shared component), and replaced app/admin/lvn/{eon,lumen,transect}/page.tsx (each now renders a <ConceptPoster> section with concept-poster content, clearly separated from the current board). Diff all of it against your live copies, merge, confirm all three node pages still render correctly with the new section, run `npm run build`, fix only errors caused by these files, commit on a new branch, deploy the same way as last time.
```

---

## Round 4

Ships one real fix. The admin-login redirect is still being pinned down — see below, still need one more file.

### What's new this round

| File | What it is |
|---|---|
| `scripts/fill_tic_fillable.py` | Bug fix, not a website file. pypdf was crashing on the official HOTMA TIC template — one field (`fill_140`) has no appearance stream in Treasurer's own PDF, and pypdf assumed every field like it is a checkbox. Worked around it; nothing about the data or the output changes. Also removed the "Vacant checkbox left unchecked" warning it used to print — recerts are never run on a vacant unit, so that was never a real gap. |
| `app/api/admin/login/route.ts` | **Replaces the version already in your repo — cosmetic only.** Removed a stale comment referencing `debugExpectedLength`/`debugGotLength` fields that no longer exist in the code, and fixed stray double-indentation on the "Incorrect password" return. No logic, response, or cookie behavior changed — confirmed this route doesn't redirect at all, that's the next row. |
| `app/admin/login/page.tsx` | **Replaces the version already in your repo — this is the actual fix.** Two changes, both on the post-login `router.push(...)` line: (1) default destination is now `/admin` instead of `/admin/review`, so a plain login lands on the launchpad; (2) the `from` query param is only honored when it starts with `/admin` — it's attacker-controlled (search confirmed the only other reference is `proxy.ts` setting it to bring you back where you started), and was being passed to `router.push` unchecked. `/admin/login?from=https://evil.example` after a real login would previously have sent you there; now it falls back to `/admin` instead. |

### Paste into Claude Code (or Cline) inside the propops8 folder

```
Read CLAUDE.md and AGENTS.md first. I've updated three files: scripts/fill_tic_fillable.py (pypdf compatibility fix, one warning removed), app/api/admin/login/route.ts (comment/indentation cleanup only, no behavior change), and app/admin/login/page.tsx (the actual fix — default redirect changed from /admin/review to /admin, and the `from` query param is now validated before use, closing an open-redirect gap). Diff all three against your live copies, merge, confirm a plain login now lands on /admin and shows the launchpad, run `npm run build`, fix only errors caused by these files, commit on a new branch, deploy the same way as last time.
```

### Admin-login redirect — fixed

Root cause: `app/admin/login/page.tsx` line 29 hardcoded `router.push(params.get("from") || "/admin/review")`. `app/admin/page.tsx` and `app/api/admin/login/route.ts` (both checked in round 4) were never involved — no middleware either; a repo-wide search for `/api/admin/login` turned up only this file, `proxy.ts` (a comment) and two READMEs, so there's nowhere else this could be coming from. Fixed above, plus the open-redirect gap in the same line.

---

## Round 3 (small)
Node name confirmed: **Transect**, not Isotherm. `app/admin/lvn/isotherm/` is gone; `app/admin/lvn/transect/page.tsx` replaces it, and `app/admin/lvn/page.tsx`'s LVN-03 entry now points `labUrl` at `/admin/lvn/transect`. Same merge/diff caution as below applies to `app/admin/lvn/page.tsx` again. Nothing else in this round.

---

# PropOps8 drop-in — round 2

Your last deploy already went live with everything from round 1 (Recert Flow Engine, LVN Network board, Admin launchpad, footer nav). This round adds the individual LVN node pages and a couple of fixes. Same merge process: copy `app/`, `components/` and `public/` into the `propops8` folder.

## What's new this round

| File | What it is |
|---|---|
| `components/admin/LabDetail.tsx` (+ .module.css) | New shared component — the layout each node's detail page uses |
| `app/admin/lvn/eon/page.tsx` | New page — Eon Lab detail (Canon 12 content) |
| `app/admin/lvn/lumen/page.tsx` | New page — Lumen Lab detail (Canon 12 content) |
| `app/admin/lvn/isotherm/page.tsx` | New page — the third (nomad) node. **"Isotherm" is a proposed name — see chat for two alternatives.** |
| `app/admin/lvn/page.tsx` | **Replaces the version already in your repo.** Wires all three "Open Lab" buttons to the new pages instead of showing disabled buttons, and fills in the third node (was the empty placeholder card). |
| `public/tools/recert/engine.html` | **Replaces the version already in your repo.** Added two links back to propops8.com — the header logo and the footer wordmark are now both clickable (they were plain text before). Nothing else in the file touched. |

Diff `app/admin/lvn/page.tsx` and `public/tools/recert/engine.html` against your live copies before overwriting, same caution as SiteFooter.tsx last round — in case you've hand-edited either since the last deploy.

## Paste into Claude Code (or Cline) inside the propops8 folder

```
Read CLAUDE.md and AGENTS.md first. I've added new files under app/admin/lvn/{eon,lumen,isotherm} and components/admin/LabDetail.*, and there are replacement copies of app/admin/lvn/page.tsx and public/tools/recert/engine.html. Do the following and show me the diff before committing:

1. Diff the two replacement files against what's already live. app/admin/lvn/page.tsx only changes the three labUrl values and the LVN-03 node's data (name/location/season/role/tags/gates/note) — reapply by hand if the live file has moved on since this copy. public/tools/recert/engine.html only adds two <a> wrappers (header brand, footer brand) plus 3 lines of CSS for them — same deal.
2. Confirm the three new routes build: /admin/lvn/eon, /admin/lvn/lumen, /admin/lvn/isotherm.
3. Run `npm run build`, fix only errors caused by these files, commit on a new branch, deploy the same way as last time.
```

## Still open — not fixed in this package

**Admin login isn't landing on the launchpad.** You said logging into the backend goes straight to the ledger review page and nothing else — meaning either `<AdminLaunchpad />` never actually got rendered on `app/admin/page.tsx` in round 1, or (more likely, given `/admin/review` is a separate route from `/admin`) your login flow redirects straight to `/admin/review` and never lands on `/admin` at all, so the launchpad is never seen regardless of whether it's there. I can't fix this blind — send me `app/admin/page.tsx` and whatever sets the post-login redirect (likely `app/api/admin/login/route.ts`) and I'll pinpoint it. This is also almost certainly why Plate8 feels unreachable — its tile is already in the launchpad, it just isn't the page you land on.

## Notes carried over from round 1
- **Build status chips:** edit the `STEPS` list at the top of `app/tools/recert/page.tsx`.
- **Privacy:** confirmed — the engine's exports stay client-side, nothing sent to a server.
- **LVN buttons:** `boardUrl` for all three nodes is still `null` (disabled) — set it in `app/admin/lvn/page.tsx` when each node gets a site board to link to.
- **PDF packet filler** (`fill_packets.py` etc.) is still a separate offline tool, not part of the website. Its three flagged gaps (pre-signed manager signature, placeholder property info, single-person households only) still stand — see round-1 notes if you need the detail again.
