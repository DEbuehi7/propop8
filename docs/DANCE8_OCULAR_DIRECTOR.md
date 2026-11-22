# Dance8 Ocular Director (proposal)

A camera grammar for Dance8 music videos, from ChatGPT's study "Dance8 ×
STUTTR, Ocular Director" (received 15 Nov 2026: a v1.0 design, a grid study
v2, a concept text, an example shot record and four images, AIMV-107 to 110),
checked against canon 1.14.0 and the Dance8 code. It is a proposal: no canon
entry is added or changed. The owner adopted it on 15 Nov 2026 as an editing
layer with EDO as the proof film, and the grid compositor is built (below).

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
| DirectorGrid | Built 15 Nov: `dance8 grid` (below) | Animated transitions between layouts |
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
| 4 | "8th Street", an "8th St" sign, "the 8th Street Bravados" | Series ledger 8; the facility uses no real street's signage (GOV-16) | Decided 15 Nov: the name is 8th Street Bravados. On screen it is a separate layer drawn in editing (GOV-23), never baked into generated art |
| 5 | Stuttr in dark shield glasses with a cheek mark | The approved look: long dark locs in gold cuffs, a short goatee, clear gold-rimmed glasses, a black leather jacket with gold piping, a gold pendant (`refs/cast/stuttr` in the Stuttr library) | Decided 15 Nov: the glasses view keeps the approved clear gold-rimmed pair, and the display is added in editing. No face marks unless approved |
| 6 | The Kirtled pattern on AIMV-110: a T with lattices of about ten triangles | D8-21: a Y of three equal arms at 120 degrees, each a strip of eight triangles | Draw it from the D8-21 schema (D8-10), never from this art |
| 7 | "8-beat / 2-bar shot flow": a move on every beat | RA and KA are read within a bar (D8-17); big motion stays slower than the beat (D8-03) | One move per bar. Eight moves take eight bars, about 20.4 s at 94 BPM |
| 8 | AIMV-109: "faster cuts at higher BPM" | The study's own text holds a layout for several bars at fast tempos; D8-03 keeps fast events for light and editing | Follow the text: layouts change on phrases (two or four bars); on the beat only a border pulse, within the reaction layer's limit of three flashes a second |
| 9 | "The grid follows how people view a screen"; the right-to-left icon's arrows point right | The study's text calls these composition choices, not gaze predictions | Keep five attention strategies as choices, and test them with viewers before claiming anything (sources below) |
| 10 | Subdivision 1, 3, 9, 27 | Readability | Stop at nine; 27 cells are unreadable on a phone |
| 11 | "Generate shots: Kling, Gemini, live action" | [security/VENDORS.md](security/VENDORS.md) lists Kling, not Gemini | Decided 15 Nov: Gemini joins the vendor register, with the same limits as Kling |
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

At 94 BPM (confirmed by the owner on 15 Nov) a beat is 0.638 s and a bar
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

- **EDO (film 1), lightly: the proof.** The owner's review asked for more
  shots and angles, with cuts that tell the story. A few phrases open into
  three or nine cells of EDO's existing sets (the Lagos street, the 8th Street
  Bravados, the Kirtled stage, Stuttr), composited in editing: no new
  characters and no new Kling footage.
- **8th Street Bravados: Street-to-Stage (film 6), fully.** "A street set
  turns into a Kirtled dance arena" is the study's street-to-studio route.

## The grid compositor

Built on 15 Nov 2026: `lib/dance8/render/grid.ts` (the rules and the ffmpeg
arguments, pure) and `lib/dance8/gridPipeline.ts` (the render), tested in
`tests/dance8/grid.test.ts`.

```
npm run dance8 -- grid <trackId> <plan.json> [--approved] [--master en|suno] [--fps 24]
```

A plan is a list of blocks on the song's bar grid. Each block has a layout
(`one`, `three` or `nine`), its cells (approved clips, each with an optional
in-point) and which cell is primary:

