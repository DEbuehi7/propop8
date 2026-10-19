# AIM canon

**Status: v1.0.0, locked 18 Oct 2026, at the owner's request** ("make sure that
we have integrated all of this information into the PropOps8 and/or Dance8
system: hard coded, locked in and canonical").

The canon is the doctrine taken from the twenty AIM-B5R session studies the
owner uploaded on 18 Oct 2026, held as typed data in `lib/canon/` and locked by
`tests/canon.test.ts`. Every entry names the study and page it came from, its
status and where it lives in this repo. The full table is
[`REGISTER.md`](REGISTER.md) (generated; do not edit by hand).

## What is where

| File | Holds |
|---|---|
| `lib/canon/studies.ts` | The 20 studies: id, upload file key, title, dates, page count, the study's own status line |
| `lib/canon/register.ts` | 180-plus entries: rules, specs, research, concepts, conflicts and open questions, each with sources |
| `lib/canon/vocab.ts` | Canonical names and fixed values: EDO genes, families, scales and densities; triadic seed; namespaces; palette and semantic states; evidence axes; build phases; B5R cycle, decision contract and software gates; infrastructure systems; L.E.T. nodes; robot IDs; Plate8 shell; clocks; Kirtled vocabulary |
| `lib/canon/rules.ts` | The checks the studies asked to be executable: triadic seed test, EDO genome record check, music-to-frame sync grid |
| `lib/canon/report.ts` | Renders `REGISTER.md` |
| `tests/canon.test.ts` | Structure tests and the SHA-256 lock (`tests/fixtures/canon_lock.json`) |
| `tests/dance8/kirtledCanon.test.ts` | The Kirtled study's canonical example run through the built solver |
| `docs/aim-b5r/infrastructure_register.csv` | The infrastructure option register (INF-02) |

Canon that already had a home stays there; the register points to it rather
than copying it:

- AIM-B5R gates, markets, namespaces, evidence rules, HOLD_SRO: `docs/aim-dataset/CONTRACT.md`
- R&D lanes, stages and register: `docs/aim-b5r/RESEARCH.md`
- Phase 1 identity gate and the ten-property pilot: `lib/b5r/phase1/`, `data/aim-b5r/phase1/`
- Visual archive and colour rule: `docs/aim-b5r/visual-archive/`
- Kirtled song-following solver: `lib/dance8/harmony/`, `lib/dance8/contracts/harmony.ts`
- Stuttr song library: `lib/stuttr/`
- Dance8 cue map, cut planner and render: `lib/dance8/`, `docs/DANCE8_SPEC.md`
- Plate8 colours and pages: `docs/PLATE8_SPEC.md`

## Status meanings

- **LOCKED**: a rule the studies call canonical, locked, core or non-negotiable. It changes only with the owner's approval.
- **SPEC**: the agreed shape of something to build later, behind its phase gate.
- **PROPOSED**: waiting for the owner's decision.
- **RESEARCH**: kept as research; never an underwriting or product input.
- **CONCEPT**: fiction, brand or visual concept archive; never evidence.
- **OPEN**: a decision only the owner can make.
- **CONFLICT**: two sources disagree; the owner picks one.

`impl` says whether it is built, partly built, not built, a rule with nothing to
build (`n/a`), or not checked against the code in this pass (`unchecked`).

## Changing canon

1. Edit the entry, vocabulary or study record in `lib/canon/`.
2. Bump `CANON_VERSION` in `lib/canon/index.ts` and add a change-log line below.
3. Run `UPDATE_GOLDEN=1 npm test` to regenerate the lock and `REGISTER.md`.
4. Commit all of it together on a branch and open a PR. A LOCKED change needs the owner's approval in the PR.

Never regenerate the lock just to make a failing test pass.

## Decided by the owner (v1.1.0, 18 Oct 2026)

All seven v1.0.0 conflicts are settled:

- **B5R-22**: Stage 1 geography is Kern/Fresno.
- **B5R-33**: AIM-B5R stays residential-only; the mixed-use studies stay concepts.
- **LET-02**: Fresno is part of Transect; L.E.T. stays three nodes.
- **LET-03**: the Eon site is about 0.28 acre, so BloomWing testing needs a different, larger site.
- **ROB-03**: EDO-I joins the agreed robot IDs; EDO-M is an alias of EDO-MI; EDO-H, EDO-C, EDO-W and EDO-S stay research names.
- **D8-13**: Dance8 deploys on its own Cloudflare account; its code stays here until then.
- **PL8-06 / PL8-08**: Plate leaves magenta; its accent is platinum white `#E8ECF5`.

## Decided by the owner (v1.2.0, 18 Oct 2026)

- **D8-16**: skaters play Kirtled. One trick per chord change: RA floor carve, LA kickflip sweep, KA handplant roll or 180/360, TI big ollie leap, a held chord a board-assisted freeze.

## Still open

P8O-08 recert price, P8O-09 L.E.T. page content, B5R-31
revenue threshold, data sources and binding thresholds, D8-09 Kirtled export
and the DASH label, STU-04 Stuttr storage and rights, PL8-07 Plate8 public or
admin-only, PUR-02 Pure permissions, VIS-03 amber and green hex values, VIS-09
vector logos.

Also worth knowing: the contract and engine use `edo` / `edo_call` for the
EXECUTE/DEFER/ESCALATE/KILL decision, while the reliability study asks that
decision states be named explicitly rather than as "EDO" (TRI-03, vocab
`EDO_MEANINGS`). Renaming touches migration 007 and the engine, so it is left
for the owner. And K1 has passed G0 (PR #19), which meets the bench-only
condition for robotics hardware; EDO-M0 still waits on the H14 approval.

## Change log

- 1.0.0, 2026-10-18: first lock. 20 studies; entries, vocabularies, rules and tests added; infrastructure register committed; Kirtled canonical example pinned against the solver.
- 1.1.0, 2026-10-18: the owner settled all seven conflicts (B5R-22, B5R-33, LET-02, LET-03, ROB-03, D8-13, PL8-06); EDO-I added to the robot IDs with the EDO-M alias; Plate's accent set to platinum white (PL8-08); GOV-28 (retention enforced by code) added; the Phase 0D security entries point at `docs/security/`.
- 1.2.0, 2026-10-18: D8-16 added (skaters play Kirtled: the owner approved the trick for each move word); built in `lib/dance8/harmony/skateTricks.ts`.
