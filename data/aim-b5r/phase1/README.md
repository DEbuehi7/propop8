# AIM-B5R Phase 1 — Identity & Authority (Kern/Fresno pilot)

Implements `inputs/CLAUDE_EXECUTION_HANDOFF_v1.1.txt`. Evidence first,
deterministic gates (`lib/b5r/phase1/gate.ts`, rules `phase1-gate-1.0.0`),
human sign-off. File-based on purpose: no database tables until the pilot
proves the shape.

## Rebuild

```
npx --yes tsx scripts/b5r/phase1.ts
```

Reads the files below, rewrites `out/`. Never edits its inputs.

| File | Who edits | What |
|---|---|---|
| `inputs/*.csv`, `inputs/*.txt` | nobody | The pilot CSVs and handoff exactly as received. |
| `sources.csv` | Claude | Source registry: publisher, tier, URL, edition, limits, access status. |
| `evidence_manual.csv` | Claude, from your screenshots | Append-only. A corrected fact is a new row, never an edit. |
| `signoffs.csv` | you (or Claude on your word) | `lead_id,final_gate,reviewer,signed_at,evidence_snapshot_id,notes`. A sign-off only counts while the gate and the evidence snapshot ID still match. |

## Outputs (`out/`)

`properties.csv`, `source_registry.csv`, `evidence_register.csv`,
`phase1_identity_authority.csv`, `gate_decisions.csv`, `dossiers/K1..F5.md`,
`source_access_blockers.md`, `lookup_checklist.md`, `daily_report_<date>.md`.

## Rules in force

- Source tiers: 1 official records, 2 official GIS/context, 3 listings, 4 AIM concept material.
- Only tier 1-2 rows may be `verified`, and only with a source URI, a retrieval time and a snapshot (screenshot file + SHA-256 prefix).
- Listing APNs stay `provisional`. K5's listing value (00555555) is rejected and never stored as an APN.
- PASS: APN, situs address, jurisdiction and screening geometry verified. CONDITIONAL: the first three verified, geometry only screened. FAIL: a reviewed, documented contradiction or ineligibility. Everything else: HOLD. Missing evidence never becomes FAIL.
- A postal city is not jurisdiction evidence; GIS is not a survey; assessor data are not a title opinion.
- Advertised prices and cap rates are kept apart from evidence and unused in Phase 1.