```json
{
  "id": "ocular-proof", "schemaVersion": 1, "trackId": "edo", "aspect": "16:9",
  "phraseBars": 2,
  "blocks": [
    { "startBar": 22, "endBar": 24, "layout": "one", "primary": 0, "cells": [{ "clipId": "lagos-street" }] },
    { "startBar": 24, "endBar": 26, "layout": "three", "primary": 0,
      "cells": [{ "clipId": "bravados-youth" }, { "clipId": "lagos-street", "inSec": 0.85 }, { "clipId": "warehouse" }] }
  ]
}
```

What it enforces, before anything renders:

- **Timing.** Every block starts and ends on a bar line of the song's cue map
  (D8-01); with `phraseBars`, only on phrase lines. Blocks run on without
  gaps, never past the song's end, and never across a tempo change. Frames
  are counted from bar 0, so 94 BPM at 24 fps (15.32 frames a beat) never
  drifts.
- **The primary.** In `three` the primary takes the large cell (left in
  landscape, top in portrait) and the others follow in order; `nine` runs row
  by row. The primary has a gold border; context cells are a little darker.
- **The pulse.** On the beat the primary's border brightens, at most three
  times a second (every second or fourth beat at fast tempos), the reaction
  layer's limit (D8-25). Layouts never change on the beat.
- **One performer, one place.** A clip may appear in two cells at once only
  when all but one copy is marked `replay`, `memory` or `future`.
- **Locks.** Lip-synced and dancer clips play only where they line up with the
  song. A clip showing a singer's mouth is refused during a sung line unless
  it is lip-synced. Skate-trick clips are refused (D8-16).
- **Approval.** `--approved` uses approved clips with measured drift and an
  approved voice master, and adds the AI disclosure. A draft allows draft
  clips and says so.
- **Short clips** hold their last frame and the render says for how long.

Output: `<song>/dance8/renders/<song>-grid-<plan>-draft.mp4` over the Stuttr
voice master (never the Suno master, D8-14), and beside it a manifest listing
every block, cell, warning, the audio's hash and the checks (frame count and
pulse rate).

### Views and transitions

Added on 15 Nov 2026, after the owner asked for lyrics, the Kirtled view and
smooth switching. A cell can show a view instead of a clip:

```json
{ "startBar": 11, "endBar": 13, "layout": "three", "primary": 0,
  "cells": [{ "view": "kirtled" }, { "clipId": "v3-15" }, { "view": "lyrics" }] }
```

- **`lyrics`** shows the line being sung, large, with the next line small
  under it. A line stays up until the next one starts, or two seconds after
  it ends. It reads `<song>/dance8/<song>.lyrics.json`:

  ```json
  { "status": "draft",
    "lines": [{ "section": "Verse 1", "text": "The first line of verse 1",
                "start": 9.4, "end": 11.51, "timing": "aligned" }] }
  ```

  Times are song seconds. `timing` says how a line was timed (`aligned` to
  the vocal, or `estimated`). A draft can show draft timing and says so; a
  final (`--approved`) refuses anything but `"status": "approved"`, because
  on-screen text is a separate, approved layer (GOV-23). The words are the
  owner's lyric sheet, exactly as written.
- **`kirtled`** is the Kirtled *pattern*: the instrument drawn from canon
  D8-21 (a Y of three equal arms at 120 degrees, each a strip of eight
  triangles, no buttons), with the hub warming on each downbeat and a pulse
  running from the hub to the tips over the bar, on the verified beat grid.
  It is the beat's light, not a camera, and nothing is played on it.
- **`instrument`** with `"camera": "CAM-KIR-01"` or `"CAM-KIR-02"` is one of
  the Kirtled instrument cameras (next section). It can be any cell,
  including the primary.
- A block shows each view, and each instrument camera, at most once; a view
  cell takes no `clipId`.
- **Transitions.** `"transition": { "kind": "fade", "beats": 0.5 }` (the
  default) dissolves into each block over the half beat before its bar line,
  so the new layout is fully in on the bar line. Each clip starts that much
  early (or holds its first frame where it has nothing earlier), so nothing
  jumps. `"kind": "cut"` gives hard cuts.

