# AIM-OCULAR against canon

Two concept boards, received 11 Nov 2026 and registered as AIMV-101 (Ocular Intelligence OS) and AIMV-102 (DTLA Test Cell 01). Both are concept art: nothing on them is a site, a measurement or a result. This page records how they were checked against canon 1.13.0 with the design continuity check (GOV-31) and what has to change.

## Result

| Version | File | Call | Why |
|---|---|---|---|
| 1, as drawn | `data/aim-b5r/continuity/aim-ocular-v1.json` | **KILL** | Two rules no project approval can waive: the Tenant Eye tracks tenant behaviour and risk (GOV-29), and screens run across the historic upper façade (B5R-39). Behind those: 26 locked rules contradicted, 28 not addressed, 13 claims with no evidence. |
| 2, reframed | `data/aim-b5r/continuity/aim-ocular-v2.json` | DEFER, coverage complete | Answers all 62 rules that apply; 10 wait for a chosen Fresno building. Held only because the boards are illustrative, which never gives EXECUTE. Every change from version 1 is logged. |

```
npm run b5r -- continuity data/aim-b5r/continuity/aim-ocular-v1.json
npm run b5r -- continuity data/aim-b5r/continuity/aim-ocular-v2.json --baseline data/aim-b5r/continuity/aim-ocular-v1.json
```

Version 1 encodes only what the boards show or say; a rule the boards never touch is left out, and the check reports it as an omission. Version 2 drops robots and façade media from the scope (logged), so ROB-04, ROB-06, STU-05 and GOV-15 no longer apply to it.

## What already agrees with canon

- The lifecycle, Assess, Instrument, Model, Buy, Rehab, Rent, Recalibrate, Refinance, Repeat, is B5R-01 word for word.
- Observe, Verify, Decide, Measure follows the change workflow (GOV-03).
- Adaptive reuse as the default, keeping the original façade, masonry and window rhythm (B5R-18), with historic review required (B5R-37).
- The upgrade phasing, envelope and leak detection first and density options last, follows INF-01.
- The Site Eye (hazard, zoning, density, access) is the site work of B5R-11 and GOV-30.
- The Capital Eye fits as a view of the deterministic underwriting engine (GOV-14).
- Crestline as Lumen Labs is LET-01.
- The capital panel is already labelled "forecast, subject to validation", and the work orders carry a confidence column (B5R-19).

## What changes, element by element

