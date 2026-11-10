# AIM canon

**Status: current version in `lib/canon/index.ts` (see the change log below).**
First locked on 18 Oct 2026 at the owner's request ("make sure that
we have integrated all of this information into the PropOps8 and/or Dance8
system: hard coded, locked in and canonical").

The canon is the doctrine taken from the twenty AIM-B5R session studies the
owner uploaded on 18 Oct 2026, plus the Façade Intelligence System study he
made canon on 4 Nov 2026 and the Context & Dignity Engine study of 6 Nov 2026
(registered, its entries proposed), held as typed data in `lib/canon/` and locked by
`tests/canon.test.ts`. Every entry names the study and page it came from, its
status and where it lives in this repo. The full table is
[`REGISTER.md`](REGISTER.md) (generated; do not edit by hand).

## What is where

| File | Holds |
|---|---|
| `lib/canon/studies.ts` | The 22 studies: id, upload file key, title, dates, page count, the study's own status line |
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
- Façade Intelligence System audit, rules and what is still proposed: `docs/aim-b5r/FACADE_INTELLIGENCE.md`
- Context & Dignity Engine: fit with canon, conflicts, checked numbers and the atlas review: `docs/aim-b5r/CONTEXT_DIGNITY.md`
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
- **LET-03**: the Eon site is too small for BloomWing testing, which needs a different, larger site. (Its area was corrected in 1.9.0: about 0.26 acre, not 0.28.)
- **ROB-03**: EDO-I joins the agreed robot IDs; EDO-M is an alias of EDO-MI; EDO-H, EDO-C, EDO-W and EDO-S stay research names.
- **D8-13**: Dance8 deploys on its own Cloudflare account; its code stays here until then.
- **PL8-06 / PL8-08**: Plate leaves magenta; its accent is platinum white `#E8ECF5`.

## Decided by the owner (v1.2.0, 18 Oct 2026)

- **D8-16**: skaters play Kirtled. One trick per chord change: RA floor carve, LA kickflip sweep, KA handplant roll or 180/360, TI big ollie leap, a held chord a board-assisted freeze.

## Decided by the owner (v1.3.0, 19 Oct 2026)

- **D8-17**: the owner's filmed dance is read as Kirtled words: a stomp on a beat DO, travel of half a body-width within a bar RA, a level change without travel LA, a turn of 180 degrees or more KA, a jump TI, holding still for a beat FREEZE.
- **D8-18**: that dance styles the skaters without moving the tricks: turn picks the KA version, jump height the ollie size, the freeze the freeze pose, energy how many skaters, travel the carve direction.

## Decided by the owner (v1.4.0, 20 Oct 2026)

- **D8-09**: Kirtled performance mode exports one multitrack MIDI file: five music tracks (piano, bass, pads, lead, drums on CH1-4 and CH10) and a separate light-cue track (CH16). DASH is the name of FREEZE, not an alias of JUMP.

## Decided by the owner (v1.5.0, 1 Nov 2026)

- **TRI-13**: G.A.T.E.S. stands for Genome, AIM, Triadic, EDO, System. No other expansion is used.
- **VIS-11**: the official AIM logo is the design built from Voronoi triangular tessellations. Its vector file is still to make (VIS-09).
- **ST8-01** (still proposed): the audiobook lives wherever costs least. The recommendation in its note (the Late8 page, audio from a Cloudflare R2 bucket, never from git) awaits the owner's yes.

## Decided by the owner (v1.6.0, 2 Nov 2026)

- **PL8-09**: the Stuttr Spies audiobook plays on Late8, with its audio and manifest in Cloudflare R2, never in git. Only chapters marked approved with cleared rights are published (STU-02).

## Decided by the owner (v1.7.0, 4 Nov 2026)

The Façade Intelligence System study became canon after three revisions the owner asked for (B5R-38 to B5R-45, vocab `FIS_*`):

- **B5R-45**: the first façade pilot is in Fresno (Stage 1), on a residential building the owner controls or has written clearance for; never an employer's building.
- **B5R-39**: the mask rules are loosened. Finishes, panels and signs may sit beside a window, utility or access point (paint and signs beside exits and historic fabric) when 30% of the cell stays opaque wall. Nothing ever covers an exit or historic fabric.
- **B5R-43**: default weights are the owner's Fresno set: resident comfort 25, lifecycle value 20, energy 25, upkeep 15, context 10, adaptability 5.
- **B5R-38, -40, -41, -42, -44**: the governing rule and cells, the seven gates FG1-FG7, the flat-first catalogue F0-F7, the capital rules and the sealed decision contract, as built in `lib/b5r/facade/`.

## Decided by the owner (v1.9.0, 6 Nov 2026)

The Context & Dignity Engine study (the 22nd source, registered in 1.8.0):

- **GOV-29** locked: buildings, services and outcomes are evaluated, never people; no protected characteristic or proxy in eligibility, tenant scores or ad delivery; no identity inference, no live views of occupied units.
- **B5R-46 to B5R-50** locked: the three universal spatial rights (never racial types), the context layer with its gates and decision contract, flat-wall expression, measured outcomes, the staged pilot with stop conditions.
- **B5R-51** settled: the pilot starts in Fresno; DTLA is desk research only.
- **B5R-52** (concept), **B5R-53** and **B5R-54** (research) are unchanged.

And two changes after the owner's 29 Palms check:

- **LET-03** corrected: the Eon site is about 0.26 acre (150 x 75 ft, about 11,250 sq ft), not 0.28. It now holds the city's written rules: setbacks 25 / 15 / 10 ft, 40% coverage (about 4,500 sq ft of footprint), two parking spaces, one primary home, one ADU and one JADU. The height limit is still unknown.
- **GOV-30** added: every site program is checked against its lot before it goes into a study, spec or budget (`lib/b5r/site/envelope.ts`). The ChatGPT brief for canon work is [`CHATGPT_PROMPT.md`](CHATGPT_PROMPT.md).

