# AIM dataset contract — 0.1-draft (11 Oct 2026)

**Status: DRAFT research contract.** No Supabase tables, migrations or app code
depend on it yet. It writes down the shape that the AIM-B5R vault starters v0.1,
v0.2 and v0.3 already use; their ten templates are byte-identical across all
three versions. It also settles the vocabulary conflicts found in the Phase 0
audit.

Items marked **(D)** were decided by Claude on 11 Oct 2026, under the owner's
instruction to "use your best judgment". Each one is reversible: change the line
and add a change-log entry. Production use still needs separate owner approval
(see "Not decided here").

## Where the data lives

- Shared tables: `data/aim-dataset/<table>.csv`, with the header row exactly as
  shown below. The folder is not in the repo yet; the vault starter zips hold the
  templates.
- Each product keeps its private tables beside these, never in shared exports.
- These tables are append-only: `claims`, `conflicts`, `research_runs`,
  `property_evidence` and `decisions`. A correction is a new row, never an edit.

## The ten shared tables

| Table | Columns, in order |
|---|---|
| `sources` | source_id, publisher, title, url, tier, edition, coverage, limitations, checked_at, access_status, source_type, sha256 |
| `claims` | claim_id, namespace, domain, question_id, claim, value, unit, conditions, status, source_id, url, page_section, quote, published_date, checked_at, jurisdiction, tool, run_id, reviewer, notes |
| `conflicts` | conflict_id, claim_ids, reason, status, resolution, decided_by, opened_at, closed_at |
| `research_runs` | run_id, tool, prompt_id, date, operator, files_attached, output_files, rows_in, rows_rejected, status |
| `assets` | asset_id, asset_type, parent_id, name, namespace, status, county, jurisdiction, apn, privacy_class, notes |
| `property_evidence` | evidence_id, asset_id, field_key, value, unit, fact_state, claim_status, source_id, source_locator, observed_at, checked_at, valid_until, confidence, reviewer, notes |
| `decisions` | decision_id, subject_id, kind, outcome, rationale, evidence_snapshot, policy_version, model_version, reviewer, decided_at, review_date |
| `regulations` | rule_id, title, edition, status, jurisdiction, applies_to, scope_limits, approver_role, claim_ids, verified_at, effective_from, review_due |
| `documents` | doc_id, title, version, owner, status, supersedes, location, file_sha256, reviewed_at, notes |
| `images` | image_id, concept_id, flags, sha256, source_document, source_page, proof_level, notes |

The Phase 1 kit (`lib/b5r/phase1/`, `data/aim-b5r/phase1/`) remains the working
implementation of `sources` and `property_evidence` for the Kern/Fresno pilot.
The visual archive (`docs/aim-b5r/visual-archive/image_register.csv`) is the
working `images` table.

Proposed extensions that the vault starters carry are not part of this
contract until approved: `property_screenings`, `portfolio_snapshots`,
`financial_inputs`, `interventions`, `actuals`, `simulation_runs`,
`source_refresh`, and the v0.2/v0.3 market, lead, hazard and SRO registers.

## Allowed values

**`claims.status`:** VERIFIED_PRIMARY, VERIFIED_SECONDARY, CALCULATED,
WORKING_HYPOTHESIS, UNVERIFIED, CONTRADICTED, OBSOLETE.

**`property_evidence.fact_state`:** verified, provisional, conflicting, missing,
stale (the Phase 1 states).

**`sources.tier`:** one scale everywhere. **(D)**

| Tier | Meaning | v0.3 labels that map here |
|---|---|---|
| 1 | Law, adopted code, official record (recorder, assessor parcel record, planning approval) | T1_LAW, T1_OFFICIAL_AGENCY_GUIDANCE; T2_OFFICIAL_PORTAL when it is the assessor record used for parcel identity |
| 2 | Official dataset, map viewer or manufacturer manual (FEMA NFHL, CAL FIRE FHSZ, CGS EQ Zapp, utility service maps) | T1_OFFICIAL_MAP_PORTAL, T2_OFFICIAL_PORTAL (other uses), T2_OFFICIAL_UTILITY, T2_OFFICIAL_HISTORICAL, T2_OFFICIAL_DRAFT |
| 3 | Listing, news, review, case study | T3_LISTING, T3_NEWS |
| 4 | AIM concept material, design boards, images and any AI synthesis | (none) |

**`claims.namespace`:** **(D)**
EDO.PATTERN, EDO.ROBOTICS, EDO.DECISION, TRIADIC.FORM, TRIADIC.SYSTEMS,
B5R.PROPERTY, B5R.REGULATORY, B5R.FINANCE, B5R.OPERATIONS, PROPOPS8.PRODUCT,
PROPOPS8.MARKET, LET.SITE.

- This is the plan's ten plus v0.1's B5R.REGULATORY and B5R.OPERATIONS.
- v0.2's "market / strategy / portfolio / hazard / SRO" are `domain` values
  under B5R.PROPERTY or B5R.REGULATORY, not new namespaces.
- Robotics stays in EDO.ROBOTICS; there is no B5R.ROBOTICS.
- No validator checks namespaces today; the validator in K1 must.

