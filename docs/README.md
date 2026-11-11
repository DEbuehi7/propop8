# Documents

Every document in this repository, by area. Start with **Current state**.
`tests/projectState.test.ts` fails when a new document is added without a
line here, so this list stays complete.

Status words:
- **Current:** kept up to date.
- **Reference:** stable background.
- **Generated:** made by code; do not edit by hand.
- **Archive:** a dated record, kept for history and no longer maintained.

## Current state

| Document | What it is | Status |
|---|---|---|
| [PROJECT_STATE.md](PROJECT_STATE.md) | Versions, routes and who can reach them, environment variable names, migrations, canon build status, pilot gates (GOV-18) | Generated (`npm run state`) |
| [../README.md](../README.md) | One-page map of the repo: what it is, how to run and check it | Current |
| [../CLAUDE.md](../CLAUDE.md) | Stop rules for every session | Current |
| [../AGENTS.md](../AGENTS.md) | Next.js version note for coding agents (written by `next dev`) | Generated |

## Canon (locked doctrine)

| Document | What it is | Status |
|---|---|---|
| [canon/README.md](canon/README.md) | What the canon is, decisions by version, what is still open, change log | Current |
| [canon/REGISTER.md](canon/REGISTER.md) | Every canon entry with its sources and where it lives | Generated (canon tests) |
| [canon/CHATGPT_PROMPT.md](canon/CHATGPT_PROMPT.md) | The brief to paste into ChatGPT for studies and canon updates, with the site-fit check | Current (checked by tests/b5rSite.test.ts) |

## AIM-B5R (real-estate intelligence)

| Document | What it is | Status |
|---|---|---|
| [aim-dataset/CONTRACT.md](aim-dataset/CONTRACT.md) | Dataset contract: tables, allowed values, gates G0–G6, evidence rules | Reference (draft contract) |
| [../data/aim-b5r/phase1/README.md](../data/aim-b5r/phase1/README.md) | Phase 1 identity kit for the Kern/Fresno pilot (G0) | Current |
| [aim-b5r/PHOTO_SCREEN.md](aim-b5r/PHOTO_SCREEN.md) | Photo screen: photos in, a first-look report out | Current |
| [aim-b5r/FACADE_INTELLIGENCE.md](aim-b5r/FACADE_INTELLIGENCE.md) | Façade Intelligence System: audit, rules, E/S/C register, next decision | Current |
| [aim-b5r/CONTEXT_DIGNITY.md](aim-b5r/CONTEXT_DIGNITY.md) | Context & Dignity Engine study: how it fits canon, conflicts, checked numbers, the Atlantic atlas review | Research (canon 1.8.0, proposed) |
| [aim-b5r/WEATHERING.md](aim-b5r/WEATHERING.md) | Weathering layer: shearing layers, the ISO 15686 factor method, condition grades, when work falls due | Current (canon B5R-55, locked 1.11.0) |
| [aim-b5r/DESIGN_CONTINUITY.md](aim-b5r/DESIGN_CONTINUITY.md) | Design continuity: every applicable canon rule answered, every change between versions logged | Current (canon GOV-31, locked 1.13.0) |
| [aim-b5r/AIM_OCULAR.md](aim-b5r/AIM_OCULAR.md) | The AIM-OCULAR boards checked against canon: as drawn (KILL) and reframed (complete) | Current (concept, AIMV-101 and 102) |
| [aim-b5r/RESEARCH.md](aim-b5r/RESEARCH.md) | The research and development segment | Reference |
| [aim-b5r/visual-archive/README.md](aim-b5r/visual-archive/README.md) | Concept image archive (never evidence) | Reference |
| [../aim-b5r-engine/README.md](../aim-b5r-engine/README.md) | Python reference engine and weekly data job | Reference |

## PropOps8 (audit and recert products)

| Document | What it is | Status |
|---|---|---|
| [../TALLY-SETUP.md](../TALLY-SETUP.md) | Tally form fields the code depends on | Current |
| [audit/PROPOPS8_PRODUCTION_AUDIT_2026-10-10.md](audit/PROPOPS8_PRODUCTION_AUDIT_2026-10-10.md) | Production audit of 10 Oct 2026 and its findings | Archive (findings tracked in security/README.md) |
| [../LINT-TODO.md](../LINT-TODO.md) | React-compiler lint decisions | Current |