Not built yet: cell labels (GOV-23 keeps them a separate approved layer), the
dancer diagram (it needs the dance take read as poses with `dance8 moves`),
instrument footage (it waits for the approved Kirtled still, the player's
identity under D8-24 and the go-ahead for new footage), and the glasses view:
Stuttr's approved clear gold-rimmed glasses, with the display drawn in
editing.

### The playable page

A private page for the owner (not in this public repo, because it carries the
song and the footage). Since 21 Nov it plays the approved EDO v2 cut live in
the browser: the edit list is resolved by `render/edit.ts` and drawn with the
same blocks, split and collapse geometry, studio, mattes and grade as the
edit renderer (WebGL for the picture, a type layer over it). Under the stage
the cut's timeline shows each block by layout, each landing and each sung
line, and says why the current block is there; the viewer can scrub, and turn
the lyrics, labels and grade off to look at the picture. The first version,
an auto director that chose a layout for every two bars, gave way to the cut
the owner approved.

## Instrument cameras

Added on 15 Nov 2026 at the owner's direction. Version 2 of the study had a
Kirtled studio camera showing performers and geometric patterns, but no
camera on the instrument alone being played, so Kirtled could disappear
behind the dance, the grid and the architecture. The instrument is a
principal performer, not a prop, and has two cameras of its own, independent
of the studio cameras, either of which can lead a grid
(`lib/dance8/contracts/instrument.ts`):

| Camera | View | Shows | Status |
|---|---|---|---|
| CAM-KIR-01 | Instrument isolation, overhead | The whole instrument in its fixed geometry and the hands playing it | Mandatory |
| CAM-KIR-02 | Performance detail, close | Finger movements, single triangles and their light response | Wanted |

Both keep the canon geometry (D8-21): three arms at 120 degrees, eight
triangles (triads) to an arm, no buttons. Footage that shows a different
instrument is rejected, as V3 shots 6 and 17 were.

**Where the picture comes from.** Instrument footage is a clip with an
`instrument` lock: `{ "camera": "CAM-KIR-01", "eventMapId": "edo-kirtled-events",
"songStartSec": 28.2 }`. It plays only where it lines up with the song, like
lip-synced clips, and a final takes it only when it was made to the song's
approved event map. Until such footage exists, a draft draws a stand-in from
the canon geometry: overhead, the whole instrument at rest, with the chord's
triangles lighting and a ring marking each hand (cyan left, magenta right) on
the triangle it plays; close, the same view held on the triangle the block's
first event plays. A final never uses the stand-in, because it shows no hands.

**A sequence in grid terms** (bars are illustrative):

```json
[
  { "startBar": 38, "endBar": 40, "layout": "one", "primary": 0,
    "cells": [{ "view": "instrument", "camera": "CAM-KIR-01" }] },
  { "startBar": 40, "endBar": 42, "layout": "three", "primary": 0,
    "cells": [{ "view": "instrument", "camera": "CAM-KIR-01" }, { "clipId": "stuttr-playing" }, { "clipId": "dancers" }] },
  { "startBar": 42, "endBar": 44, "layout": "nine", "primary": 4,
    "cells": [{ "view": "instrument", "camera": "CAM-KIR-02" }, { "clipId": "hands" }, { "clipId": "stuttr-playing" },
              { "clipId": "dancers" }, { "clipId": "footwork" }, { "clipId": "floor" },
              { "clipId": "audience" }, { "clipId": "building" }, { "clipId": "street" }] },
  { "startBar": 44, "endBar": 46, "layout": "one", "primary": 0,
    "cells": [{ "view": "instrument", "camera": "CAM-KIR-02" }] }
]
```

The instrument plays a phrase full screen; the grid opens to the instrument,
the player and the dancers; then to nine views (detail, hands, player,
dancers, footwork, floor, audience, building, street); at the breakdown every
other cell closes back to the instrument alone; and the last accent, an
event with a camera move on the next bar line, starts the next change.

### The event map

What the instrument does on screen comes from an event map
(`<song>/dance8/<song>.kirtled-events.json`), never from the picture. The
song is prerecorded, so the map is authored and approved by a person, and the
video never claims the instrument made the recording (the harmony contract's
`sounding: false`; D8-25). Each event records four things:

