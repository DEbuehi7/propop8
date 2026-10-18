# AIM-B5R Research & Development segment

**Status: adopted 11 Oct 2026, at the owner's request** ("Add research as a
segment of AIM-B5R system because we will be doing ongoing research and
development"). This is documentation only: no code, tables or engine policy
change.

## Where it sits

The deal cycle is unchanged: Assess → Instrument → Model → Buy → Rehab → Rent
→ Recalibrate → Refinance → Repeat.

Research runs beside that cycle all the time, whether or not there is a deal in
progress. It feeds the cycle at fixed hand-off points, and it learns back from
actuals. It never skips a gate.

```
DEAL CYCLE   Assess → Instrument → Model → Buy → Rehab → Rent → Recalibrate → Refinance → Repeat
               ▲          ▲          ▲              ▲      ▲         ▲            ▲
               │          │          │              │      │         │            │
RESEARCH     Markets   Instruments Finance        Building tech     Finance (calibration
(always on)  & rules   & robotics  & models       & green rehab     from actuals, refi terms)
```

## Lanes

| Lane | Question it answers | Feeds | Namespaces |
|---|---|---|---|
| MKT Markets & rules | Which markets, rules, tariffs and sources hold today? | Assess; gates G0–G3 | B5R.PROPERTY, B5R.REGULATORY |
| FIN Finance & models | Do the engine, policy and stress tests give the right answer? | Model, Recalibrate, Refinance | B5R.FINANCE |
| BLD Building tech & green rehab | Which interventions pay off at the refinance and leave tenants ahead? | Rehab, Rent | B5R.OPERATIONS |
| INS Instruments & robotics | Which sensors, drones or robots improve a real decision? | Instrument | EDO.ROBOTICS, TRIADIC.SYSTEMS |
| DES Design & patterns | How AIM-B5R looks and explains itself | Presentation only, never evidence | EDO.PATTERN, TRIADIC.FORM |

Dance8 and STUTTR are adjacent projects with their own brands and media colour
rules. They are tracked in their own folders, outside AIM-B5R decisions.

## Stages

Every R&D item carries one of these stages.

| Stage | Means | Exit evidence | Typical claim status |
|---|---|---|---|
| R0 Idea | A question worth asking | Written question, owner, kill criteria, time or money cap | WORKING_HYPOTHESIS |
| R1 Sourced | Answered from sources | Claims rows. A second tool, or Claude opening the primary source, confirms each number | VERIFIED_* or UNVERIFIED |
| R2 Tested | Tested offline | Synthetic run or bench test that reproduces (seed, version, input hash), plus an independent rerun | CALCULATED |
| R3 Piloted | Tried on a real property or real data | Actuals logged against the predictions | Observed actuals |
| R4 Adopted | Part of AIM-B5R | Owner approval, plus a versioned policy or code change with a golden diff and tests | — |

An item can also leave any stage as **PARKED** (waiting on something named, with
a date) or **KILLED** (with the reason).

Every stage change is an EDO call:

- EXECUTE: advance to the next stage
- DEFER: park it, with a date
- ESCALATE: the owner decides
- KILL: stop it

## Rules

1. **Research never writes property facts.** A research finding reaches
   `property_evidence` only through the G0 evidence rules.
2. **Rows, not essays.** Every research run returns `research_runs` and
   `claims` rows, as in the Research-to-Dataset Plan.
3. **AI output starts at tier 4,** and every number needs two keys.
4. **Synthetic data only in R0–R2.** No tenant, resident or employer data at any
   stage.
5. **Every item gets a time or money cap at R0.** Hitting the cap forces an EDO
   call.
6. **R4 changes to the engine or policy** need a golden diff and owner
   approval, on a new branch.
7. **Hardware in the INS lane stays bench-only** until a property passes G0.
8. **Research the input that moves the result most first.** On the Fresno test
   deal that order is rent, operating costs, then rehab cost.

## Cadence

- **Weekly, 30 minutes:** R&D review. For each active item, record its stage,
  next step and EDO call.
- **Monthly:** recheck sources against the freshness policy.
- **Quarterly:** adopt or kill anything that hasn't moved.

## Register

Seeded 11 Oct 2026. Edit this table, or the CSV once `data/aim-dataset/` exists.

| ID | Lane | Item | Stage | Next step | Status |
|---|---|---|---|---|---|
| RD-001 | FIN | Fresno green-rehab stress test | R2 | Independent rerun of the repro pack | Active |
| RD-002 | BLD | Tenant solar credit under VNBT 15-minute netting | R2 (overlap assumed) | Interval load data from one real building | Active |
| RD-003 | BLD | Lean owner package (low-flow fixtures, leak shutoff, LED, 6 kW behind the meter) | R2 | Bills from the first real building (R3) | Active |
| RD-004 | BLD | Plug-in solar readiness (SB 868, from 1 Jan 2027) | R1 | Confirm outlet and mounting rules | Active |
| RD-005 | FIN | Fannie Mae Green Rewards at the refinance | R1 | Lender quote for a small loan | Active |
| RD-006 | MKT | Live recheck of all v0.1–v0.3 sources | R1 | Phase 1 audit | Active |
| RD-007 | MKT | Twentynine Palms and Crestline discovery | R1 | — | Parked: no qualifying 10–20 unit lead |
| RD-008 | MKT | Skid Row SRO preservation | R1 | Written employer clearance | Parked |
| RD-009 | INS | EDO-M0 camera-first rover | R1 (spec + 37 gate tests) | Owner H14 approval for bench work (G0 condition met: K1 PASS, PR #19) | Deferred |
| RD-010 | DES | ChronoLayer Color-Governed poster system v0.2 | R4 (design only) | Media legend on the Dance8/STUTTR sheets | Adopted |
| RD-011 | DES | EDO 3s M1 geometry benchmark: three lattice families vs matched baselines (canon TRI-05) | R0 | Freeze X1/X2/X3 meanings and the genotype schema | Parked: needs cap and kill criteria |
| RD-012 | DES | Guild Mesh multi-output proof: one genome as UI field, wall panel, robot tag and twin layer (EDO-12) | R0 | One seeded SVG render from the canon genome record | Parked: needs cap and kill criteria |
| RD-013 | BLD | Adaptive desert canopy / pavilion state model at Eon (TRI-08, TRI-12) | R0 | One parametric model that reconciles plan, section and motion | Parked: needs cap and kill criteria |
| RD-014 | INS | BloomWing AIM-T3, ground rover and scout first (MOB-01 to MOB-08) | R0 | Geometry contract and source-of-truth CAD | Parked: needs cap and kill criteria |
| RD-015 | INS | Robot-Ready Building section for the Audit Engine (P8O-05) | R0 | Owner decision; needs the audit golden diff | Parked: needs owner decision |

Rows RD-011 to RD-015 were added from the 18 Oct 2026 canon lock
(`docs/canon/README.md`); the canon IDs in brackets point to their entries.