## Decided by the owner (v1.10.0, 7 Nov 2026)

- **D8-19**: where a song departs slightly from its own rhythm, each CHOIR8 dancer chooses where to land: on the beat, with the music's hit, on the "and", or holding through a drop. Four flow rules hold every choice: the first count of a phrase is shared, half a count of room before the next beat, never two holds in a row, one count's landings within half a count. Choices are seeded and repeatable; `--variation` gives another set. Timing only: role expressions and the skaters' tricks (D8-16) are unchanged.

## Decided by the owner (v1.11.0, 10 Nov 2026)

After a check of fifteen Kirtled concept images (the visual system check of 10 Nov):

- **D8-20**: one six-move table for every image, page and prompt (`KIRTLED_MOVE_TABLE`): what each move does on the floor, on the instrument, for a dancer and a skater, the drum of the side it crosses, and its colour from the wordmark (DO and DASH teal; RA, LA, KA magenta; TI gold). Nothing in D8-06, D8-08, D8-09, D8-16 or D8-17 changes.
- **D8-21** (spec, conceptual): the instrument is three 120-degree arms, each a strip of eight triangles, one R/P cycle of the 24 triads per arm (`KIRTLED_ARMS`, `lib/dance8/harmony/arms.ts`). Button and toggle designs are not used.
- **D8-22**: the trio, EDO EDO BOY, NIKA NIKA and IARA IARA, are fictional roles holding the low, middle and top corners of one triangle, in teal, magenta and gold; their artist cards are the reference looks and "Meet the Trio V1" is retired; voices only from a private, approved voice map.
- **D8-23**: TIME AND SOUND is the typed title; "Time × Sound" is the logo lockup, "Time × Sound × Movement" the album with its dance, "Live Motion" the live show.
- **TRI-14**: AIM and EDO are never expanded in art or copy.
- **D8-10** unchanged: the all-gold wordmark in the concept art is recoloured to the rule.
- **D8-24** left open: who the seated Kirtled player is.

## Still open

P8O-08 recert price, P8O-09 L.E.T. page content, D8-24 the seated Kirtled player, B5R-31
revenue threshold, data sources and binding thresholds, STU-04 Stuttr storage
and rights, PL8-07 Plate8 public or
admin-only, PUR-02 Pure permissions, VIS-03 amber and green hex values, VIS-09
vector logos (AIM's design is chosen; the files are not made).

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
- 1.3.0, 2026-10-19: D8-17 (the owner's dance read as Kirtled words; built in `lib/dance8/moves/`) and D8-18 (that dance styles the skaters; not built yet) added, both approved by the owner.
- 1.3.1, 2026-10-19: D8-18 built in `lib/dance8/moves/skaters.ts` (no change to what the entry says).
- 1.4.0, 2026-10-20: D8-09 settled by the owner (five music tracks plus a light-cue track; DASH names FREEZE); `KIRTLED_MIDI_EXPORT` added and FREEZE given its name in `KIRTLED_MOVES`.
- 1.5.0, 2026-11-01: TRI-13 (G.A.T.E.S. expansion) and VIS-11 (official AIM logo) added, both decided by the owner; notes added to VIS-09 and ST8-01 (audiobook on the lowest-cost location, recommendation pending).
- 1.6.0, 2026-11-02: PL8-09 added (the audiobook on Late8 with audio in R2), decided by the owner and built; ST8-01's note updated.
- 1.7.0, 2026-11-04: the Façade Intelligence System study added as the 21st source; B5R-38 to B5R-45 and the `FIS_*` vocabulary added, decided by the owner (Fresno pilot, loosened masks, Fresno weights) and built in `lib/b5r/facade/` (engine aim-fis-flat-0.2.0).
- 1.7.1, 2026-11-04: GOV-18 built (`docs/PROJECT_STATE.md`, generated by `npm run state` and kept fresh by a test); GOV-19 points at the new pull-request check. No change to what any entry says.
- 1.8.0, 2026-11-06: the Context & Dignity Engine study added as the 22nd source, with GOV-29 and B5R-46 to B5R-50 proposed, B5R-51 a conflict (DTLA versus the Fresno pilot), B5R-52 a concept and B5R-53 and B5R-54 research. No LOCKED entry changed. B5R-53 is checked by `tests/b5rContext.test.ts` through `npvOf`, the façade NPV formula now exported from `lib/b5r/facade/capital.ts` (same results).
- 1.9.0, 2026-11-06: the owner locked GOV-29 and B5R-46 to B5R-50 and settled B5R-51 (Fresno first). LET-03 corrected (about 0.26 acre, not 0.28; the city's written rules added). GOV-30 added (site-fit check, built in `lib/b5r/site/envelope.ts`) with the ChatGPT brief `docs/canon/CHATGPT_PROMPT.md`.
- 1.10.0, 2026-11-07: D8-19 added and locked by the owner (beat feel and freedom of choice for the CHOIR8 dancers; built in `lib/dance8/motion/beatFeel.ts` and `lib/dance8/motion/landing.ts`). The detection thresholds stay tuning constants, outside canon.
- 1.11.0, 2026-11-10: D8-20 (the six-move table), D8-22 (the trio), D8-23 (album names) and TRI-14 (no AIM or EDO expansions) added and locked by the owner; D8-21 (the three-arm instrument, a conceptual spec, its arithmetic built in `lib/dance8/harmony/arms.ts`) added; D8-24 (the seated player) left open; a note on D8-10. No existing rule changed.