```json
{ "id": "k007", "bar": 38, "beat": 0,
  "play":   { "triangle": "A2", "hand": "left" },
  "music":  { "harmonyEventId": "h31", "chord": "Am" },
  "visual": { "lights": ["A2"], "dancers": "step" },
  "camera": { "action": "switch", "to": "CAM-KIR-02" } }
```

1. **The playing:** which triangle (`A1` next to the hub to `A8` at the tip of
   arm A, likewise B and C), when, and which hand.
2. **The musical event:** the chord change of the song's harmony timeline that
   it stands for.
3. **The answer on screen:** the lights, and whether the dancers step.
4. **The camera:** hold, enlarge, or switch to the other instrument camera.

`checkEventMap` (`lib/dance8/harmony/eventMap.ts`) holds every event to the
rule that a finger never triggers an unrelated note or light:

- the event plays the triangle of the chord sounding at that moment (its
  anchor), and names that chord;
- it lights that chord's own triangles and nothing else (one, or two that
  share a side for a seventh, as `readChord` reads them);
- a camera move lands on a bar line;
- one hand plays one triangle at a time, and events stay in time order;
- a chord no person has verified holds: the event is kept but nothing is
  drawn, and a final refuses it (D8-25). An unapproved chord timeline holds
  them all.

`npm run dance8 -- kirtled-events <song>` drafts a map once from the harmony
timeline (one event per chord change, on the chord's triangle; the left hand
takes the left branch, arm B, the right hand the right branch, arm C, and the
stem, arm A, goes to the hand that did not play last; the camera holds), then
checks it on every run. The draft is for the owner to edit and approve.

### The completeness rule

Every principal performer, instrument and significant object of a song has
an approved view of its own before a multi-camera composition is approved.
The song lists them in `<song>/dance8/<song>.principals.json`:

```json
{ "schemaVersion": 1, "trackId": "edo",
  "principals": [{ "id": "stuttr", "kind": "performer", "name": "Stuttr" },
                 { "id": "kirtled", "kind": "instrument", "name": "Kirtled" }] }
```

A final (`grid --approved`) refuses to render without the list, or when a
principal has no approved clip that shows it on its own (`"isolates":
"<id>"` on the clip). For Kirtled, that clip is CAM-KIR-01 footage;
CAM-KIR-02 is wanted and its absence is a warning. A plan that shows Kirtled
anywhere must name it as a principal. A draft lists the same gaps as
warnings. The rule is built into Dance8; adding it to the canon register
waits for the owner (it changes the canon lock and its version).

## Edit lists

Built on 21 Nov 2026, after the owner approved the EDO v2 cut. A grid plan
lays clips into bar-long blocks; an edit list is the whole cut, written by a
person: what every cell shows at every moment, and why each layout change
happens. `lib/dance8/contracts/edit.ts` (the format),
`lib/dance8/render/edit.ts` (the check and the frame plan, pure),
`lib/dance8/render/house.ts` (the look, pure pixels) and
`lib/dance8/editPipeline.ts` (the render), tested in
`tests/dance8/edit.test.ts`.

```
npm run dance8 -- edit edo ~/StuttrLibrary/edo/dance8/edits/ocular-v2.json --check
npm run dance8 -- edit edo ~/StuttrLibrary/edo/dance8/edits/ocular-v2.json --height 720
npm run dance8 -- edit edo ~/StuttrLibrary/edo/dance8/edits/ocular-v2.json --from 68 --to 84
```

`--check` reports and renders nothing; `--height` draws a lighter draft;
`--from` and `--to` render part of the song; `--approved` makes a final.

### What the check holds an edit to

The rules came from the owner's notes on the first grid draft (scenes
repeating, no shared look, little lip-sync, splits unconnected to the music
or to each other, unmotivated changes between one screen and many):

1. **Each story clip is placed once.** A source names a clip of the song's
   clip library and one mapping from song time to clip time, so no frame of it
   can show twice. A clip listed twice is refused, and nothing may show a
   source outside its placement. Clips named `similar` (too alike, such as two
   renders of the same set) never both appear.
2. **Slow, not stretched thin.** A clip shorter than its window is slowed, at
   most 15% (frames repeat). Past that, shorten the window or make the clip
   longer.
