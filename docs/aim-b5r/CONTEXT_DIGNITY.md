# AIM-B5R Context & Dignity Engine (study v1.0, 6 Nov 2026)

Status: **research, registered as the 22nd canon study (canon 1.8.0). Its
entries are proposed and wait for the owner.** Nothing here is built except
one test that re-runs the study's numbers.

The study's rule, in its own words: *design for dignity as a universal
property; evaluate measurable assets and services rather than profiling
people.* It treats a building as a geographic, social and operating system,
and asks three things of every site: why the place matters (history), how it
feels to live there (human experience) and what improves at what cost
(investment).

| Canon entry | Status | What it says |
|---|---|---|
| GOV-29 | PROPOSED (recommended for LOCKED) | Buildings, services and outcomes are evaluated, never people. No protected characteristic or proxy is used in eligibility, tenant scores or ad delivery |
| B5R-46 | PROPOSED | Three universal spatial rights: Darkness (privacy, control), Light (clarity, legibility), Spectrum (flexible, plural space). They are design metaphors, never racial types |
| B5R-47 | PROPOSED | The engine is a context layer with eight hard gates and a decision contract; it never replaces engineering, underwriting or human approval |
| B5R-48 | PROPOSED | Flat-wall expression first; LED and moiré only when power and upkeep justify them; storefront windows show model interiors only |
| B5R-49 | PROPOSED | Outcomes are measured against a baseline; resident measures are opt-in and kept apart from building and value measures |
| B5R-50 | PROPOSED | A staged pilot (LOD-0 to LOD-3) with stop conditions |
| B5R-51 | CONFLICT | The study starts in DTLA; canon starts in Fresno |
| B5R-52 | CONCEPT | The four site archetypes |
| B5R-53 | RESEARCH (built: a test) | The hypothetical underwriting page, re-run |
| B5R-54 | RESEARCH | The Atlantic Relationship Atlas is context, never an input |

## Sources

None of these files is committed, the same as the other studies and the
archive's images. Check a copy against its SHA-256.

| File (upload key) | What it is | SHA-256 (first 12) |
|---|---|---|
| `AIM_B5R_Design_Strategy_Mobile.pdf` (75bf0861; also in 89f99d7e) | The study: 15 pages, "Design research v1.0", strategy and concept, OpenAI-assisted | 2a0b88f7ed61 |
| `AIM_B5R_Design_Concepts.png` (1f78c4ac; also in 89f99d7e) | The four-site board | AIMV-090 in the visual archive |
| `Atlantic_Relationship_Atlas_1450-2026.html` (07447d89) | The interactive atlas the study names as its historical context | ed29ec844daf |
| `AIM_FIS_Complete_Report_Claude_Handoff_v1.zip` (c961aa72) | The façade study pack, sent again: its PDF's text is identical to the canon source (`facade-fis`); its seven figures are AIMV-091 to 097 | 344d1268549a |

## How it fits what is already here

| The study asks for | Already in canon or code | Now |
|---|---|---|
| Lifecycle Assess, Instrument, Model, Buy, Rehab, Rent, Recalibrate, Refinance, Repeat (p3) | `B5R_LIFECYCLE`, the same nine steps | Matches |
| Evidence / State / Confidence with source, timestamp, scale and uncertainty (p3) | `EVIDENCE_AXES`, Phase 1 evidence states | Reused; no new states |
| Hard gates: fair housing, preservation, accessibility, fire and life safety, privacy, budget, resident choice, conflict of interest (p3) | Façade gates FG1-FG7 (B5R-40) cover fire and life safety, structure, envelope, habitability, regulatory and historic context, operations and capital | B5R-47. Fair housing, privacy, resident choice and conflict of interest have no gate yet |
| A decision contract for every recommendation (p3) | The buy contract (`B5R_DECISION_CONTRACT`) and the sealed façade contract (B5R-44) | B5R-47 adds protected-data exclusions and stop conditions |
| No resident profiling; data not collected (p10, p11) | GOV-27 (sensors before cameras), LET-05 (no guest surveillance) | GOV-29 |
| Flat-wall kit before exotic geometry (p5) | F0-F7, F7 disabled (B5R-41) | B5R-48 |
| Baselines, cohorts, DOE M&V (p13) | Façade monitoring is proposed, not built (FACADE_INTELLIGENCE.md, section 6) | B5R-49 |
| Staged pilot with no-go gates (p14) | Stage 1 is Kern/Fresno (B5R-22); the façade pilot is in Fresno (B5R-45) | B5R-50, with the start place as conflict B5R-51 |
| Four site archetypes (p6-9) | The façade study's figure 6 shows the same four places | B5R-52 |

