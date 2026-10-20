# Dance8 — Orbit + Vector spec

**This file supersedes**, for the slice it covers, the unsigned motion-language
memo pasted into chat on 2 October 2026 (the one proposing a site-wide
PropOps8/LET motion language, a Dance8 dual-view, an 8-dancer/Three.js build,
and a frequency-to-anatomy mapping). That memo is a real source of ideas and
stays on the backlog (§5), but only one slice of it is decided and built here:
**Dance8's Performance / Orbit + Vector dual view and the music-as-master-clock
architecture underneath it.** The rest of the memo is not yet ruled on. Where
this file and the memo disagree on the part it does cover, this file wins.
Change it here first, then build.

Last reconciled: 19 October 2026 (your moves: §6).

---

## 1. What Dance8 is

Dance8 is its own product — the live-choreography piece of the
[[music-video-engine]] work (Suno tracks → modular, audio-reactive video) —
**not** a seventh module bolted onto [[plate-rig|Plate8]]'s six (State, Mate,
Skate, Plate, Slate, Late). It currently lives as a set of scratchpad
prototypes, not yet under `propops8`'s `app/`:

| Piece | File | Is |
|---|---|---|
| **Pulse** | `_pulse_engine.js` | Offline audio analysis: decode → bass/overall energy envelopes → beat detection → BPM |
| **Flow** | `index.html` | Stage geometry, clip paths, and the continuity (gap) validator |
| **Picker** | `picker.js` | The choreography decision function — four-tier fallback over gap-continuity and energy match |
| **Library** | `library.js` | The clip metadata library the picker chooses from (currently 9 clips / 3 stage hubs) |
| **Live Director** | `live-director.html` | All four combined into one page: Pulse's live energy picks Picker's next clip from Library, drawn on Flow's stage |

No file here is named with an "8" suffix, same convention as Plate8's own
modules (it's **Mate**, not "Mate8" — see §3). "Dance8" is the product name;
its parts keep plain names.

---

## 2. Performance view / Orbit + Vector view

Dance8 gets a second, analytical view next to the existing one, the same
split Mate already uses for chess (Game View vs. its own Sword & Shield
view — circles for a piece's radial/circular motion, vectors for its
axial/diagonal motion). Dance8's version:

- **Performance view** — what's on screen today in `live-director.html`: the
  stage, the dancer's path, the footprint trail, the "now dancing" clip chip.
- **Orbit + Vector view** — the same moment, read as motion data instead of
  as a scene:
  - **Orbit** — cyclical information: **beat phase** (where the music is
    inside the current beat, `0→1`, repeating), and, for a `spin` or
    `stationary` clip, its rotation angle. Circular by nature; drawn as a
    dial, not a line.
  - **Vector** — linear information: the current clip's **travel
    direction** (its entry→exit bearing), **displacement** (stage units
    covered), and **speed** (displacement ÷ clip duration). Zero
    displacement is reported honestly as "holding," not hidden, for a
    `spin`/`stationary` clip.

Both views read the **same state** — `currentClip`, `clipElapsed`,
`secondsPerBeat()`, `currentEnergyLevel()` — nothing is computed twice or
kept in sync by hand. This is the one architectural rule carried over
unchanged from the memo: *the analytical visualization and the visible
performance must consume the same state, never a separately-animated copy.*
If a number appears in the Orbit + Vector view, Picker, Pulse or Flow already
computed it for the Performance view.

What this is **not**, yet: there is no pose/skeleton data in this prototype
(no camera, no motion capture, no rigged character), so Orbit + Vector reads
the clip's own entry/exit/path_shape/beats metadata, not joint rotations.
The memo's richer per-joint version (head/hand/torso/foot orbits and vectors
off a rigged dancer) is deferred — see §5.

---

## 3. Naming and colour ruling

| Topic | Memo | Ruling | Why |
|---|---|---|---|
| Chess module name | "Mate8" | **Mate** | No Plate8 module carries an "8" suffix; the product is Plate8, the pages are State/Mate/Skate/Plate/Slate/Late |
| Mate's colour, when cited here | unspecified / implied generic | **`#00BE5F`** (Plate8 green, per `docs/PLATE8_SPEC.md` §1) | Citing the Sword & Shield lineage means citing Mate's real colour, not inventing one |
| Dance8's own colour | unspecified / "your cyan/magenta interface" (that's PropOps8's header mark, not Dance8's) | **Dance8 keeps its own palette, already shipped in `live-director.html`** — see below | Plate8's own rule applies by extension: one accent per domain, nothing borrowed |
| Orbit's colour | — | **`--pulse` `#ff2e9a`** | Beat phase is music-clock data — the same domain Pulse/tempo already owns in pink, elsewhere on this same page |
| Vector's colour | — | **`--flow` `#35e4ff`** | Direction/displacement is stage-space data — the same domain Flow's path-drawing already owns in cyan |