3. **On the grid.** Every landing sits on the eighth-note grid of the cue map.
   A geometric change takes half a beat and a dissolve one beat, both ending on
   the landing.
4. **Layouts change at musical edges.** A change of layout lands within one
   beat of the voice entering or leaving (lyric phrases, section starts, sung
   cues), of a sung line's onset when its timing was aligned to the voice
   (added for V5, so a split or merge can land on the line it serves), or
   where a cue section starts. Every block says why in `why`.
5. **The singer is seen singing.** While the voice sings, a take whose role is
   singer, in a view that shows the face, is on screen at least 95% of the
   time.
6. **Light within limits.** The gold triangle at each landing never comes more
   than three times a second (D8-25); a frame pulses on the downbeat only.
7. **Finals.** `--approved` refuses draft or unmeasured clips, draft lyric
   timing (GOV-23), stand-in takes and the drawn Kirtled stand-ins, and runs
   the completeness rule. A draft lists them as warnings.

### The format

```json
{
  "id": "proof", "schemaVersion": 1, "trackId": "song", "aspect": "16:9",
  "sources": { "street": { "clip": "street-wide", "origin": 0, "end": { "bar": 2 } } },
  "takes": { "sing": { "file": "takes/sing_pack.mp4", "songAt0Sec": 0.9, "role": "singer", "standIn": true } },
  "views": { "face": { "box": [0, 0, 1, 1], "shows": "face" } },
  "blocks": [
    { "id": "intro", "land": 0, "layout": "one", "cells": { "world": "full" } },
    { "id": "verse", "land": { "bar": 2 }, "layout": "three", "cells": { "face": "big", "world": "tr", "body": "br" },
      "primary": "world", "lyrics": "band", "why": "the voice enters" }
  ],
  "content": {
    "world": [{ "kind": "story", "source": "street", "from": 0, "to": { "bar": 2 } }],
    "face": [{ "kind": "take", "take": "sing", "view": "face", "from": { "block": "verse", "at": "start" }, "to": { "bar": 6 } }]
  }
}
```

Times are song seconds, a bar and beat of the cue map (`{ "bar": 3, "beat":
2.5 }`), or a block's landing or the start of the transition into it
(`{ "block": "verse", "at": "start" }`). Layouts are `one` (`full`), `three`
(`big`, `tr`, `br`: a square primary on the left in landscape, on top in
portrait), `quad` (`q0` to `q3`, a 2 x 2), `eight` (the `big` cell of
`three` and `e0` to `e7` beside it), `nine` (`r0c0` to `r2c2`) and `inset`
(`full`, and `pip`: a tall panel down the right side in landscape, a band
across the bottom in portrait, so a standing body fits it). By state name (`LAYOUT_STATE`) they
are S1, S2, S3, S4, S5 and D1. A cell keeps its id across blocks, and its
content list says what it shows when:

- `story`: a source, with an optional slow push-in. A source is a clip of the
  clip library or a still plate (`"still": "plates/harbour.png"`), which the
  camera moves across over its whole window (`move`, from one centre and zoom
  to another, eased; a slow push by default). A still is placed once like a
  clip, is never slowed, and needs `"approved": true` for a final.
- `take`: a performance with a matte, locked to the song, in a named view
  (a crop that shows the face or the body), standing in the cell (`stage`) or
  filling it (`cover`), with fades in beats and a backdrop: the studio, or a
  story source darkened behind the performer.
- `kirtled`: the studio (the beat light as a backdrop, optionally with a title
  card), the beat light itself, the drawn overhead and detail stand-ins, or
  `floor`: the canonical Y seen from above, lit by a take's measured body (one
  triangle further out each beat of the verified grid, as bright as the body
  moved on that beat; a ring where a foot comes down, B left and C right; the
  hips' side-to-side position across the hub). Rhythm only: no chord is lit.
