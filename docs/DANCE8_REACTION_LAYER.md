# Dance8 visual reaction layer

Silent light drawn over a music video's footage, driven by what the song is doing: Genome Loom, Algorithmic Cypher and Resonance Chamber. Canon D8-25 (SPEC). It began as NEW-1 of the EDO (The Legacy) three-concept stress test, approved by the owner on 11 Nov 2026.

The layer is a visual effect. It does not show a working Kirtled instrument, live sensing, a laboratory measurement or a remix. The music, the masters and the choreography rules are untouched.

## Run it

Stuttr measures the song once, because Stuttr owns the masters; Dance8 reads only the saved file (D8-14):

```
npm run stuttr -- visual-features ~/Music/edo-master.wav --out ~/Music/edo.features.json --fps 24 --id edo
npm run dance8 -- react ~/Music/edo.features.json --windows ~/Music/edo-windows.csv --out ~/Movies/edo-reaction --base ~/Movies/edo-rough-cut.mp4
```

Measure at the footage's frame rate; `react` stops if they differ. `--expect-sha` (the master's sha256) makes it refuse a feature file measured from different audio. `--events` adds verified events (below). Everything runs offline; nothing is paid for.

Windows are where the effects go, as JSON (`{"windows": [{"id", "family", "scene", "musicStartSec", "musicEndSec", "intensity", "zone", "seed"}]}`) or as the proof package's CSV (`visual_family`, `song_start_s`, `song_end_s`, `source_scene`). They are editorial placements, not measured beats. A time that is off the frame grid is moved onto it, and the move is recorded.

## What comes out

For each window:

- `NN-family.overlay.mp4`: the effect alone on black, silent. In CapCut: Overlay, place it at the window's song time, Blend: Screen.
- `NN-family.overlay-reduced.mp4`: the same with nothing moving; only a one-second average of the loudness changes the brightness.
- With `--base`: `NN-family.original.mp4` (the footage and its sound) and `NN-family.hybrid.mp4` (the overlay Screen-blended over it, sound once).

For the run:

- `proof.hybrid.mp4`: every hybrid joined.
- `preview.html`: original and hybrid side by side in a browser, with an overlay switch, a reduced-motion switch (on when the system asks for reduced motion) and an opacity slider.
- `placements.csv`: CapCut times and hashes.
- `labels.draft.srt`: window names as an editable caption file, never painted into the picture (GOV-23).
- `reaction-manifest.json`: every input and output hash, the planned track with all its events and holds, and the checks.

## The three families

| Family | Draws | Moves with |
|---|---|---|
| Genome Loom | Seven warp threads across the lower frame, and knots that travel along them | Low band (sway), loudness (brightness), onset-like peaks (knots) |
| Algorithmic Cypher | A stage ring and three floor rays 120 degrees apart in plan (the TRI-01 seed in perspective), with light running outward | Mid band (how far the light travels), onset-like peaks (runners); a verified chord change adds a landing ring |
| Resonance Chamber | Three triadic contours with ripples and spikes, inspired by ferrofluid but simulated | Low band (size), high band (ripple), mid band (spike length) |

Each family draws only inside its zone (the lower frame for the Loom and the Cypher, the lower right for the Chamber), so faces, mouths and captions stay clear. A window's `zone` moves it to fit the footage.

## Evidence

| Event | State | Drawn |
|---|---|---|
| Energy envelope (loudness, bands) | MEASURED | Brightness and size only |
| Onset-like peak | MEASURED, never a verified beat | As light (D8-03) |
| Beat, chord change, move word, lyric chop | VERIFIED only with a named reviewer | Chord change: a landing ring. Lyric chop: a magenta knot. Beat and move word: the caption file, never the picture |
| Any of those without verification | HOLD | Nothing |

Verified events come in a file like `{"events": [{"kind": "chord_change", "musicSec": 60.0, "label": "Em", "evidence": {"state": "VERIFIED", "reviewer": "Owner", "source": "chord chart v1"}}]}`. An event without the state and a reviewer is held, and the run lists it.

## Checks every run makes

- Each overlay has exactly its window's frames, and no audio stream.
- Each hybrid and the proof have the sound once.
- At most three flashes a second in any part of the frame.
- The same inputs give the same frames: the first window is drawn twice and the raw frames compared.
- The footage file is unchanged.

A bad or mismatched feature file, or a bad window, makes nothing renderable for it. The edit then keeps its source footage.

## The EDO proof (11 Nov 2026)

The three ChatGPT placements were rendered from the EDO master (sha256 `aaf4f482…`, 125.92 s, 48 kHz):

- Genome Loom at 0:29.50 to 0:33.50 (SC06).
- Algorithmic Cypher at 0:58.00 to 1:05.25 (SC05).
- Resonance Chamber at 1:37.00 to 1:43.50 (SC06).

That is 4.00 + 7.25 + 6.50 = 17.75 s, or 426 frames at 24 fps. All checks passed. The Cypher's chord changes, beats and move words are held, because no verified chord chart or synced dance take exists for EDO.

The "real uploads" rough cut ChatGPT used was not in the package. The previews composite over the package's clean rough cut, where SC05 and SC06 are stills. The overlays themselves go over the real cut in CapCut at the same song times.

## Not built

- The overlay toggle inside the Dance8 app.
- Alpha-channel exports (Screen blend over black is the compositing format).
- Any link to a physical instrument, stage or sensor.

Rollback: delete the output folder, or leave the overlays off the timeline.
