# Plate8 — canonical spec

**This file supersedes** *ChatGPT to Claude — Plate8 Entertainment App Support* (PDF), *Claude to ChatGPT updates* (RTF), and the two concept boards (the neon hub and the n8n-captioned tile grid). Where they disagree, this file wins. Change it here first, then build.

Last reconciled: 19 October 2026 (Plate's rules: section 8c).

---

## 1. What Plate8 is

Six computational instruments in one engine, living inside PropOps8 at `/plate`. It is a personal rig with one user. Each module computes something real; the frontend's job is to reveal that computation clearly and beautifully. All six modules feed one shared river.

| Module | Colour | Does |
|---|---|---|
| **State** | pink `#F462A6` | Audio analysis, voice recording, sealed chat |
| **Mate** | green `#00BE5F` | Chess vs. its own engine, with a movement-geometry layer |
| **Skate** | blue `#6496FF` | Autonomous racing — four controllers on a solved line |
| **Plate** | platinum white `#E8ECF5` | California plate word game |
| **Slate** | violet `#B97BFD` | Video discovery, seeded to Daniel's interests |
| **Late** | cyan `#00BAE1` | News, podcasts, original dispatches, the shared river |
| *home* | neutral `#DCD8F2` | The suite: six live cards and the activity stream |

---

## 2. Rulings on the conflicts

The written ChatGPT spec and the build agreed on almost everything; ChatGPT had worked from screenshots of the build. The concept boards were the real conflict, because they break the written spec's own rules.

| Topic | Concept boards | Written spec | **Ruling** | Why |
|---|---|---|---|---|
| Behaviour | — | Six computational modes, detailed backlog | **Written spec governs** | It matches what exists and is a sound backlog |
| Layout | Hub with six cards + live activity | "Visual shell already coherent" | **Hub adopted** | Best idea on the boards; the app had no landing page |
| Figures | "12,458 users", "99.9% uptime", testimonial | "No fake metric presented as real" | **Real figures only** | One-user rig: every card number comes from that module's engine |
| Colours | All six reshuffled; Skate orange | "Preserve each module's accent" | **Current palette kept** | Daniel set it (no yellow, no brown, bound to function); orange drifts toward yellow |
| Intensity | Heavy neon glow | "No gratuitous neon, tiny bloom" | **Restrained** | Coloured soft shadow, not glow. Glow strength is one CSS token if taste changes |
| Name | Plate8 | Plate8 | **Plate8** | Fits the 8-convention; stops the suite colliding with its own `plate` page |
| Branding | n8n logo and name on one board | — | **Excluded** | n8n is a real company; its mark does not belong on this product |
| Plate realism | "CAL ABC 123 / The Golden State" | "Game UI, not a printable credential replica" | **Design kept, legend changed** | The stamped plate stays; `dmv.ca.gov` became `plate8` |
| Plate data view | Word-derivation tree (both boards) | — | **Built, computed** | A real graph of the plate's word space, spoiler-free |
| Chess engine | — | "Stockfish where appropriate" | **Own engine stays** | Negamax α-β + quiescence, perft-verified, zero dependencies. Stockfish optional later |
| Slate interests | Generic shows | Architecture, property, AI, spatial, design… | **Union** | Daniel's music crates + the professional lanes (Phase 2) |
| "Zero TypeScript errors" | — | Gate 1 | **Applies to the `.ts` files** | The rig itself is plain JS, checked by `node --check` and the harness |
| Palette (visual-parity sprint) | A third mapping, again reshuffled | "Preserve each module's accent" | **Reverted to the canonical six** | Two boards proposed two different remaps; the accents are bound to function and to the engine emblem, so they stay |
| Desktop hub | Six narrow "towers" | — | **3 × 2 control deck** | Towers made every hero graphic too narrow to read; the deck keeps the engine and the live stream down the side |
| Glass | Heavy blur everywhere | "Restrained translucency" | **Settled glass, no live backdrop blur** | `backdrop-filter` over a canvas that repaints every frame re-blurs the whole surface every frame: 60fps → 15fps. The same depth comes from a layered translucent surface |
| Phone stage height | 120–160px minis | — | **196px (Skate 228px)** | Below ~190px the computed graphics stop being legible; Skate needs the extra band for its two keys |

---

## 3. Design standard

Adopted from the written spec, unchanged:

- dark information field · precise geometry · soft shadows · subtle translucency · controlled gradients · **one accent per domain** · data-driven motion · tiny amounts of bloom · strong hierarchy
- **magnitude → size · confidence → opacity · direction → vector · relationship → connection · time → movement · intensity → glow · uncertainty → diffusion**

Added:

- **One light, upper left, for the whole rig.** The plate's bevel, State's spheres and the hub cards all obey it.
- **Nothing moves unless the data under it moved.** No idle animation, no particles, no timers writing to the activity log.
- **No figure without a source.** If a number is on screen, a module computed it.
- **Empty states say what to do**, in one line, in the module's voice.
- **Four perceived depths on every surface:** L0 the field (`--l0`, dot grid, one key light) → L1 the shell (`--l1s`, lit edge, cast shadow) → L2 the recessed canvas (`--l2 #04050A`, inset shadow, faint grid) → L3 the foreground (figures, controls, status).
- **The instrument's colour is spent only where it is true**: the current rail key, a live card's edge, active data marks, the peaks of a visualization. Dormant chrome is neutral.
- **A drawing never says a word the player has not earned.** Plate's marks carry an index into an in-memory list, not the word, unless it is found or the reveal is on.

---

## 4. Architecture

One application core ("Plate OS" in the written spec). It is the ARC kernel inside `public/plate/index.html`.

**The kernel owns:** routing, the single rAF clock, the HUD, storage (profile save/load), canvas sizing, error isolation (`mod()` guard + `FAULTS`), the **share bus** (`BUS`), the **activity log** (`LOG`), and `ARC.ensure()` for warming a module without switching to it.

**The module contract:** `{ id, label, panes, mount, enter, exit, tick, bg, pane, gauges, save, load, card, cardDraw, live, search }`.

| Hook | Does |
|---|---|
| `card(sz)` | `{ mini, line, live, status }` — the module draws its own miniature at the hub's real stage size |
| `cardDraw(cv)` | Redraws a canvas miniature in place (State's waveform, every frame while a track plays) |
| `bg(dt, now)` | A background tick the kernel runs for a mounted module that is not the current one, so State keeps measuring from anywhere |
| `live()` | Is this engine producing right now — drives the deck bar, the card edge and the rail's live dot |
| `search(q, hit)` | The module answers the suite-wide search with its own material, spoiler-free |
| `playNow()` | Slate only: start the current video from the hub card |

**P8, the visual primitive library**, is the shared vocabulary every instrument composes from, so six modules inherit one lighting model, radius system and type scale:

| Primitive | Is |
|---|---|
| module-card `.hc` · glass-panel `.card` / `.p8-glass` | L1 shells with the lit edge |
| canvas-frame `.hcm` | the L2 recess a computation is drawn into |
| section-header `.hch` · telemetry-row `P8.row` / `.kv` · data-chip `P8.chip` | L3 furniture |
| metric-hero `P8.metric` · mini-chart `P8.spark` · `P8.dial` | figures with their trend and history |
| accent-button `.hcb` / `P8.cta` · pane tabs `.htb` | the ways in |
| empty-state `P8.empty` · `P8.note` · `P8.legend` | what to do when there is nothing yet, and what a mark means |
| `P8.node` · `P8.edge` · `P8.vec` · `P8.arc` · `P8.bloom(id,col,sd,box)` · `P8.frame(sz,W,H)` | the drawing kit: marks, links, vectors, bloom with an explicit user-space box, and the mapping from a viewBox to the stage it lands in |

Two SVG rules the rig learned the hard way, both pinned by tests: **a filter or gradient sized from the bounding box erases a level or vertical line** (use `userSpaceOnUse`), and **a duplicate filter id in a hidden copy stops the visible copy drawing** (every copy takes a suffix).

**The shared artifact** is the bus item — `{ id, t, from, kind, title, body, url, meta }` — equivalent to the written spec's `SharedArtifact`. Capped at 64, deduplicated, persisted.

**Server routes** (Next 16, `app/api/`):

| Route | Does |
|---|---|
| `/api/health` | Lets the rig detect that a backend exists |
| `/api/rss?url=` | Server-side RSS fetch with an SSRF guard — news and podcast feeds |
| `/api/yt?q=` · `?channel=` | YouTube search and channel feeds. Uses `YOUTUBE_API_KEY` if set, otherwise reads YouTube's own page (keyless, unofficial) |

---

## 5. Status against the written spec

✅ built · 🟡 partial · ⬜ next

**State.** ✅ loudness (RMS), spectral centroid, 14 log bands, onset detection and onset map, co-activation edges, lit node field, share to Late, live mic input, voice recording. ⬜ spectral rolloff, BPM, transient strength, dynamic range, stereo energy, spectrogram, waveform scrubber, notable moments, compare-two-tracks, export analysis JSON, receive audio from Late.

**Mate.** ✅ legal engine, per-piece geometry (knight ring at √5, slider rays with blockers, pawn-structure openness), mobility and control field, advantage curve, Casual/Steady/Sharp change search depth (2/3/4), Blitz clock, blunder and inaccuracy detection, FEN on share. 🟡 contextual geometry on selection. ⬜ engine in a Web Worker, king safety, centre pressure, coordination, tactical tension, motifs, geometry snapshots.

**Skate.** ✅ spline tracks (three presets + Draw), obstacles and ramps, four genuinely different controllers (pure pursuit, Stanley, follow-the-gap, adaptive), LiDAR occupancy mapping, rivals in the scan, minimum-curvature racing line, forward–backward velocity profile, friction circle with understeer, deck-to-deck contact, sectors, grip telemetry. ⬜ replayable telemetry, braking-zone overlay, steering vectors, deviation heatmap, per-agent predicted path.

**Plate.** ✅ the owner's original rules (section 8c): look-alike readings, plate value scoring, three levels open from the start, words from one to seven letters; 10-plate runs, validation, Any/In-order validation, stamped SVG plate with tilt and glare, derivation tree, streak, best run, best word, plate history, near-miss hints. ⬜ speed and accuracy scores, a transition between plates.

**Slate.** ✅ 14 crates seeded to Daniel's music and building interests, per-crate searches, `/api/yt` search and channel follow, oEmbed titles, watch state and progress, sort and filter, import/export, share. ⬜ weighted "For You" ranking; the written spec's lanes (Architecture, Property, AI/Tech, Spatial, Design, Documentary) merged with the music crates; `topics` and `relevanceScore` per item.

**Late.** ✅ the river (news + shared + dispatches), Feed/Casts/Sources, podcast search/shelf/player, eight original dispatches plus seeded intercepts, today's dispatch on the hub. ⬜ episode topics and property relevance, transcripts, Send audio → State, dispatch continuity metadata (characters, entities, arcs, unresolved questions).

**Home.** ✅ six live cards drawn by each module from their own state, the activity log, the engine emblem with packets that run only when a share is really made, the deck bar (live status, time-share mark, suite-wide search on ⌘K / `/`), the 3 × 2 control deck at ≥1360px, and stat chips that count only what happened.

---

## 6. Phase 2, ranked

1. **Skate overlays from data already computed** — braking zones (where the profile falls), steering vectors, per-agent predicted path. High payoff, no new physics.
2. **State depth** — spectrogram, rolloff, BPM, dynamic range, export JSON.
3. **Mate engine in a Web Worker** — gate 8 (heavy compute must not block) is the one known gap. Then king safety, centre pressure, knight arcs on selection.
4. **Late → State** — analyse a podcast episode acoustically.
5. **Slate "For You"** — weighted interest profile across the merged lanes.
6. **Dispatch continuity** — structured characters/entities/arcs so the serial can grow coherently.
7. **Desktop split panes** — play and data side by side at wide widths.
8. **Skate telemetry replay.**

---

## 7. Acceptance gates

1. The `.ts` files type-check (`npx tsc --noEmit`).
2. Zero console errors during normal interaction.
3. No dead buttons.
4. No fabricated figure presented as real.
5. Refresh preserves appropriate state.
6. Every mode works at phone (393×852) and desktop (1440×900).
7. 60 fps target for ordinary animation.
8. Heavy computation does not block interaction. *(Known gap: Mate at Sharp.)*
9. Empty, loading and error states are deliberate.
10. Every major feature has an automated test.
11. Every navigation route is exercised.
12. Shared artifacts survive navigation and reload.
13. Same input, same analytical result where it should be.
14. Screenshots reviewed after each major pass.
15. The whole suite reruns after every fix.

**Running them** (from the repo root; `jsdom` is the one extra dependency):

```sh
npm i -D jsdom                        # once
node scripts/plate8/audit.cjs         # 68 checks: every page, pane, share path, save/load, the hub
node scripts/plate8/regress.cjs       # 14 checks: the first review's six bugs, pinned
node scripts/plate8/regress2.cjs      # 22 checks: the second review's fourteen bugs, pinned
node scripts/plate8/plate-test.cjs    # 15 checks: derivation tree, streaks, bests, history
node scripts/plate8/regress3.cjs      # 46 checks: palette, the four depths, the engine, every card
                                      #            against real state, the deck bar, spoiler-free
                                      #            search and markup, the dictionary, no live blur
node scripts/plate8/rules-test.cjs    # 23 checks: the owner's rules (section 8c), worked examples,
                                      #            what each level deals, the level chips
node scripts/plate8/drive.cjs         # walks all panes, reports canvas work and faults
```

With a real browser (Playwright; Chromium is already installed):

```sh
RICH=1 node scripts/plate8/live.cjs 1440x900 shots/d home:hub plate:play     # live data, then screenshots
RICH=1 node scripts/plate8/live.cjs 393x852 shots/m home:hub --full          # the phone, full length
```

---

## 8. This pass — the visual parity sprint (28 September)

**What changed.** Every instrument now draws its own computation as its identity, at the hub and inside the module, through one shared primitive library and one depth stack.

- **Plate** — the plate is the hero object over a platinum floor reflection (vermilion in this pass's original write-up, magenta from 2026-10-02, platinum white from 2026-10-18 — see sections 8a and 8b); banked letters fly from the plate cells into the tree; word lengths are translucent depth planes; found words are lit spheres, one-away words hollow rings, the rest dots; the derivation chain is drawn thick.
- **Skate** — LiDAR occupancy behind the circuit, kerbs where curvature peaks, braking glow under the line, per-deck predicted paths and aim crosshairs, steering vectors, and a band carrying the friction circle and the SCAN → MAP → LINE → TRACK → ACT stack. The two keys take columns or strips, whichever leaves the circuit larger.
- **State** — waveform (peak outer, true RMS core) over the co-activation network and the spectral landscape, with the centroid marked; the card is a canvas redrawn every frame while a track plays, and `bg()` keeps the analysis running from any page.
- **Mate** — the geometry layer on the board (defenders, attackers, knight rings, slider rays), an evaluation bar beside it, and a card carrying the advantage curve — which only exists after the first move.
- **Slate** — crate constellation, watch-state timeline, a transport wired to the YouTube player, and Play from the hub.
- **Late** — the river as a widening stream with tributaries sized by what each has contributed, a podcast scope drawn from the real analyser, and the Feed's river filterable by tributary.
- **The suite** — deck bar with live status, the time-share mark and suite-wide search (⌘K); the rail key for the instrument you are in lights in its colour while the rest stay dormant, and an instrument still producing keeps a live dot.

**Fixed after this pass's independent review** (all pinned in `regress3.cjs`):

- `backdrop-filter` on the stage, the cards, the hero and the legends re-blurred those surfaces every frame: the hub with a track playing ran at 15fps, Skate's ride at 15fps. Settled glass restored 60fps on both.
- The status pulse, the activity breath and the engine's flow animated box-shadow, blur and dash — now a composited ring and an unfiltered stroke.
- Mate's card drew a two-point evaluation curve before any move existed; it now says the curve starts at your first move.
- The derivation tree wrote every unfound word into the DOM as `data-w`; marks now carry an index into an in-memory list.
- The hub refreshed on a frame count read as milliseconds (0.75/s, slower when busy); it now keeps a quarter-second beat in real time.
- `--dim` was 2.86:1 against the field — every small mono label sat on it. Now 4.6:1.
- Late's river figure excluded shares while the drawing included them; Skate saved a circuit id it threw away on load; the hub's minutes were counted three ways.
- The word list, which came from web text, carried slurs, profanity and porn-spam tokens — 68 entries removed from the dictionary and pinned by hash.
- The plate's accessible name still said "California licence plate"; the registration sticker's yellow-on-brown years were replaced.

---

## 8a. Revenue-reactive brand pass (2 October 2026)

**Context.** Daniel supplied a new family of glossy chrome/neon logo renders (Pulse8, Skate8, Late8, Slate8, State8, Plate8, plus the unrelated Transect and Lumen marks) and asked for two things: the PropOps8 wordmark's existing cyan/magenta "8" to react to revenue instead of auto-cycling on a timer, and the Plate8 suite's accents to move toward that same cyan-magenta family. Decision recorded here per this file's own rule ("change it here first, then build").

- **PropOps8 header mark** (`components/SiteHeader.tsx`) — the `propops8-eight-pulse` animation (a 4s auto-loop between `#03edff` and `#f11aff` since it was first built) is replaced with a state read from a manual revenue-trend flag: cyan when flagged up, magenta when flagged down, neutral/dim when unset. No live sales feed exists in this codebase yet (`lib/products.ts` is static pricing; `scripts/revenue-path-check.mjs` only checks that the funnel's pages and links resolve) — wiring a real feed (most likely Gumroad's API) is follow-up work, tracked separately. Applies site-wide wherever the shared header renders.
- **Plate8 accents** — State (h332), Skate (h221), Slate (h269) and Late (h190) already sat inside the cyan-to-magenta arc the new marks use and are untouched. Plate was the outlier (vermilion, h7) and moves to magenta (`#F96DF2`, h303) — chosen so it keeps >=25° of hue separation from every other instrument (the near-twin regression in regress3.cjs), verified by rerunning the full suite (164/164) after the change. The five other token values (`-2/-ink/-deep/-bg`) were re-derived from State's and Slate's own light/sat curves at h303, not guessed, so Plate's bevels, floor glow and derivation-chain colour stay internally consistent with the rest of the palette's logic.
- **Mate** has no corresponding new mark and keeps its green (`#00BE5F`) unchanged — restyling it would be inventing a design with no reference.
- **Harness bug found and fixed in the same pass.** Every script in `scripts/plate8/` that reads the rig's HTML directly (`boot.cjs`, `drive.cjs`, `look.cjs`, `live.cjs`, plus inline reads in `regress2.cjs` and `regress3.cjs`) pointed at `scripts/public/index.html`, which has never existed — stale from before Plate8 moved under `public/plate/`, and one `..` short of the repo root besides. `npm i -D jsdom` (per section 7) plus this path fix were both needed before any of the suite would run at all; fixed in all six places, and the full suite (`audit` 68, `regress` 14, `regress2` 22, `regress3` 45, `plate-test` 15 — 164 total) passes clean both before and after the colour change.

---

## 8b. Plate leaves magenta (18 October 2026)

**Decision (owner, 2026-10-18):** Plate's accent moves from magenta `#F96DF2` to platinum white `#E8ECF5`. Magenta is PropOps8's canonical critical-risk colour, and the canon rule is that an instrument's identity colour never reads as a warning (canon PL8-06, PL8-08; `lib/canon/`). Platinum is the plate's own colour and carries no state meaning.

- Tokens in `public/plate/index.html`: `--t-plate #E8ECF5`, `-2 #FFFFFF`, `-ink #141821`, `-deep #8A93A6`, `-bg #22252E`, `-h 222`. Every rule, SVG and canvas already reads these, so nothing else changed.
- `scripts/plate8/regress3.cjs`: the canonical palette is now pink, green, blue, platinum, violet, cyan. A near-neutral accent (chroma under 0.12) is told apart by lightness rather than hue, so it is left out of the 25-degree hue-gap test and checked instead for being light and nearly colourless.
- Known, not changed: Late's cyan and Mate's green sit on the semantic cyan and green, and State's pink is close to magenta. Plate was the one the owner chose to move.

---

## 8c. The owner's original rules (19 October 2026)

**Decision (owner, 2026-10-19):** Plate's old rules are replaced by the owner's original notes for the game. The name stays Plate8; the notes called it Pl8.

**Reading a plate.** A number reads as the letter it looks like: 0 is O or D, 1 is I, 2 Z, 3 E, 5 S, 6 G, 7 L, 8 B, 9 P. A 4 looks like no letter, so it is only a number and shows as `#` in the reading row.

**Points.** Every character on the plate has a value. A number is worth its face value; a letter is worth the number it looks like (B 8, D 0, E 3, G 6, I 1, L 7, O 0, P 9, S 5, Z 2); any other letter is worth 0. A banked word scores the plate's value plus a bonus:

| Word | Bonus |
|---|---|
| uses every character on the plate | +100 |
| uses every character of a vanity plate (Level 3) | +1000 |
| any other word | +50 |

Worked examples, pinned in `rules-test.cjs`: 6ALL095 is worth 34, so GALLOPS scores 134 and ALL scores 84. 0ESP017 is worth 25 and DESPOIL scores 125, because 0 reads as D. 1A11111 is worth 6 and the one-letter word A scores 56.

**Three levels, all open from the start:**

1. **All characters.** A special plate, `#XXX###`, where the whole plate spells a word once its numbers are read as letters. Dealt from 657 common seven-letter words whose first letter and last three letters each look like a number.
2. **Least letters.** Standard `#XXX###` plates, and one plate in four a business plate, `#X#####`. Find the word with the fewest letters. Every deal has a word of four letters or fewer.
3. **All letters.** A vanity plate: seven letters, a common word scrambled. It reads in any order (the In order chip is off), and using all seven letters is worth +1000.

Saves from the old formats land on a level: classic and short on Level 2, vanity on Level 3.

**The dictionary.** Words run from one letter to seven; the old three-letter minimum is gone.

- One and two letters: *a* and *i*, plus 44 chosen two-letter words.
- Three to six letters: the existing list.
- Seven letters: SCOWL at size 50 (notice in `docs/licenses/SCOWL.txt`), plus *seedpod* from the notes.
- Profanity is filtered when the list is built: the hashes already pinned in `regress3.cjs`, plus two published lists (`badwords-list`, `leo-profanity`).
- The result is 20,407 words. The 6,705 common seven-letter words (SCOWL size 35) are the ones that get dealt.
- Rebuild with `scripts/plate8/build-dict.cjs`. It names the npm packages it needs and installs nothing into `package.json`.

**Where the notes and the rule disagree.** SKIPPPY was written as 34, but the rule gives 33 (5 + 0 + 1 + 9 + 9 + 9 + 0). The rule governs. SKIPPPY is not in any word list, so it cannot be banked; the vanity bonus is tested on a scramble of GALLOPS instead.

**Not built.** The rest of the notes were the owner's tests of personal alphanumeric plates and of the scoring. They informed the worked examples above but are not game modes. Plates in the notes that could belong to real people stay out of the repo.

---

## 9. Earlier passes

- Home hub with six live cards and the activity stream. Plate8 identity; the wordmark goes home; diagnostics moved to its own button.
- Activity log in the kernel, fed by real events: games, blunders, laps, banked words, runs, videos, feeds, intercepts, shares.
- Desktop: rail moves to the left edge past 1000px; the chessboard fits the height it has. At 1280×640 the old layout cut off the top and bottom ranks.
- Plate: derivation tree, streaks, best run and best word, recent plates, near-miss hints; legend `dmv.ca.gov` → `plate8`.
- Profile restore now repaints the current page, which previously showed defaults until you navigated away and back.
- A second independent review found fourteen bugs in this pass; all are fixed and pinned in `regress2.cjs`. The notable ones: found-word dots missing in Plate's Data pane (duplicate SVG filter id), the fault bar crushing the desktop stage, an import path that could inject script into the hub (video ids are now validated at every entry point), format changes that re-rolled plates for free and padded runs, and Mate's blunder log mislabelling trades (it now compares quiescence-resolved positions — false "engine slipped" entries fell from 5 to 1 over the same 185 random moves).
