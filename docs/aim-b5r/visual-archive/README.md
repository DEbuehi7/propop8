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

89 images are indexed:

- AIMV-001 to 046: received 7 to 9 Oct.
- AIMV-047 to 072: received 11 Oct, daytime. Triadic Planet boards, EDO robots,
  Dance8, Stuttr, Seamless Threads, and the Chronolayer and Adaptive Reuse
  posters.
- AIMV-073 to 083: received 11 Oct, evening. Dance8 and State8 UI sheets, the
  pattern dimension system, Stuttr Spies, and two AIM-B5R / Dance8 / Stuttr
  triptychs.
- AIMV-084 to 089: received 11 Oct, 18:21 (final revision layer). Three earlier
  AIM-B5R drafts, plus STUTTR sheets 01 to 03, which are pages 4 to 6 of the
  poster PDF v1.

Duplicates and derivatives:

- Re-uploads of AIMV-004 to 006, AIMV-070, 071 and 072 are listed as
  duplicates.
- AIMV-081 is a phone crop of AIMV-077.

The concept sheets PDF still covers AIMV-001 to 046 only.

## Poster sets (PDF, not committed)

| File | SHA-256 (first 12) | Pages | Status |
|---|---|---|---|
| `AIM_B5R_ChronoLayer_Color_Governed_Poster_Set_v0.2.pdf` | 33a0533359e5 | 3 (rendering grammar; colour governance; VisionNode / chronology) | **Reference set for AIM-B5R visuals.** Uses Intelligence OS v3.2's exact hex values, gives neutral timelines, and labels the old "photo" as illustrative art with capture time N/A |
| `AIM_ChronoLayer_Dance8_Stuttr_Full_Poster_Set_v1.pdf` | 092c5758e65d | 6 (Dance8 01 to 03, STUTTR 01 to 03) | Concept set; one fix needed (below) |

The v0.2 set supersedes AIMV-070, 071, 072 and 084 to 086 for any external
use. Keep those drafts archived. Their open flags are listed in
`image_register.csv`:

- invented "LIVE" numbers
- "MEASURED / POINT CLOUD" labels with no survey
- rainbow phase bars
- hex values that differ from v3.2

Fix these flags before any external use:

- **Poster PDF v1 (all six sheets).** Each sheet's legend reads "AIM OS v3.2
  colour contract: cyan on-plan, magenta exposure". But the sheets use magenta
  for voices, rhythm, performers and decision cells. Under v0.2's own rule this
  is "cinematic colour in LOUD media", so give these sheets a media legend
  instead, for example:
  - cyan: voice / signal
  - magenta: performance / motion
  - gold: material / stage light
  - "not the AIM diagnostic contract"
- **STUTTR sheets.**
  - The "eight-voice projector" lists 6 voices.
  - The voice roles differ from AIMV-079.
  - The mission has 5 beats, while other sheets show 6 chapters.
- **Dance8 sheets.**
  - Sheet 01 still shows placeholder "MODEL 01 to 08" figures, not the eight
    performers.
  - "Pose blend" isn't built yet. The repo's Dance8 runtime has the audio
    clock, signal frames, clip choice and transitions.
- **Earlier sheets.**
  - AIMV-079 and AIMV-080 disagree on Stuttr Spies episode 2 to 6 titles, a
    chapter time and clip lengths.
  - AIMV-077 has the "PATTEER" typo.
  - AIMV-078 repeats performer label P06.

## Design rules

- **Colour (settled by the owner's Color-Governed v0.2 set).**
  - AIM-B5R and PropOps8 diagnostic boards use Intelligence OS v3.2 exactly:
    navy #1B243D, slate #5C6478, cool gray #E9EBEF, cyan #3DDCE8 (on-plan),
    magenta #E92AD6 (loss/exposure) and magenta light #C21FB0.
  - Colour is never a phase code.
  - Entertainment (Dance8, STUTTR) may use cinematic colour, with no
    fabricated data, and says so in its legend.

Proposed (owner decides; not yet adopted):

- **"1D-8D" means the pattern ladder only** (line, grid, volume, time,
  branching, multisensory, semantic, meta-system). Time scales use their names:
  micro, beat, bar, phrase, section, scene, chapter, set. Define them in beats
  and bars, not seconds, as the Dance8 code already does.
- **One meaning per brand name.** Stuttr is the AI music and audiobook project.
  The triptychs (AIMV-082 to 084) also use it for smart urban infrastructure. The
  new poster PDF v1 already fixes this: STUTTR is a character and spy/music
  world.
- **One Stuttr Spies series bible** holds episode titles, chapter times and clip
  lists. Every sheet copies from it.

## Rules carried from the Visual Concept Atlas v0.1

- Every accessible image is indexed once; duplicates and derivatives link to the original.
- Missing files are recorded as missing, never invented. EVID-01, OPS-02 and OPS-04 have no images yet. OPS-01, OPS-03, OPS-05 and DES-02 appear only as cross-tags.
- Illustrative numbers in renders (e.g. the L.E.T. dashboards) are never presented as results.
- An approved image is not an approved building, parcel, engineering system or investment.