- `trace`: Dance8's reading of a take's measured body, framed like the
  dancer's own view (scaled to the upper four-fifths of the cell): skeleton
  (left side cyan, right magenta), the feet's and the torso centre's paths
  over the last 1.2 s, footprints where a foot came down in the last bar, the
  hips' orbit in the plane of the shoulders and the centre's travel. Along the
  bottom, the pulse strip puts the last bar on one time axis: the song's
  measured low (gold) and high (cyan) band energy from Stuttr's saved feature
  track, the beats of the verified grid with the body's energy on each
  (magenta), and the footfalls. A take gets
  body points with `"motion": "<take id>"`, read from
  `<song>/dance8/moves/` (D8-17). Move words are not drawn until the take's
  move track is approved.
- `lyrics`: the lyric cell of a nine-view or an eight-view.

A block arrives by `geometry` (the primary carries the picture to its new
place; new cells open from the edge they share with it; cells that leave are
covered), `dissolve`, `content` (same cells, new content) or `cut`. A
nine-view block may move the light between cells with `now`; the others dim.
The sung line is set under the singer (`band`), large across the frame
(`hook`) or in the lyric cell (`cell`), each word lit as it is sung where the
lyric file has word times; `acrostic` names a section whose capital words
spell a word, shown letter by letter.

### The look

One grade over everything: shadows toward teal, highlights toward gold, a
little less saturation, a soft S-curve, a vignette and grain from a fixed
seed. Performers stand in a deep teal studio with the Kirtled beat light
(D8-21 geometry, the pattern view) drawn larger than the cell behind them,
and a gold rim on their matte. Grid cells have gold hairline frames; the
lead cell's brightens on the downbeat. A gold triangle opens at each landing.
Type and labels are a separate layer drawn after the grade (GOV-23): stand-in
takes and drawn instrument views are labelled in the frame, and a draft
carries a line saying it is not for release.

### Takes and mattes

A take is packed side by side: the picture on the left half, the matte on
the right (white is the performer), so the two can never drift apart.
`scripts/dance8/alpha_pack.py` makes one from a video with the
u2net_human_seg model, on the computer, nothing uploaded:

```
python3 -I scripts/dance8/alpha_pack.py ~/StuttrLibrary/edo/dance8/takes/singing.mp4 ~/StuttrLibrary/edo/dance8/takes/sing_pack.mp4 ~/StuttrLibrary/models/u2net_human_seg.onnx --size 720x720
```

The owner's own takes stand in for the characters until Kling Motion Control
replaces them (`standIn: true`; a final refuses them). The character's
performance, matted the same way, takes their place.

### EDO v2

The approved cut, re-rendered on 21 Nov 2026 through the repo from a scratch
copy of the library (the edit list lives with the song, not in this public
repo): 14 blocks over 125.92 s, 3022 frames at 24 fps, rendered at 720p in
11 minutes. The check reports the same numbers as the approved draft:

| Measure | First grid draft | EDO v2 |
|---|---|---|
| Story clips shown more than once | 9 of 13 (the V3 cut 11 times) | none; 14 clips, each placed once |
| Singer's face on screen while sung | 7% | 98.8% (79.4% at a quarter of the frame or more) |
| Layout changes | 13 | 8, all at musical edges |
| Landings on the grid | | 13 of 13 |
| Slowest clip | | 10.4% slow |

Left out, with the reason kept in the edit list: V3 shot 02 (the same tree as
21), 19 (the same lone dancer as 11), 06 and 17 (rejected instrument shots),
07 (a Kling watermark) and 18 (on hold).

**v2.1** (21 Nov) adds four still plates from the owner's image package: the
Lagos waterfront from night to dawn in verse 1, cut on the sung lines
(navigation, daybreak, dawn skyline), in place of the street shot, and the
Ghost's view through his penthouse glass at bar 17, between the Ghost at the
window and the close-up. The other fifteen plates stay out, each with its
reason in the edit list: most are stills of footage already in the cut (a
frame match of 0.94 to 1.00 against the V3 shots), three are grid and
dissolve frames the compositor draws live, one is the same harbour as the
window view, and the two Kirtled studies draw separate triangles meeting at
corners rather than one strip per arm, with a disc in the hub (D8-21). The
check: the same 98.8% face coverage and 8 layout changes, 13 clips and 4
stills each placed once, slowest clip 9.4%.

