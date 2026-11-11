# Design continuity

A design proposal for an AIM-B5R building has to answer every canon rule that applies to it, and a new version of a proposal has to say what changed. This check does both, in code, with no AI and no network. It answers the "Design Continuity Engine" note of 10 Nov 2026 and is canon GOV-31: a coverage report for every proposal and a gate that fails on a missing rule or an unapproved change.

Code: `lib/b5r/continuity/`. Tests: `tests/b5rContinuity.test.ts`. Examples: `data/aim-b5r/continuity/` (synthetic).

## Run it

```
npm run b5r -- continuity data/aim-b5r/continuity/example-v1.json
npm run b5r -- continuity data/aim-b5r/continuity/example-v2-drifted.json --baseline data/aim-b5r/continuity/example-v1.json
npm run b5r -- continuity-starter --scope facade,imagery --id my-facade --out my-facade-v1.json
```

The first prints a report for a complete synthetic proposal (DEFER, only because it is synthetic). The second shows what drift looks like: version 2 drops the egress rule, swaps paint for a disabled LED mesh, changes the screen's open area without logging it, modifies the locked score weights without approval, adds an untagged 40% energy claim, and removes a cornice with no evidence or approval. The call is ESCALATE. The third writes a version 1 with every required item for the scope listed as UNRESOLVED, ready to fill in.

Options for `continuity`: `--out <folder>` writes `<id>-v<version>.continuity.json` (sealed) and `.md`; `--json` prints the JSON; `--strict` exits 1 unless the coverage is complete, for CI.

## What a proposal says

A proposal is a JSON file (`aim-design-proposal-1`) with an id, a version number, the canon version the author worked from, its data status, and a scope: one or more of `existing_building`, `landmark`, `site`, `facade`, `weathering`, `context_dignity`, `building_intelligence`, `robot_ready`, `pattern`, `triadic`, `imagery`, `media_overlay`, `costed`. Façade and landmark work bring the existing-building rules with them.

Every rule that applies gets one line with a decision and a reason:

| Decision | Means | Also needs |
|---|---|---|
| INCLUDED | The design meets it | How, in the reason |
| MODIFIED | Met differently | An approval if the rule is LOCKED |
| DEFERRED | Answered later | `until`: the stage, survey or date it waits for |
| EXCLUDED | Not met | An approval if the rule is LOCKED |
| UNRESOLVED | Not decided yet | Nothing; it holds the call |

A line can also carry `detail` (what the design does with the rule; a change here between versions is a substitution). Façade modules are lines too (`FIS:F0` to `FIS:F7`), and every façade proposal answers `FIS:F0`, the repair baseline. Claims carry a proof tag (TRI-06) and, above CONCEPTUAL, a source. Irreversible decisions carry evidence and an approval. Approvals name who, a YYYY-MM-DD date, and where the decision is recorded.

Which rules apply is set in `lib/b5r/continuity/map.ts`: LOCKED entries are required, other entries are shown as advisory. Every LOCKED entry in the governance, AIM-B5R, infrastructure, EDO pattern and visual domains is either mapped to a scope or listed there as not a design input with a reason, and the test fails when a new locked rule is neither. So a new canon rule cannot be skipped without someone deciding to skip it.

## The calls

The check uses the EDO.DECISION words (no new vocabulary, TRI-03). The worst finding sets the call.

| Call | When |
|---|---|
| KILL | A rule no project approval can waive is modified or excluded: GOV-15, GOV-16, GOV-26, GOV-29, INF-08, B5R-33, B5R-39, B5R-40, ROB-04 |
| ESCALATE | A locked rule is modified or excluded without approval, or changed since an approved version without approval; the scope narrows after an approved version without approval; a never-waived rule is left out or deferred; F7 is used; a line builds on an OPEN decision; an irreversible decision has no approval; the baseline is not the version the proposal says it replaces |
| DEFER | A required rule is left out; a line has no reason, an open-ended deferral or is unresolved; a claim has no proof tag or source; an irreversible decision has no evidence; a change since the last version is not logged (scope and data status count as changes), or a later version is checked without the version it replaces; F6 (pilot) is used; the data is synthetic, mock or illustrative |
| EXECUTE | Nothing above. The next design stage, never construction, permit or publication approval |

Coverage is complete when nothing but synthetic data holds the call. Notes never block: an approved deviation, a CONCEPTUAL claim shown as a design goal, a concept or research entry that keeps its label, a proposal written against an older canon.

The report is sealed with SHA-256 like the façade decision contract (B5R-44), and each version names the hash of the version it replaces, so the chain of versions can be checked.

## What it does not do

It proves every applicable rule was answered; it does not prove the answers are true. A named reviewer still reads them. An approval on a line records a project decision and never changes canon. The applicability map is a reading of canon, not canon itself.

## What changed from the note

- The note's own decision words (Pass, Revise, Escalate, Reject) would have been a third decision vocabulary; the check uses EXECUTE, DEFER, ESCALATE and KILL.
- The "component taxonomy" is the canon register and the FIS module catalogue; nothing new was invented.
- Kinetic, curved, LED and planted façade elements are F7, which stays disabled (B5R-41); a proposal that uses one is escalated, not scored.
- The "BIR" image categories exist only as tags in the concept archive (`docs/aim-b5r/visual-archive/`), which is never evidence.
- The AIM-OCULAR boards arrived on 11 Nov; their check is `docs/aim-b5r/AIM_OCULAR.md`.
- The check is plain code with no running cost, so it does not wait on the revenue gate; design automation does (INF-01, B5R-31).

## Canon

GOV-31, locked by the owner on 11 Nov 2026 (canon 1.13.0):

> Design continuity: every AIM-B5R design proposal answers each canon rule that applies to its scope as included, modified, deferred (with what it waits for), excluded or unresolved, each with a reason. No undocumented omissions, no silent substitutions between versions, no performance or cost claim without its proof tag and source, and no irreversible design decision without evidence and a named approval. A project approval records a decision and never changes canon. The check is deterministic (GOV-14); EXECUTE means the next design stage, never construction or publication.

GOV-31 itself is listed in the map as "not a design input": it is the rule the check enforces, not a line a proposal answers.

The first real run is the AIM-OCULAR boards: `docs/aim-b5r/AIM_OCULAR.md`.