## Security and data protection (Phase 0D)

| Document | What it is | Status |
|---|---|---|
| [security/README.md](security/README.md) | The Phase 0D gate checklist, findings and owner steps | Current |
| [security/ROLES.md](security/ROLES.md) | Who can do what | Current |
| [security/DATA_CLASSES.md](security/DATA_CLASSES.md) | Privacy class of every kind of data | Current |
| [security/VENDORS.md](security/VENDORS.md) | Vendors and subprocessors | Current |
| [security/INCIDENT_RUNBOOK.md](security/INCIDENT_RUNBOOK.md) | What to do when something goes wrong | Current |
| [security/RESTORE_TEST.md](security/RESTORE_TEST.md) | How to prove a backup restores, and the record | Current (never run yet) |
| [../vault/README.md](../vault/README.md) | AIM Vault: owner-only document storage, its own Supabase project | Reference |

## Plate8, Dance8, Stuttr, Late8 (media, kept apart from property data: GOV-15)

| Document | What it is | Status |
|---|---|---|
| [PLATE8_SPEC.md](PLATE8_SPEC.md) | Plate8 canonical spec | Reference |
| [DANCE8_SPEC.md](DANCE8_SPEC.md) | Dance8 motion spec | Reference |
| [DANCE8_REACTION_LAYER.md](DANCE8_REACTION_LAYER.md) | Dance8 visual reaction layer: Genome Loom, Algorithmic Cypher, Resonance Chamber overlays from Stuttr's feature track | Current (canon D8-25, SPEC) |
| [MEDIA_WORKFLOW.md](MEDIA_WORKFLOW.md) | Kling cards, zips, credits, CHOIR8, helper videos | Current |
| [MEDIA_VAULT.md](MEDIA_VAULT.md) | Read-only index over the private Stuttr library | Reference |
| [ALBUM_DESK.md](ALBUM_DESK.md) | Stuttr Album Desk: a Suno album in one command, holds, paid-voice plans, Kling clips, drafts | Current |
| [album-desk/BASELINE.md](album-desk/BASELINE.md) | What existed before the Album Desk, the canon check and the command inventory (10 Nov 2026) | Archive |
| [LATE8_AUDIOBOOK.md](LATE8_AUDIOBOOK.md) | Publishing the audiobook to R2 and Late8 | Current |

## Archive

Dated delivery notes from September and October 2026. They describe the
repo as it was then (for example `middleware.ts`, since renamed `proxy.ts`).

| Document | What it was |
|---|---|
| [archive/2026-09-29_admin-review-backend.md](archive/2026-09-29_admin-review-backend.md) | The old root README: first audit review backend |
| [archive/2026-09-29_calculators-v2.md](archive/2026-09-29_calculators-v2.md) | Diagnostic calculators v2 delivery |
| [archive/2026-09-29_infographics-page.md](archive/2026-09-29_infographics-page.md) | Infographics page delivery |
| [archive/2026-10_lvn-posters-round6.md](archive/2026-10_lvn-posters-round6.md) | L.E.T. poster round 6 install notes |
| [archive/2026-10-05_plate8-status.md](archive/2026-10-05_plate8-status.md) | Plate8 status, 5 Oct |
| [archive/2026-10-05_plate8-phase2-setup.md](archive/2026-10-05_plate8-phase2-setup.md) | Plate8 Supabase setup guide |
| [archive/2026-10-05_plate8-phase2c-monitoring.md](archive/2026-10-05_plate8-phase2c-monitoring.md) | Plate8 Phase 2C monitoring plan |
| [archive/2026-10-16_handoff-notes.md](archive/2026-10-16_handoff-notes.md) | Session handoff, 16 Oct (later handoffs are Claude Docs) |

Data outputs (`data/aim-b5r/phase1/out/`) are records, not documents, and are not listed here.