**`assets.status`:** concept, candidate, owned, deployed, disposed.

**`decisions.kind` and `outcome`:**

- `gate`: PASS, CONDITIONAL, HOLD or FAIL.
- `edo`: EXECUTE, DEFER, ESCALATE or KILL.

**Markets (policy v0.2):** **(D)**

- KERN_BAKERSFIELD (06029)
- FRESNO_CITY (06019)
- SB_29PALMS (06071)
- SB_CRESTLINE (06071)
- LA_SKIDROW_SRO (06037)

The v0.1 Kern/Fresno-only scope stays in the record as history. Adding a market
needs a new owner approval.

**Lead classes:** **(D)**

- EXISTING_TARGET_MATCH
- ENTITLEMENT_CLAIM_UNVERIFIED
- UNENTITLED_DEVELOPMENT_RESEARCH
- OUTSIDE_TARGET
- CONVERSION_RESEARCH
- SRO_PRESERVATION_RESEARCH
- IDENTITY_UNRESOLVED

There are no outside-target exceptions. For example, 101 Desert Trail
(24 units claimed) stays OUTSIDE_TARGET on a watchlist.

## Gate set: AIM-B5R gates v0.2 (G0–G6) (D)

v0.1 defined G0–G5, and v0.2 renumbered and split them. v0.2 is adopted
because it covers the five-market scope. It also keeps infrastructure (sewer,
water, stormwater) and human approval as their own gates. v0.1's set stays in
the record as legacy.

| Gate | Question | Minimum proof | Built today | v0.1 equivalent |
|---|---|---|---|---|
| G0 Identity | Is this parcel real and in scope? | Official APN, county and city boundary, situs match | Phase 1 gate (`lib/b5r/phase1/gate.ts`) | G0 |
| G1 Entitlement and residents | Is the use legal, and who is protected? | Zoning, legal unit count, permits; for SROs, LAHD determination, RSO status and covenants | No | G1 |
| G2 Hazards and insurance | Is it insurable and safe? | FEMA, CGS and CAL FIRE parcel extracts; written insurance indication | No | Part of G2 |
| G3 Infrastructure | Can it be served? | Sewer will-serve or OWTS approval, water, stormwater | No | (none) |
| G4 Structure and capex | What will it really cost? | Licensed condition reports, written bids | No | Part of G2 and G4 |
| G5 Economics | Does it pencil on real inputs? | Rent roll or supported rents, lender terms, operating costs | Engine inputs and DSCR/LTV sizing | G3 and part of G4 |
| G6 Approval | Will the owner commit? | Signed buy, conditional, no-buy or hold, with reasons | Engine EDO call only, unsigned | G5 |

Rules that hold at every gate: **(D)**

- Missing evidence is HOLD, never FAIL. FAIL needs a documented, reviewed
  contradiction.
- An unknown threshold is HOLD, never zero.
- A missing insurance quote holds G2 and final underwriting.
- A missing sewer will-serve or OWTS approval holds G3.
- Hotel rooms are not dwelling units. Historic SRO room counts are not current
  habitable units.
- A 24-unit entitlement does not meet a 10–20 unit filter.
- Legal hard stops override any score.
- HOLD_SRO: no SRO scenario reaches the engine before its G1 resident evidence
  exists.

## Evidence rules

- VERIFIED_* needs `url`, `page_section`, `quote` and `checked_at`
  (YYYY-MM-DD). Tier 4 can never be VERIFIED_*. A user-supplied file (`U*`
  source) is never primary verification.
- No AI verifies its own claim. A VERIFIED_* row names a reviewer other than
  the tool that found it.
- Unknown means an empty `value` plus the reason in `notes`, never 0.
- Listing APNs stay provisional. Source APN strings are stored verbatim, for
  example `062-311-20-3/4/5`, and are never split or "repaired".
- Images and design boards are never evidence (`images.proof_level` = concept).
- Simulation output is never a property fact. It lives in `simulation_runs`,
  with model version, policy version, seed, draw count and input hash.
- No tenant, resident or recertification data enters shared tables, AI
  prompts or exports. Work data from the owner's employers never enters at all.

## Migrations (when approved)

- The next free migration number is **012**; 011 is taken by
  `011_admin_login_attempts.sql`. The Research-to-Dataset Plan's "011" is
  superseded.
- Follow `007_b5r_pipeline.sql`:
  - idempotent
  - RLS enabled with no policies (server key only)
  - append-only triggers on the append-only tables, blocking **UPDATE and
    DELETE** (007/008 currently block UPDATE only)
- Ship a rollback script and a dry run on a non-production database first.

## Not decided here (owner only)

- Financial thresholds. `b5r_default_v1` (DSCR 1.25, LTV 75%, cash left in
  25% at P50 and 50% at P90) stays a labelled default until approved.
- Any production migration, deploy or merge.
- Written clearance from current and former employers before any SRO outreach.
- Robotics hardware. EDO-M0 waits until at least one property passes G0; its
  ten `robot_*` tables are not part of this contract.

## Change log

- 0.1-draft, 2026-10-11: first version. Taken from the vault v0.1–v0.3
  templates, the Research-to-Dataset Plan v0.1 and the Phase 0 audit.
