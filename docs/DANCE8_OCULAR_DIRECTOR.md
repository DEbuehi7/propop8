# Dance8 Ocular Director (proposal)

A camera grammar for Dance8 music videos, from ChatGPT's study "Dance8 ×
STUTTR, Ocular Director" (received 15 Nov 2026: a v1.0 design, a grid study
v2, a concept text, an example shot record and four images, AIMV-107 to 110),
checked against canon 1.14.0 and the Dance8 code. It is a proposal: no canon
entry is added or changed and nothing here is built. The owner decides the
open points at the end.

## The idea

The screen becomes a performer. Stuttr's glasses give a personal view;
fictional cameras on a fictional set give a distributed one; the Kirtled moves
give the movement words; G.A.T.E.S. gives the spatial grammar. The picture
goes from one view to three, to nine and back, with one primary cell at any
moment and the others as context.

- **Rhythm** decides when the layout changes.
- **The story** decides which view matters.
- **The set's geography** decides how the cells relate: a performer who leaves
  one camera arrives in the next after a plausible walk.

Decision call: **EXECUTE** it as an editing layer composited in post over
approved footage, proved on one short excerpt. **DEFER** the camera graph, the
Director workspace and any "live" monitor look until that proof passes.

## What the study already gets right

| The study | Canon |
|---|---|
| Verify the beat grid before timing anything; never adopt a contested tracker result | D8-01 (a checked audio timeline), D8-25 (a beat is drawn only when a named person verified it) |
| The grid, borders and HUD are composited in post, never asked of the video generator | D8-01, GOV-23 (labels are a separate layer), GOV-01 |
| DO stomp, RA travel of half a body-width, LA level change, KA a turn of 180 degrees or more, TI a jump, FREEZE a held pose, DASH the same as FREEZE | D8-17 and D8-09 exactly |
| G.A.T.E.S. is Genome, AIM, Triadic, EDO, System, a grammar and not DNA | TRI-13, TRI-04 |
| Staged and synthetic footage only: no cameras in occupied units, no secretly filmed residents, no face recognition | GOV-29, GOV-16 |
| Captured, staged, synthetic and replayed footage stay distinguishable | GOV-17 |
| One short proof before twelve styles | D8-05 (production ladder) |

Its examples use 120 BPM, D8-03's sync reference (12 frames a beat at
24 fps). A real song uses its own measured grid; EDO's is below.

## What Dance8 already has

The study asks that its modules be built on what exists after looking at the
repository. They map like this:

| Study module | In the repo today | Missing |
|---|---|---|
| LyricMap | The lyric file per song and vocal loudness per eighth note (`lib/stuttr/analysis.ts`); the mouth track for lip sync | Word-level timings. A lyric anchor needs forced alignment and a human check |
| BeatMap | Stuttr's tempo and bars, cuemap tempo segments by bar run, frame maths for tempos that give fractional frames (`lib/dance8/render/fps.ts`) | A verification record per song. EDO's grid waits for the owner |
| CameraGraph | Six framings: drone wide, wide, medium, close, tracking, orbit (`lib/dance8/contracts/scene.ts`); camera lanes proposed in [DANCE8_SERIES.md](DANCE8_SERIES.md) | Positions, routes, travel times |
| MotionBinding | D8-17 move reading (`dance8 moves`, `check-moves`) and the move table (D8-20) | Entry and exit pose ids |
| SceneGenome | Scene, cast and prop references; per-set controls for action, cameras and mouths (PR #75) | Nothing for a proof |
| OcularPOV | Nothing | An approved glasses master and a POV shot type |
| DirectorGrid | Nothing: the render shows one clip at a time | A compositor that tiles three or nine clips around one primary cell |
| GatesPatternRenderer | The reaction layer (D8-25): Genome Loom, Algorithmic Cypher, Resonance Chamber, deterministic, drawn after generation | Nothing new: pattern overlays belong there |
| ShotCompiler | The Kling pack: cards, prompts, reference roles, lengths within each model's limits (`lib/dance8/authoring/`); 5-second Flash test batches (`kling --test`, PR #75) | Nothing for a proof |
| ContinuityQA | V4.1's four separate checks (identity, geometry, performance, sync) in every test pack (PR #75); clip approval; the drift-check contract | Route plausibility and lyric-object presence |
| EditorialExporter | `dance8 plan --aspect` for 9:16, 16:9, 4:5, 1:1 and 21:9; a CMX 3600 edit list for Resolve, Premiere and (converted) Final Cut (`lib/dance8/render/edl.ts`); the AI disclosure caption | OpenTimelineIO is not needed while the edit list covers hand polish |

The study's runtime names: SignalFrame and DecisionTrace exist
(`lib/dance8/contracts/`, `lib/dance8/runtime/`). The live player's
CandidateScorer already ranks clips by tempo, energy, section, zone,
continuity and novelty fit, less transition cost and repetition, and
DecisionGate can still refuse the top score. That is the shape of the study's
priority model (narrative, movement, rhythm and continuity less clutter, with
hard rules no score overrides), so a director ranking would extend it rather
than start again. MotionState, PulseScene, PulseDepth and Pulse Studio are not
in the repo or canon; a Director workspace would sit on what exists.

## Conflict ledger

| # | The study | Canon or record | Resolution |
|---|---|---|---|
| 1 | AIM-B5R named as a parent system; an AIM-B5R mark on AIMV-109 | GOV-15; the owner dropped AIM-B5R branding from the facility boards on 13 Nov | Drop AIM-B5R as a parent and from the art. G.A.T.E.S. and EDO stay |
| 2 | Building cameras in a lobby, corridor and on a roof | GOV-16, GOV-29, the virtual facility rules in [DANCE8_SERIES.md](DANCE8_SERIES.md) | The cameras belong to the fictional facility. Never a residential building, an employer's building or a real lobby, and never an occupied unit |
| 3 | Every cell labelled "live set"; "live-looking" monitors | GOV-17 | Label cells "set" or "staged". The footage class lives in the shot record |
| 4 | "8th Street", an "8th St" sign, "the 8th Street Bravados" | Series ledger 8 is open; the facility uses no real street signage (GOV-16) | The owner picks the wording. Until then no street sign in generated art; signage is drawn in the compositor (GOV-23) |
| 5 | Stuttr in dark shield glasses with a cheek mark | The approved look: long dark locs in gold cuffs, a short goatee, clear gold-rimmed glasses, a black leather jacket with gold piping, a gold pendant (`refs/cast/stuttr` in the Stuttr library) | The glasses view needs an approved glasses master: a HUD added in post over the approved pair, or a new pair the owner approves as a prop. No face marks unless approved |
| 6 | The Kirtled pattern on AIMV-110: a T with lattices of about ten triangles | D8-21: a Y of three equal arms at 120 degrees, each a strip of eight triangles | Draw it from the D8-21 schema (D8-10), never from this art |
| 7 | "8-beat / 2-bar shot flow": a move on every beat | RA and KA are read within a bar (D8-17); big motion stays slower than the beat (D8-03) | One move per bar. Eight moves take eight bars, about 20.4 s at 94 BPM |
| 8 | AIMV-109: "faster cuts at higher BPM" | The study's own text holds a layout for several bars at fast tempos; D8-03 keeps fast events for light and editing | Follow the text: layouts change on phrases (two or four bars); on the beat only a border pulse, within the reaction layer's limit of three flashes a second |
| 9 | "The grid follows how people view a screen"; the right-to-left icon's arrows point right | The study's text calls these composition choices, not gaze predictions | Keep five attention strategies as choices, and test them with viewers before claiming anything (sources below) |
| 10 | Subdivision 1, 3, 9, 27 | Readability | Stop at nine; 27 cells are unreadable on a phone |
| 11 | "Generate shots: Kling, Gemini, live action" | [security/VENDORS.md](security/VENDORS.md) lists Kling, not Gemini | Register Gemini before any clip or reference goes there |
| 12 | The EDO 3's strip from molecule (about 1 nm) to city (about 10 km) | TRI-04, TRI-13; the EDO 3s benchmark is parked (RD-011) | A design grammar across scales; no biological claim |
| 13 | The anchor lyric "a van on 8th Street" | The study marks it as an example; EDO's shot plan, briefs and captions mention no van or 8th Street | Anchors come from the song's own lyric file, timed per word and checked |
| 14 | AIMV-109's "12-bar / 32-second" example | Its panels run 16 bars at 2 s a bar (120 BPM) | Recompute per song from the measured grid |
| 15 | Vehicle chase, ride-along and drone-show styles | The study's own safety rule | Synthetic plates, or controlled conditions with permissions |
| 16 | Text baked into all four images | GOV-23 | Fine for internal reference; production frames carry text on a separate layer |

The attention sources are real, checked 15 Nov 2026, and none is about film:

| Source | What it studied |
|---|---|
| [Nielsen Norman Group, Text Scanning Patterns: Eyetracking Evidence](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/) (2019) | How people scan text on web pages |
| [Stimulus Center Bias Persists Irrespective of Its Position on the Display](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12733640/) | Where people first look in an image |
| [The Effects of Layout Order on Interface Complexity: An Eye-Tracking Study for Dashboard Design](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11435723/) (Sensors, 2024) | Reading order on dashboards |

## The example shot record

The study's `ShotContract` JSON (shot `STUTTR-OCULAR-GLS-002`) is a sound
draft: every unknown is null or TBD, nothing is marked verified, and its status
is "proposed, research only". Its fields already have homes:

| Field | Dance8 today |
|---|---|
| `song_id` | The Stuttr track id |
| `reference_master_ids` | The scene, cast and prop references, with their hashes |
| `music` (BPM, downbeat, bars) | The cuemap's bar grid, once verified |
| `movement.kirtled_words` | D8-17 move words from the owner's synced take |
| `camera` | A new camera node; today only the framing exists |
| `governance` and `qc` | The evidence state, plus V4.1's four checks; lyric object and route plausibility would be new |

No new schema until the proof needs one. Fields join the brief and the Kling
card when the module that fills them is built.

## Timing at EDO's tempo

At 94 BPM (pending the owner's confirmation) a beat is 0.638 s and a bar
2.553 s. At 24 fps that is 15.32 frames a beat, not a whole number, so frames
are computed from song time, as Dance8 already does. The study's 16-second,
eight-bar template becomes 20.4 s:

| Bars | Song time from the excerpt's first downbeat | View |
|---|---|---|
| 1 to 2 | 0.0 to 5.1 s | Glasses view, one cell |
| 3 to 4 | 5.1 to 10.2 s | Three cells: street, the van or other lyric object, the next space |
| 5 | 10.2 to 12.8 s | Nine cells, one primary |
| 6 | 12.8 to 15.3 s | Focus moves to the next space on the route |
| 7 | 15.3 to 17.9 s | The Kirtled studio |
| 8 | 17.9 to 20.4 s | One hero frame, FREEZE |

The study's 24 to 32-second proof is 10 to 12 bars of EDO (25.5 to 30.6 s).

## Where it fits

- **EDO (film 1), lightly.** The owner's review asked for more shots and
  angles, with cuts that tell the story. One or two phrase boundaries could
  open into three or nine cells of EDO's existing sets (the Lagos street, the
  Bravados scenes, the Kirtled stage, Stuttr's studio), composited in post: no
  new characters and no new Kling footage. It is an editing choice for after
  the V4.2 re-plan.
- **Bravados: Street-to-Stage (film 6), fully.** "A street set turns into a
  Kirtled dance arena" is the study's street-to-studio route, and the film
  already waits on the same wording decision (ledger 8).

## A proof, if approved

1. Pick a 10 to 12-bar excerpt; the owner verifies its grid and the anchor
   words' timing.
2. Approve the masters: Stuttr (exists), the glasses, the fictional spaces and
   one route through them.
3. One 5-second Flash test plate per camera (`kling --test`), no finals.
4. Build the grid compositor in Dance8's render: same plan, same frames, every
   time. It is the only new code.
5. Review against V4.1's four checks, plus: the lyric object is visible, the
   route is plausible, and viewers can tell which cell is primary.

No paid generation until the owner approves the proof.

## Owner decisions

1. Adopt the Ocular Director as a Dance8 editing layer, and prove it on EDO
   (light) or on Bravados: Street-to-Stage (full).
2. The 8th Street wording (ledger 8), which this decides too.
3. Stuttr's glasses for the POV: a HUD in post over the approved pair, or a new
   pair.
4. When to build the grid compositor: after EDO V4.2, or now.
5. Whether Gemini joins the vendor register.
