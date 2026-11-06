# AIM-B5R Façade Intelligence System: FIS-Flat v0.2

Status: **canon (1.7.0, B5R-38 to B5R-45), built, synthetic data only.** v0.1
merged in PR #59; v0.2 holds the owner's revisions of 4 Nov 2026:
- the pilot is in Fresno;
- the mask rules are loosened;
- the default weights are the Fresno set;
- the system is canon.

Source: *AIM-B5R Façade Intelligence System Complete Study v1.0* (3 Nov
2026), a research draft that the owner made the 21st canon study.
The handoff pack sent again on 6 Nov 2026 (PDF, Word, Markdown manuscript,
implementation prompt and seven figures) changes nothing: its PDF's text is
identical to the canon source. The figures are AIMV-091 to 097 in the visual
archive; two are flagged there (figure 7 says G1-G7 where canon says FG1-FG7,
and figure 2's legend gives magenta a service meaning). The Context & Dignity
Engine study builds on this one: see [CONTEXT_DIGNITY.md](CONTEXT_DIGNITY.md).

Governing rule: **Program → Constraints → Performance → Geometry → Material
→ Expression.** Masks and seven hard gates run first. Preference scores run
after them and never change a call.

| | |
|---|---|
| Code | `lib/b5r/facade/` (pure, deterministic, no I/O, no AI) |
| Page | `/admin/b5r/facade`, behind the admin login (`proxy.ts`) |
| Tests | `tests/b5rFacade.test.ts` (16 tests) and the canon lock |
| Canon | B5R-38 to B5R-45; names and fixed values in `lib/canon/vocab.ts` (`FIS_*`) |
| Versions | engine `aim-fis-flat-0.2.0`, project schema `aim-fis-project-1`, decision contract `aim-fis-decision-1`, catalogue `fis-flat-catalogue-0.1` |
| Audited at | `main` @ `e8a43a9` (v0.1); revised from `cf30adb` (merge of PR #59) |

The build covers the study's own recommendation (section 20): P0 (audit)
and P1 (types, mask and gate rules, schematic grid, module catalogue) only,
on a labelled synthetic fixture. P2 to P5 stay proposed.

## 1. Compatibility audit (before → after this branch)

IMPLEMENTED = in code with tests. PARTIAL = some of it. ABSENT = not in the
repo. UNKNOWN = cannot tell from the repo.

| Study requirement | Before | After | Where / why |
|---|---|---|---|
| Repo audit with pinned commit (P0) | ABSENT | IMPLEMENTED | This file |
| FacadeProject, Source, Elevation, Cell, Mask, Module, Option, Gate, Decision contracts (12.1) | ABSENT | IMPLEMENTED | `contracts.ts`, `catalogue.ts`, `decision.ts` |
| FacadeAsset, FacadeMeasurement (12.1) | ABSENT | ABSENT (proposed) | Needs PropOps8 asset and work-order tables; none exist (migrations 001–011) |
| Twelve design drivers per cell, with source and state (3) | ABSENT | IMPLEMENTED | `DRIVERS`; per cell and per project; a driver nobody recorded shows `missing` |
| Protected masks: window, egress, utility, historic, maintenance access (steps 03–04) | PARTIAL (canon STU-05, INF-08, GOV-26 as rules in words) | IMPLEMENTED | `masks.ts` `MASK_RULES`, `canPlace`, `checkOption` |
| UNMEASURED / FIELD_OBSERVED / SURVEY_VERIFIED, NEEDS_SURVEY (12.1, step 04) | ABSENT | IMPLEMENTED | An unmeasured cell takes F0 only; attached modules need survey-verified cells before EXECUTE |
| F0–F7 catalogue, flat first, F7 disabled, F6 later pilot (5) | ABSENT | IMPLEMENTED | `catalogue.ts`; specification fields stay `null` until a product is chosen |
| Seven hard gates, PASS / FAIL / UNKNOWN / NOT_APPLICABLE with reason, date, source and reviewer (6) | ABSENT (dataset gates G0–G6 exist; only G0 is built) | IMPLEMENTED as FG1–FG7 | `gates.ts` |
| Critical UNKNOWN blocks; N/A must be justified (6) | ABSENT | IMPLEMENTED | Tests 6–8 |
| Gates before scores, non-compensatory (11.1) | PARTIAL (canon B5R-19 as a rule in words; engine `edoCall`) | IMPLEMENTED | An obstruction is a FAIL, so KILL, never a low score |
| C_total, B_optional, annual net benefit, NPV (11.2) | ABSENT | IMPLEMENTED | `capital.ts`; unknown is `null`, never 0 |
| Every figure carries estimate class, source, date, confidence, scope and assumptions (11.2, canon B5R-23) | PARTIAL (engine `Tri` has provenance and confidence) | IMPLEMENTED for façade lines | `CostLine`, `BenefitLine` |
| Board figures marked UNVERIFIED_VISUAL_PLACEHOLDER and kept out of models (11.3) | ABSENT | IMPLEMENTED | Excluded and listed with the reason |
| Editable weights summing to 100, who chose them, sensitivity test (11.1) | ABSENT | IMPLEMENTED | `score.ts`; each weight is moved ±5 to see whether the leader changes |
| EXECUTE / DEFER / ESCALATE / KILL (11.1) | IMPLEMENTED (`lib/b5r/engine.ts` `CallName`) | REUSED | Same names, same meaning |
| Evidence / State / Confidence states | IMPLEMENTED (Phase 1 `EvidenceState`, canon `EVIDENCE_AXES`) | REUSED | `propertyFactState`, `dataStatus`, `drawingStatus` |
| Versioned, immutable Decision Contract with a human reviewer (12.2) | PARTIAL (canon `B5R_DECISION_CONTRACT` for buy decisions; Phase 1 `needs_review`) | IMPLEMENTED | `aim-fis-decision-1`, SHA-256 of the canonical JSON, `humanReview.required: true` |
| Interactive 2D elevation; options cannot be dropped on blocked areas (14) | ABSENT | IMPLEMENTED | Refusals give the reason; keyboard works too |
| Viewpoints (10): elevation, 45° sidewalk, eye-level street, seated and standing resident, night, wall section | ABSENT | PARTIAL | All of these are built. The corridor view and the daylight / ventilation overlays are not: no model was run, so the page says "not modeled" |
| UI maturity states CONCEPT → INSTALLED (14) | ABSENT | PARTIAL | INSTALLED is never reached (no installed-asset records) |
| Three alternatives side by side, with the gate status and the call (14) | ABSENT | IMPLEMENTED | Option cards |
| Installed-asset screen (14, third screen) | ABSENT | ABSENT (proposed) | Waits for operational data |
| PropOps8 operations adapter, work orders (12.2) | ABSENT | ABSENT (proposed) | No asset tables. `auditEngine` `workOrderId` belongs to the ledger audit and is unrelated |
| Link to an AIM-B5R property | IMPLEMENTED (Phase 1 `property_uuid`) | PARTIAL | Optional link, checked against Phase 1 records when they are supplied (GOV-07). The page does not load Phase 1 records |
| Underwriting: cash required, exposure (12) | IMPLEMENTED (engine) | NOT CONNECTED, on purpose | The study says the FIS must not silently adjust refinance or value |
| Pure AI oversight (12) | PARTIAL (Pure is an outside Claude project; the vault shares only tier 0–1 lines) | UNCHANGED | No AI call in the FIS (GOV-14). The contract JSON is what Pure may explain |
| Database / production schema | n/a | NONE | No migration, no RLS change, no new table |
| Implementation prompt file `AIM_FIS_Claude_Implementation_Prompt_v1.md` (17) | UNKNOWN | UNKNOWN | Not attached to the request |

## 2. Contradictions found, and what was done

1. **Gate names collide.** The study's G1–G7 are not the dataset contract's
   G0–G6 (`docs/aim-dataset/CONTRACT.md`). The façade gates are FG1–FG7.
2. **Gate states differ.** The study uses PASS / FAIL / UNKNOWN / N/A; canon
   `gateOutcome` uses PASS / CONDITIONAL / HOLD / FAIL. Here UNKNOWN means
   HOLD. A recorded FAIL needs a named reviewer; without one it is held as
   UNKNOWN ("missing evidence is HOLD, never FAIL"). An obstruction the data
   itself shows (a panel over a window, a screen over a fire escape) is a
   FAIL for that option.
3. **Pilot site.** The study puts "an actual DTLA façade" first. Canon B5R-22
   makes Kern/Fresno Stage 1 and DTLA a reference district. **Settled by the
   owner on 4 Nov 2026: Fresno (B5R-45).** The pilot cannot be a current or
   former employer's building without written clearance (GOV-16).
4. **Room uses.** The study lists retail; B5R-33 keeps AIM-B5R residential
   only. Retail is not a room use here.
5. **Tiers.** The study's L0–L4 are not the canon `INTERVENTION_LADDER`.
   Each module carries both, and the ladder mapping is proposed, not canon.
   F0, F2, F3, F5 and F6 sit on "Envelope improvements"; F1, F4 and F7 on
   "Lighting / media retrofit".
6. **G.A.T.E.S.** TRI-13 fixes the expansion (Genome, AIM, Triadic, EDO,
   System). The study gives roles for four and leaves out System. The
   proposed reading:
   - Genome = module catalogue and its versions (a design grammar, TRI-04);
   - AIM = capital and evidence;
   - Triadic = optional pattern grammar (unused in v0.1; TRI-05 proofs first);
   - EDO = the call;
   - System = the decision contract and, later, operations.
7. **Scope gates.** Canon BUILD_PHASES phase 5 and B5R-27 hold speculative
   depth (digital-screen multifamily, Three.js-heavy views) behind revenue
   and ROI gates. This build stays inside them: 2D, admin-only, file-based,
   synthetic, F7 disabled, and no screens or lighting.
8. **Canon.** The study was not a canon source. **Settled by the owner on 4
   Nov 2026:** it is now the 21st, with B5R-38 to B5R-45 (canon 1.7.0).
   B5R-18 and B5R-19 are left as they were.
9. **FacadeGate scope.** The study's FacadeGate has no option field. Here a
   record can cover every option, or one option, which overrides it.

## 3. The rules as built

**Masks** (a cell is one bay on one floor). Since v0.2 a module either
**covers** the cell or sits **beside** what is protected in it:
- screens, fins and advanced modules (F3, F6, F7) sit in front of the whole
  cell, so they cover every mask in it;
- finishes, panels, signs and service doors (F1, F2, F4, F5) sit on the
  opaque wall and never cross a mask.

| Mask | May cover it | Covers only with a justification and a source | May sit beside it (it stays clear) | Gate that fails, and reviews |
|---|---|---|---|---|
| window | F0 | F3, on a resident-room or stair window; any other common-area window takes F3 without one | F1, F2, F4, F5 | FG4 (and FG3 for a panel) |
| egress (exit doors, fire escapes) | F0 | none | F1, F4 | FG1 |
| utility | F0, F5 | none | F1, F2, F4 | FG6 |
| maintenance access | F0, F5 | none | F1, F2, F4 | FG6 |
| historic fabric | F0 | none | F1, F4 | FG5 |

On top of the masks:
- a module beside a mask needs at least **30% of the cell left as opaque
  wall** (the exact union of the mask rectangles);
- that mask's gate must then review it, so the gate cannot be marked not
  applicable;
- an unmeasured cell takes F0 only (NEEDS SURVEY);
- F6 needs a survey-verified cell;
- F7 is disabled;
- F4 goes at street level or on an entry or service route;
- F5 goes only where there is a utility or inspection point to protect.

What v0.2 loosened, with the owner's approval of 4 Nov 2026:
- paint, panels and signs around windows, utilities and access points;
- paint and an address sign beside an exit door or below historic fabric;
- F3 on common-area windows without a justification.

What stays strict, because canon says so:
- nothing covers an exit (INF-08, GOV-26);
- nothing covers historic fabric;
- no panel crowds an exit or a fire escape's anchors.

**Gates.** Each gate's final state is the worse of the recorded review and
what the data shows. The order is FAIL > UNKNOWN > PASS or N/A.
- No record means UNKNOWN.
- PASS needs a named reviewer and a source that is not a concept image.
- N/A needs a written reason and a reviewer. It is never allowed on FG1 or
  FG7, on a gate a module in the option triggers, or on FG5 where there is
  historic fabric.
- Attached modules (F2–F7) on cells that are not survey-verified make FG2
  UNKNOWN.
- The capital model feeds FG7.

**Call.** In order of strength:
- KILL: any gate FAILs.
- ESCALATE: FG1, FG2 or FG3 is UNKNOWN, which needs a licensed professional.
- DEFER: any other UNKNOWN, a survey or catalogue rule is unmet, F6 is used,
  the project file has errors, or the data is SYNTHETIC or MOCK.
- EXECUTE: everything clears on real data. It means "take this option to
  licensed design, pricing and permits", never construction approval, and
  the named human review is still required.

**Capital.**
- One unpriced or unsourced line makes C_total unknown.
- An option must price access and contingency. With any new module it must
  also price design and permits, materials and install. Fabricated modules
  add fabrication, and occupied or unknown occupancy adds tenant disruption.
- The project's required repairs are carried by every option.
- FG7 FAILs when:
  - required work plus contingency exceed the approved budget; or
  - the optional scope exceeds B_optional (decoration displacing repair).
- Only verified, sourced energy, maintenance and NOI benefits count, and an
  NOI effect needs a stated causal chain. Known O&M costs always count.
- There is no rent, occupancy, cap-rate or value line at all.

## 4. Evidence / State / Confidence register

| Item | Evidence | State | Confidence |
|---|---|---|---|
| Rule engine behaviour | 16 tests, the canon lock and `npm run verify` | IMPLEMENTED (v0.1 merged in #59; v0.2 on its branch) | High for the rules as written |
| Page behaviour | Local `next dev`, 1366 px and iPhone 13: no horizontal scroll, no page errors; place, refuse, keyboard, views, gate record and contract download all exercised | IMPLEMENTED, not deployed | Medium (one browser engine) |
| Fixture building | Made up in `fixture.ts` | SYNTHETIC | n/a: it shows the software works, not how any building performs |
| Fixture prices and benefits | All `null` | UNPRICED | n/a |
| Fixture preference scores | Made-up values that exercise the scorer | SYNTHETIC | n/a |
| Mask and module rules (v0.2) | Study sections 3, 5 and 7; canon STU-05, INF-08, GOV-26; owner decision 4 Nov | CANON (B5R-39), loosened by the owner | Medium; an architect still checks them before the pilot |
| Default weights 25/20/25/15/10/5 | Owner's Fresno set, 4 Nov | CANON (B5R-43) | Owner-chosen; a design preference, not a measurement |
| Pilot geography | Owner decision, 4 Nov | CANON (B5R-45): Fresno | Decided; the building is not chosen |
| The study's design logic | The study's own summary | PROVISIONAL | Medium |
| Site-specific assembly compatibility | None | UNKNOWN | Low |
| California and LA code references (S1–S12) | Cited by the study, not rechecked here | SOURCE-CITED | Not verified in this work |
| Earlier board $/SF and % savings | Concept art | UNVERIFIED_VISUAL_PLACEHOLDER, excluded | Low |
| Implementation state in code | This audit | IMPLEMENTED for P0 and P1; P2–P5 ABSENT | High |
| Live deploy of #59 | Not visible from the build sandbox (no Netlify access) | UNKNOWN until the owner checks Netlify Deploys | n/a |

## 5. What needs a qualified professional (nothing here replaces them)

- **FG1 fire / life safety:** combustibility, flame propagation, egress and
  smoke. A licensed architect or fire-protection engineer, and the AHJ.
- **FG2 structure:** anchorage, wind and seismic loads, substrate capacity.
  A licensed structural engineer.
- **FG3 envelope:** drainage, flashing, air barrier, condensation. An
  envelope consultant or architect.
- **FG5 regulatory:** historic status (HPOZ or landmark), sign and mural
  rules, permits. Checked parcel by parcel with the city.
- **Energy compliance:** only the CEC-approved software counts; nothing here
  models energy.
- **Costs:** quantity takeoff and written bids.
- **The v0.2 mask rules:** they are canon and loosened, but an architect
  should still confirm them on the pilot building.

## 6. Still proposed (not built)

- P2 pilot site study.
- P3 physical mock-up.
- P4 portfolio rollout.
- P5 advanced expressions: curves, LED, kinetic and planted (F7).
- FacadeAsset and FacadeMeasurement records, and a PropOps8 work-order
  adapter. Each needs tables, RLS and a migration plan with its own decision.
- Storing façade projects in Supabase (today a project lives in a JSON file
  in the browser).
- Loading Phase 1 property records into the page so a link can be checked
  there.
- Daylight, glare, ventilation and energy overlays. Each needs a validated
  model.
- Feeding photo-screen opportunities (`lib/b5r/screen`) into a façade
  project.
- The G.A.T.E.S. reading in section 2, point 6. It is still only a
  proposal, not canon.

## 7. Recommended next Decision Contract

**FIS-P2-01: pick the Fresno pilot façade.** Call today: **DEFER** (no
building yet). The geography is settled (B5R-45).

Decide which building:
- a residential building in Fresno that the owner controls or has written
  clearance for;
- never a Hart District Management or SRO Housing building (GOV-16);
- preferably one of the Phase 1 Fresno leads (F1–F5), so the project links
  to a Phase 1 `property_uuid` that already exists.

Evidence needed before the next call:
- the Phase 1 identity (G0 PASS or CONDITIONAL);
- written permission for every photo and drawing;
- hashed field photos;
- a geometry state for every cell;
- occupancy;
- a condition survey that prices the required repairs;
- an approved budget with an approver;
- named FG1–FG3 reviewers.

Exit: the study's P2 deliverables:
- a verified survey;
- resident and street views;
- three comparable options;
- preliminary estimates, each either answered or explicitly escalated.

Still open for the owner:
- when façade projects need a database (a migration with RLS, decided on
  its own);
- whether the G.A.T.E.S. reading in section 2 becomes canon.

## 8. Using it

1. Open **Admin → Façade** (`/admin/b5r/facade`).
2. Pick an option tab, then a module, then click a cell. A protected cell
   refuses and gives the reason.
3. Record gate reviews in the gate table.
4. **Download decision contract** saves the sealed JSON.
5. **Download project file** saves your edits; **Load project file** opens
   one again.

Files never leave the browser.

To start a real project, copy the fixture's shape and then:
- use real sources (with `permission` and `sha256`) and real geometry states;
- set `dataStatus` to `LIVE`, and never mark it LIVE while it holds
  synthetic data.