No new colour is introduced for this pass. Dance8's full existing palette,
for reference:

| Token | Hex | Means |
|---|---|---|
| `--pulse` | `#ff2e9a` | Music / beat signal — now also Orbit |
| `--flow` | `#35e4ff` | Path / spatial continuity — now also Vector |
| `--gap` | `#ff5a4d` | A jump-cut (continuity broken) |
| `--warn` | `#ffb020` | Analyzing / caution |
| `--c-afrobeat` | `#ffb020` | Style accent |
| `--c-edm` | `#7c5cff` | Style accent |
| `--c-psychedelic` | `#a4ff4d` | Style accent |
| `--c-jazz` | `#ff8a5c` | Style accent |

---

## 4. Status against the memo's architecture

The memo's pipeline — `Suno audio → Music analysis → Shared timecode →
Beat/Bar/Section/Energy/Frequency data → Choreography Decision Engine →
{Dancer motion, Orbit+Vector} → Dance8 UI` — already exists in a narrower,
working form:

✅ built · 🟡 partial · ⬜ not built

- ✅ **Shared timecode.** `audioEl.currentTime`, read by both the stage and
  (new) the Orbit + Vector view. One clock, not two.
- ✅ **Beat / energy data.** Pulse's `detectBeats`/`estimateBpm` and its
  per-window bass/overall energy envelopes, validated against a real
  128bpm test track (detected 129bpm).
- ✅ **Choreography Decision Engine, v1.** Picker's four-tier fallback
  (clean-transition-and-energy-match → clean-transition-any-energy →
  any-transition-and-energy-match → anything), which is a real,
  tested-in-isolation ancestor of the memo's weighted candidate scorer —
  just two signals (gap-continuity, energy bucket) instead of the memo's
  full list (music fit, beat alignment, section fit, dancer identity,
  pose continuity, spatial clearance, ensemble sync, repetition penalty).
- ✅ **Orbit + Vector, v1.** This pass.
- 🟡 **Clip metadata.** Library entries carry `beats`, `energy`,
  `entry`/`exit`/`facing`, `path_shape` — a real subset of the memo's list
  (tempo range, rotation, vertical level, footwork type, upper-body
  intensity, entry/exit *pose*, transition compatibility are not modeled).
- ⬜ **Bar / section / frequency bands (mids, highs, onset, brightness).**
  Pulse computes one bass band (lowpass @150Hz) and one overall band —
  nothing spectral beyond that, and no section detection (intro/verse/
  build/chorus/break/outro). The memo's frequency-to-anatomy mapping needs
  these and isn't buildable without them first.
- ⬜ **Multiple dancers / ensemble field, ranked candidate list,
  generative motion, ensemble ranking (`beatSync`, `flowScore`,
  `spatialScore`, `nextClipCandidates` as the memo's `DanceState` has them).**
  Picker returns one chosen clip plus its own verdict, not a scored,
  ranked shortlist.

---

## 5. Explicitly deferred (not ruled on by this file)

Real ideas from the memo, not decided or built in this pass:

1. The site-wide **motion language** (pulse / sweep / flow / path / orbit /
   morph as a shared vocabulary across PropOps8, the audit engine,
   calculators, owner profile, infographics, and the LET network —
   Eon/Lumen/Transect) and its timing scale (120–220ms micro, 250–400ms
   panel, 700–1400ms data-flow, 4–10s ambient, `prefers-reduced-motion`
   kills all non-essential motion).
2. **Eight dancers with distinct "engines"** (different audio-feature
   weightings per dancer — e.g. bass/impulse-weighted vs. onset/syncopation-
   weighted) and the **frequency-to-anatomy mapping** (sub-bass→legs,
   low-mid→hips/torso, mid→shoulders/arms, high-mid→wrists/hands,
   treble→micro-movement).
3. **Rigged 3D dancers** (Three.js / React Three Fiber, GLTF + AnimationMixer)
   or any real pose/skeleton source — a prerequisite for a per-joint Orbit +
   Vector view.
4. A **ranked candidate list** in Picker (score and show 3–4 next-clip
   options, not just the one chosen) and the richer weighting the memo
   describes (music fit, section fit, dancer identity, spatial clearance,
   ensemble sync, repetition penalty).
5. **Bar/section/frequency-band detection** in Pulse (needed before #2 is
   possible).
6. The **Studio page** deep view (track timeline with section markers, a
   per-dancer move-sequence row, a view-mode selector) and the **ensemble
   field** (formation geometry, collision avoidance, mirroring).
7. Precomputing and shipping an `analysis.json` per track instead of
   decoding client-side on every load.

None of these are started. Nothing above should be assumed working.

---

## 6. Your moves (canon D8-17, 19 October 2026)

**Decided by the owner (2026-10-19):** film yourself dancing to a song, and
Dance8 reads the dance as Kirtled move words. The same reading will style the
skaters (D8-18) and drive the dancers' motion references (next pass). This is
the first real pose source in Dance8. It reads the owner's own takes; it is
not a rigged-dancer system (§5 item 3 stays deferred).

**How a take is read** (`npm run dance8 -- moves <song> <video>`):

1. **Sync.** `stuttr analyze` saves the song's onset pattern with its analysis
   (Dance8 never reads the song's audio, D8-14). The take's own sound is slid
   against it, with whatever repeats bar to bar removed so a drum loop cannot
   match a bar off. The match must beat every other position by a clear margin
   and both halves of the take must agree, or the take is refused and you give
   `--offset`. This is the only link between the video's clock and the song's
   (D8-02).
2. **Body points.** ffmpeg cuts the video into frames in a temporary folder. A
   page on your computer runs Google's MediaPipe Pose (pinned
   `@mediapipe/tasks-vision@1.0.1`, model downloaded once into the library) and
   sends the 33 points per frame back to the Terminal. The video never leaves
   your computer and is never copied into the library or the repo.
3. **Per beat.** Energy, level, the body zones that lead, travel, turn, jumps,
   stillness and where in the beat the body hits hardest. Lengths are in your
   own torso lengths and body-widths, so distance from the camera does not
   change them. Across and up-down motion comes from the image; motion toward
   the camera comes from MediaPipe's 3D estimate, smoothed. A beat the camera
   cannot read is unknown, never filled in.
4. **Words.** `lib/dance8/moves/words.ts`. All words are kept, even when two
   fall together (a jumping spin is TI and KA).

| Word | Move | Read when | Tuning (code constants) |
|---|---|---|---|
| DO | STOMP | one foot hits down hard on a beat | lifted at least 0.15 torso, comes down at 2.5 torso/s or faster, lands within 0.2 beat of a beat, other foot down |
| RA | ROLL | the hips move at least half a body-width within a bar | groove sway smoothed out over a beat; one RA per bar of travel |
| LA | FLIP | the hips change level without travelling | bands: floor under 0.4, low under 0.75 of standing hip height; the new level holds a beat |
| KA | SPIN | a turn of 180° or more within a bar | read to about ±15°; tracker left/right swaps undone |
| TI | JUMP | both feet leave the floor | at least two frames; timed at the landing |
| FREEZE | FREEZE | holding still for a beat or more | mean joint speed under 0.35 torso/s |

**Files** (in `~/StuttrLibrary/<song>/dance8/moves/`, never in git):
`<take>.poses.json` (the body points), `<take>.moves.json` (beats and words,
a draft) and `README.txt` (a readout per section and every move). Run
`npm run dance8 -- moves <song>` with no video to rebuild every take after
editing the cue map; `--offset` replaces a take's sync.

**Filming.**

- Play the song out loud from a speaker, not headphones. The sync listens for it.
- Use a tripod and a still camera, with your whole body in frame, head to feet, and room to move.
- Use good light and a plain background, and wear clothes that stand out from it.
- Film alone, and somewhere that is not a work site (GOV-16).
- 60 fps helps fast moves.

**Limits.** A single phone camera reads turns and floor work least well, and
motion straight at the camera is a 3D estimate. Thresholds were set on
synthetic dancers with tracking noise up to four times what MediaPipe usually
shows (`tests/dance8/moves.test.ts`). The first real takes may call for
tuning; the constants are named and tested, and re-reading saved takes costs
nothing.