| On the boards | Canon | Version 2 |
|---|---|---|
| Tenant Eye: occupancy, behaviour, risk, support, retention | GOV-29 (never waived), B5R-49 | **Service Eye**: work orders, response times, unit turns. Resident feedback is voluntary and aggregated; no tenant scores |
| Perception: micro-sensing of units, people, use | GOV-27, GOV-29 | Units and use only: leak, power and HVAC sensors. No sensing of people |
| Duality: people and culture (tenants, community, health) | B5R-46, GOV-29 | The three spatial rights, Darkness, Light and Spectrum. No reading of tenants' health |
| Building Eye with cameras first | GOV-27 | Sensors first. Cameras only in common areas, disclosed and minimally retained; none in units |
| Gold triangular screens across the historic upper façade | B5R-39 (never waived), B5R-37 | The historic street façade gets F0 repair only. F3 screens only on a non-historic elevation, on a free-standing frame with no anchors in masonry |
| LED eye screen and cyan light strips | B5R-41 (F7 disabled), B5R-48, STU-05 | Removed |
| Mural of the crowned trident figure on the building | B5R-46 (resident art is opt-in and resident-led) | Off the building; the figures themselves are on hold (owner, 11 Nov) |
| Eye in a pyramid as the AIM-B5R core mark | VIS-11, EDO-08 | The Voronoi AIM mark; renders labelled approximations until the VIS-09 vector exists |
| "AIM-B5R Artificial Intelligence Multifamily" | TRI-14 | Removed; the phrase joins `RETIRED_EXPANSIONS` |
| AIM (Intelligence), EDO (Reduction / Modularity), Genome (Adaptation) with a DNA helix | TRI-14, GOV-21, TRI-13, TRI-04 | No glosses; EDO keeps its Edo and Benin attribution; no DNA imagery for the genome |
| Triadic Ocular Engine: AIM, EDO and GENOME at 120 degrees, "balance, sync, growth" | TRI-03, TRI-06 | Removed: a fourth triad, and an untagged claim |
| Outcomes: NOI +15 to 45%, occupancy +5 to 15 points, opex −10 to 30%, capital velocity 1.5 to 3.0×, refinance probability 70 to 95%, asset health 80 to 98 | GOV-17, VIS-05, B5R-49 | Removed. Four hypotheses to measure, each tagged CONCEPTUAL. The Context & Dignity study's own base case loses money without verified savings (B5R-53) |
| "B5R 92" dial | GOV-01, GOV-17 | Removed |
| Live-looking statuses (riser, submeter, HVAC, elevator, network) and work orders | GOV-17, GOV-23, B5R-04 | Labelled MOCK, with no live-looking values; live monitoring waits for a real deal |
| Façade condition: fair, 2 leaks, 4 seals, "shade performance within target" | VIS-05, B5R-55 | Condition comes from a dated survey; "within target" removed |
| Before/after bars for energy, water and opex | B5R-42, B5R-23 | Removed; capital stays unknown until every line is priced |
| Digital twin (BIM) cutaway | B5R-04 | Deferred until a real deal, an evidence contract or a calibration need |
| DTLA Test Cell 01, number 408 | B5R-51, B5R-45, B5R-22, GOV-16 | The test cell moves to Fresno. DTLA stays desk research. 408 is a number in a render, not a site, and a test cell is never an employer's building |
| 29 Palms "Execute Sandbox" | LET-01, TRI-03, B5R-14 | Eon Labs, for physical testing. "Execute" is the decision call's word; Twentynine Palms has no verified lead |
| HB "Lifestyle Density" | B5R-12, B5R-52 | Stays a concept archetype, not a research market (owner, 11 Nov) |
| No Fresno or Kern in the locational examples | B5R-22, LET-02 | Transect (Kern and Fresno) added: it is where the pilots start |
| Sidewalk delivery robot | ROB-06, ROB-04 | Removed: robots stay bench-only |
| "Living Units" window with a furnished bedroom; "unit preview" | B5R-48 | Model or consented interiors only, never live units |
| "Active storefront" | B5R-33 | A leasing and building-information front, not retail |
| "ADA-compliant access" | VIS-05 | Step-free entry and an elevator are requirements; compliance is confirmed by review, not claimed |
| Rooftop terrace, garden and solar | INF-08, INF-05, B5R-40 | Roof load checked under FG2 first; solar is an option |
| "Healthier tenants and systems" | GOV-29 | Building systems only |
| Labels and text generated in the image ("TRI/ADIC", "SAMPLES" over "(EXAMPLES)") | GOV-23, VIS-08 | Labels on a separate vector layer |

## Owner decisions, 11 Nov 2026

1. **The lens figures: on hold.** The bearded "Odin", the one-eyed ogre, the eye in a pyramid and the crowned trident figure stay where they are until you decide. Two things hold either way. They stay off the building (B5R-46: resident art is opt-in and resident-led; version 2 already does this). And AIMV-101 stays a concept with no publication approval.
2. **The name stays: AIM-OCULAR, Ocular Intelligence OS.** GOV-27 still applies, so the copy says the building sees through measured data (sensors first), not through cameras.
3. **Huntington Beach stays a concept archetype.** It is not a research market, and B5R-12's five markets are unchanged.

## Files

- Boards: `docs/aim-b5r/visual-archive/image_register.csv`, rows AIMV-101 and AIMV-102. Image files are kept outside the repo, like the rest of the archive.
- Proposals: `data/aim-b5r/continuity/aim-ocular-v1.json` (as drawn) and `aim-ocular-v2.json` (reframed).
- Test: `tests/b5rContinuity.test.ts` ("AIM-OCULAR as drawn …").