### V5: one grammar, one score

Built 21 Nov 2026 from the owner's V5 brief: every subdivision is another
view of the same musical moment, and the film teaches its system by
repeating one sentence, singer full frame, then the singer with connected
views, then the singer, the dancer, the Kirtled floor his body lights and
Dance8's trace of that body, then back to the singer on the next line that
matters.

- **Layout states** S1 to S5 and D1 (above). The check adds one measure:
  how much of the sung time the singer's face is the largest picture on
  screen (`faceLargestPct`); the 2 x 2 counts, since its cells are equal.
- **The trace and the floor** read the owner's take as body points, the same
  D8-17 record `dance8 moves` writes, with the take's capture seconds turned
  into song seconds in one place (`lib/dance8/moves/trace.ts`). Footfalls are
  measured (a foot back on its own floor line after a lift), not move words.
- **Calm version.** `--calm` renders without the landing triangles, flares or
  downbeat pulses and softens the floor; every render now measures the most
  flashes per second in any part of the frame and writes it to the manifest,
  warning above three.
- **The visual score.** `npm run dance8 -- score edo <edit.json>` writes
  `<song>/dance8/scores/<edit id>.score.json` and `.csv`: every layout state
  with its cells, roles, sources and approvals, and every event on the song
  clock with its evidence and what it may draw: the owner-verified beat grid
  (pulses), energy peaks from Stuttr's saved feature track (light, never a
  beat, D8-25), sung lines (draft timing), footfalls (rings), move words and
  chords (HOLD, nothing drawn, until approved). `--plan-fps` adds what is on
  screen frame by frame, so a player draws the render's own geometry instead
  of re-deriving it.
- **One clock.** Score times are song seconds from the master's first sample.
  The Kirtled plan (`edo.kirtled.json`) keeps its `startSec` and `atSec` from
  bar 0, which is why they read 0.075 s early against EDO's song time; the
  renderers add the first downbeat, and the score converts through
  `gridSec`, so nothing draws early.
- **The thick trace.** The trace draws the body as Dance8's UI does beside
  the original dance: capsules for the torso and limbs sized from the
  measured torso length, a head disc, then the thin bones and joint rings on
  top, left side cyan and right side magenta. Footprints and the pulse strip
  stay as they were.

### Replacing the stand-ins with a character

Added 22 Nov 2026 so a checked cut can swap the owner's stand-in takes for
Stuttr (or any `refs/cast` character) without changing a cell, crop or
landing. Two commands and one round trip to Kling; nothing is uploaded or
paid for by the code.