## Contradictions, and how they are held

1. **Where the pilot starts.** The study starts with a DTLA evidence inventory
   and a DTLA building or storefront test (p6, p14). Canon starts in Fresno,
   on a building the owner controls or has written clearance for, never an
   employer's (B5R-45, GOV-16). Recorded as conflict **B5R-51**; until the
   owner decides, the Fresno rule stands and DTLA is desk research at most.
2. **"Automate building decisions" (p11).** Canon GOV-14 says calculations are
   deterministic and AI explains, never decides. B5R-47 is written that way:
   deterministic rules compute, software explains and escalates, a named
   person approves.
3. **Cap-rate value lines (p12).** The study capitalizes NOI at 6% as a
   "gross value sensitivity". Façade capital has no value line (B5R-42), so
   these stay research (B5R-53).
4. **Twentynine Palms.** A desert test node for modular forms here (p9); "new
   construction" on the façade study's figure 6 (AIMV-096). Noted in the
   archive.
5. **The metaphors.** Darkness, Light and Spectrum are offered to every
   resident. The study itself says they are not racial personality types and
   that no race has a unique psychological ability (p2, p4, p15). B5R-46 keeps
   that sentence, and GOV-29 keeps any identity inference out of the system.

## The numbers, checked

Page 12 is hypothetical: a 30-unit building and $60,000 of design capex, ten
years at 8%, no terminal value. `npvOf` in `lib/b5r/facade/capital.ts` (the
façade NPV formula, now shared) reproduces every figure on the page, and
`tests/b5rContext.test.ts` keeps them, and canon B5R-53, in step.

| Scenario | Avoided turns x $/turn | Utilities | Program cost | Annual NOI | 10-year NPV at 8% | NOI at a 6% cap |
|---|---|---|---|---|---|---|
| Conservative | 0 x $0 | $1,500 | $2,500 | -$1,000 | -$66,710 | -$16,667 |
| Base | 2 x $3,000 | $3,000 | $2,000 | $7,000 | -$13,029 | $116,667 |
| Upside | 3 x $3,500 | $5,000 | $2,500 | $13,000 | $27,231 | $216,667 |

What it means: $60,000 needs about **$8,942 a year** of verified net benefit
to break even over ten years at 8% (the base case gives $7,000). The study
draws the same conclusion: the investment needs verified savings, a longer
horizon or other defensible benefits.

## The Atlantic Relationship Atlas, reviewed

An interactive page (1450-2026): pick two historical populations, a
relationship lens and a year, and it draws schematic routes (forced passage,
colonial movement, diaspora, resistance, Indigenous dispossession, kinship)
with notes and eight linked sources. It says its lines carry no volumes,
its group labels are social categories and not biological types, and
coercion is never shown as consent.

Checked against its own sources: about 12.5 million Africans embarked and
10.7 million survived the crossing; under 4% landed in mainland North America,
so its "about 95% in the Caribbean and South America" holds. The dates are
right: Haitian Revolution 1791 and independence 1804, the British Act of 1833
in force in 1834 with apprenticeship to 1838, French abolition 1848, the 13th
Amendment 1865, Brazil's Lei Áurea on 13 May 1888, Windrush 1948 and Loving v.
Virginia 1967.

**One fix for version 2:** the "internal U.S. forced migration" route starts
at a "U.S. North" node. The domestic slave trade ran mainly from the Upper
South (Virginia, Maryland) to the Deep South; that route's origin should be an
Upper South node.

How it is used (B5R-54): as context for place-based design and history panels.
Nothing from it reaches eligibility, tenant scores, ad delivery or any
resident record. It is not committed to this public repo.

## What was not done

- No context-engine code: no new gates, no resident feedback collection, no
  sensors, no DTLA work.
- Nothing is locked. All ten entries are proposed, conflict, concept or
  research.
- The atlas and the study PDF stay out of the repo.

## The owner's decisions

1. **GOV-29**: lock it. Recommended: fair-housing law already requires it.
2. **B5R-51**: keep Fresno first (recommended) and treat DTLA as desk research,
   or name a DTLA building you control or have written clearance for.
3. **B5R-46 to B5R-50**: lock them as a set, or keep them proposed until the
   Fresno pilot needs them.
