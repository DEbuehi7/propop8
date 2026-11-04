# AIM-B5R Façade Intelligence System: FIS-Flat v0.1

Status: **built on a feature branch, synthetic data only, not deployed.**

Source: *AIM-B5R Façade Intelligence System Complete Study v1.0* (3 Nov
2026). The study calls itself a research draft, and it is not one of the 20
canon studies, so this work adds no canon entry and changes no LOCKED rule.

Governing rule: **Program → Constraints → Performance → Geometry → Material
→ Expression.** Masks and seven hard gates run first. Preference scores run
after them and never change a call.

| | |
|---|---|
| Code | `lib/b5r/facade/` (pure, deterministic, no I/O, no AI) |
| Page | `/admin/b5r/facade`, behind the admin login (`proxy.ts`) |
| Tests | `tests/b5rFacade.test.ts` (15 tests) |
| Versions | engine `aim-fis-flat-0.1.0`, project schema `aim-fis-project-1`, decision contract `aim-fis-decision-1`, catalogue `fis-flat-catalogue-0.1` |
| Audited at | `main` @ `e8a43a9` (merge of PR #58), branch `feat/b5r-facade-fis` |

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
   makes Kern/Fresno Stage 1 and DTLA a reference district. **Owner
   decision.** Whatever is chosen, the pilot cannot be a current or former
   employer's building without written clearance (GOV-16).
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
8. **Not canon.** The study is not a canon source, so B5R-19 and B5R-18 keep
   their `impl` status. Pointing them at this code needs a `CANON_VERSION`
   bump with the owner's approval.
9. **FacadeGate scope.** The study's FacadeGate has no option field. Here a
   record can cover every option, or one option, which overrides it.

## 3. The rules as built

**Masks** (a cell is one bay on one floor):

| Mask | Allowed | Allowed only with a written justification and a source | Fails |
|---|---|---|---|
| window | F0 | F3 | FG4 |
| egress (exit doors, fire escapes) | F0 | none | FG1 |
| utility | F0, F5 | none | FG6 |
| maintenance access | F0, F5 | none | FG6 |
| historic fabric | F0 | none | FG5 |

On top of the masks:
- an unmeasured cell takes F0 only (NEEDS SURVEY);
- F6 needs a survey-verified cell;
- F7 is disabled;
- F4 goes at street level or on an entry or service route;
- F5 goes only where there is a utility or inspection point to protect.

These rules are deliberately conservative; for example, F1 paint never
goes on a window cell. That is one of the owner decisions below.

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
| Rule engine behaviour | 15 tests; `npm run verify` | IMPLEMENTED on the branch, not merged | High for the rules as written |
| Page behaviour | Local `next dev`, 1366 px and iPhone 13: no horizontal scroll, no page errors; place, refuse, keyboard, views, gate record and contract download all exercised | IMPLEMENTED, not deployed | Medium (one browser engine) |
| Fixture building | Made up in `fixture.ts` | SYNTHETIC | n/a: it shows the software works, not how any building performs |
| Fixture prices and benefits | All `null` | UNPRICED | n/a |
| Fixture preference scores | Made-up values that exercise the scorer | SYNTHETIC | n/a |
| Mask and module rules | Study sections 3, 5 and 7; canon STU-05, INF-08, GOV-26 | PROVISIONAL (conservative) | Medium; needs owner and architect review |
| Default weights 25/25/20/15/10/5 | Study 11.1 | PROVISIONAL, "chosen by: study defaults" | Owner to confirm |
| The study's design logic | The study's own summary | PROVISIONAL | Medium |
| Site-specific assembly compatibility | None | UNKNOWN | Low |
| California and LA code references (S1–S12) | Cited by the study, not rechecked here | SOURCE-CITED | Not verified in this work |
| Earlier board $/SF and % savings | Concept art | UNVERIFIED_VISUAL_PLACEHOLDER, excluded | Low |
| Implementation state in code | This audit | IMPLEMENTED for P0 and P1; P2–P5 ABSENT | High |

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
- **The mask rules themselves:** an architect should confirm them before a
  real pilot.

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
- Canon entries for the FIS. These need the study added as a canon source,
  owner approval and a version bump.

## 7. Recommended next Decision Contract

**FIS-P2-01: pick the pilot façade.** Call today: **DEFER** (there is no
site).

Decide:
1. Where the pilot goes:
   - a building in the Stage 1 geography (Kern/Fresno, B5R-22); or
   - DTLA, with a recorded owner exception to B5R-22.
2. Which building: one the owner controls or has written clearance for,
   and never a Hart District Management or SRO Housing building (GOV-16).

Evidence needed before the next call:
- The property identity: a Phase 1 `property_uuid`, or a new identity
  record.
- Written permission for every photo and drawing.
- Hashed field photos.
- A geometry state for every cell.
- Occupancy.
- A condition survey that prices the required repairs.
- An approved budget with an approver.
- Named FG1–FG3 reviewers.

Exit: the study's P2 deliverables:
- a verified survey;
- resident and street views;
- three comparable options;
- preliminary estimates, each either answered or explicitly escalated.

Owner decisions that ride with it:
1. Confirm or loosen the conservative mask rules (for example, paint
   around a window).
2. Confirm the default weights.
3. Whether the FIS becomes canon (a version bump).
4. When façade projects need a database.

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
