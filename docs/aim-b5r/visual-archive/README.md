# AIM-B5R visual archive

Documentation track, separate from the Kern/Fresno Phase 1 evidence work.
Nothing in this folder is evidence about a parcel, building, system or investment.

| File | What it is |
|---|---|
| `AIM_B5R_Image_Concept_Register_v0.1_original.csv` | The owner's register as received (2026-10-09), unchanged. |
| `AIM_B5R_Image_Concept_Register_v0.2.csv` | Same schema, asset columns filled where images exist; three proposed families added (LET-01, WEAR-01, MED-01) pending owner approval. |
| `image_register.csv` | One row per image (AIMV-001...): concept, cross-tags, what it visibly shows, flags, SHA-256, size, upload filename. |
| `excluded_uploads.csv` | Uploads that are byte-identical duplicates or not concept imagery (product QA screenshots). |
| `AIM_B5R_Visual_Concept_Sheets_v0.1.pdf` | One illustrated page per concept family, including families with no images yet. |
| `tools/` | The scripts that produced the registers and sheets (re-runnable). |

## Image files

The original images are **not committed** (about 186 MB). They live in the
`AIM-B5R_Visual_Archive` folder set (one folder per concept, files renamed
`AIMV-nnn_<concept>.png`, bytes unchanged). Check any copy against
`image_register.csv` with `shasum -a 256`.

## States

Release: `UNMATCHED_ASSET → INGESTED → TAGGED → REVIEWED → APPROVED_FOR_PRESENTATION`.
All indexed images are `TAGGED`; none is reviewed or approved yet.
Technical: everything is `CONCEPT` except the three Fresno portal screenshots
(`REQUIRES_VALIDATION`, provisional; no parcel was selected in them).

72 images are indexed: AIMV-001 to 046 (received 7 to 9 Oct) and AIMV-047 to
072 (received 11 Oct: Triadic Planet boards, EDO robots, Dance8, Stuttr,
Seamless Threads, and the Chronolayer and Adaptive Reuse posters). Re-uploads of
AIMV-004 to 006 and one poster are listed as duplicates. The concept sheets PDF
still covers AIMV-001 to 046 only.

Fix these 11 Oct flags before any external use:

- AIMV-071 labels a generated image "PHOTO 2026.04.12" and "MEASURED GEOMETRY /
  POINT CLOUD", but no photo or survey exists.
- AIMV-070 and AIMV-071 each print a different "canonical" colour set, and
  neither matches Intelligence OS v3.2, where magenta means loss or exposure.

## Rules carried from the Visual Concept Atlas v0.1

- Every accessible image is indexed once; duplicates and derivatives link to the original.
- Missing files are recorded as missing, never invented. EVID-01, OPS-02 and OPS-04 have no images yet. OPS-01, OPS-03, OPS-05 and DES-02 appear only as cross-tags.
- Illustrative numbers in renders (e.g. the L.E.T. dashboards) are never presented as results.
- An approved image is not an approved building, parcel, engineering system or investment.