1. `npm run dance8 -- kling-takes <song> <edit.json> [--max 30]` finds every
   span the cut shows of each stand-in take (its own cells, plus the trace and
   floor cells drawn from it; half a second of handle each side; gaps under
   3 s merged) and cuts it into pieces Kling Motion Control can perform:
   whole seconds, 3 s at least, at most 30 s (the reference video's
   orientation) or 10 s (`--max 10`, the character image's orientation).
   Long spans are cut where a sung line starts or ends (singer) or on a
   downbeat (dancer), neighbours sharing half a second. Each piece folder
   holds `reference.mp4` (the stand-in alone on flat grey, from its own
   matte), `voice.wav` for the singer (the approved voice take, else the
   song's vocal stem, cut to the piece) and `CARD.txt` (settings, the
   character image, the prompt, the Lip Sync step, the sung lines, what to
   reject). The character's look in the prompt comes from its own
   `character.txt`, and its `face.png` or `fullbody.png` is copied into the
   kit.
2. In Kling: Motion Control per piece, then Lip Sync with `voice.wav` for
   the singer's pieces; save each download in its folder under the name of
   the character it now shows (`stuttr.mp4`, `siren.mp4`).
3. `npm run dance8 -- takes-assemble <song> <edit.json> --model <u2net onnx>`
   checks every download first, lays the pieces on one song-length canvas at
   their song times (cross-fading the shared seconds), mattes it like the
   stand-ins (`--matte none` for a quick preview), writes `check.mp4` per
   piece (the stand-in beside the generated piece, with the voice) and writes
   `<edit id>-<characters>.json` (for EDO, `ocular-v5-stuttr-siren.json`: Stuttr
   sings, Siren dances): the same cut with the generated takes. A
   generated take stays out of a final until someone sets `"approved": true`
   after its checks.

Why not one generation for the whole song: Motion Control takes one
continuous reference of at most 30 s, Lip Sync at most 60 s, and Kling's
extend feature does not apply to Motion Control, so a 2-minute performance
is always several pieces. The trace keeps drawing the owner's measured body
points (the dancer's moves the generated dancer copies); body data stays out
of the repo (D8-17).

## The EDO proof

Rendered 15 Nov 2026 from a scratch copy of the library, not the owner's:
bars 22 to 34 of EDO (song 56.25 to 86.89 s, 30.67 s, 736 frames at 24 fps),
on the 94 BPM grid, which the owner confirmed after watching it. The cells
are EDO V3 shots, used as drafts. The Kirtled instrument close-ups (V3 shots
6 and 17) stay out, because V4.1 replaces that instrument.

| Bars | Layout | Primary | Context |
|---|---|---|---|
| 22 to 24 | one | Lagos street, with the yellow van | |
| 24 to 26 | three | 8th Street Bravados, youth | the street, the warehouse |
| 26 to 28 | three | 8th Street Bravados, adulthood | the youth shot as a memory, the Lagos plaza |
| 28 to 30 | nine | Stuttr dancing on the Kirtled stage, centre | street, both Bravados shots, plaza, warehouse, the gold hall figure and duet, masked Stuttr |
| 30 to 32 | three | Stuttr dancing | the gold hall duet, the neural tree |
| 32 to 34 | one | Masked Stuttr in the leather chair | |

Checked: 736 of 736 frames; layouts change only on two-bar lines; the border
pulses on each beat (1.57 a second) and is dark between beats. The 5-second youth
shot holds its last frame for 2 or 3 frames in the three blocks that use it.

The full-length views draft followed the same day: all 49 bars in 16 blocks,
with lyrics cells in six blocks, the Kirtled view in four (it leads the
second instrument passage; both passages show other shots instead of the
rejected close-ups) and half-beat dissolves. Checked: 3003 of 3003
frames, pulse at most three a second, lyric timing marked draft.

Lyric timing found while aligning the sheet to the vocal: verse 1 runs 0:09
to 0:29, the hook 0:30 to 0:41 (estimated; it does not align to the written
words), verse 2 0:50 to 1:04, the spoken bridge 1:10 to 1:23 and the outro
from 1:43. So the passage at 1:16 that the V4 plan calls the hook in the gold
hall is the bridge. The sheet's "8th Street Bavados" is shown as
"8th Street Bravados", the decided name.

## Owner decisions

Decided on 15 Nov:

1. Adopted as a Dance8 editing layer, to be proved on EDO (light): EDO's existing
   sets and clips, no new characters and no new Kling footage.
2. The name is **8th Street Bravados** (series ledger 8 closed).
3. The glasses view keeps Stuttr's approved clear gold-rimmed glasses; the
   display is added in editing. The answer arrived as "Approved glasses and",
   read as this choice.
4. The grid compositor is built now, before the EDO re-plan.
5. Gemini joins the vendor register
   ([security/VENDORS.md](security/VENDORS.md)).
6. Kirtled gets two cameras of its own: CAM-KIR-01 (instrument isolation,
   overhead, mandatory) and CAM-KIR-02 (performance detail), each selectable
   as the dominant cell; instrument sequences follow an approved event map;
   and every principal performer, instrument and significant object needs a
   view of its own before a multi-camera composition is approved. See
   [Instrument cameras](#instrument-cameras).

Decided on 21 Nov:

7. The EDO v2 cut is approved: its rules and its look become edit lists
   ([Edit lists](#edit-lists)), and the playable page follows the same cut.
8. The V5 brief: layout states S1 to S5 and D1, splits and merges on the
   lines they serve, the dancer, the Kirtled floor and Dance8's trace of the
   same movement, and one score for the page and the render. Built for
   review ([V5](#v5-one-grammar-one-score)); nothing generated, merged or
   released.
