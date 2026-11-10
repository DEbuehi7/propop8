/**
 * The Kirtled study's canonical example, checked against the built solver:
 * C -> Em -> G -> Gm -> G -> Em -> C crosses hi-hat, kick, snare, snare, kick,
 * hi-hat with move words RA, RA, LA, LA, RA, RA (study fece7f38, pages 2-4).
 * The chords are the study's synthetic example, not a Stuttr song.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TempoSegment } from "../../lib/dance8/contracts/scene";
import type { HarmonyEvent, HarmonyTimeline } from "../../lib/dance8/contracts/harmony";
import { cross, keyTriads, sideBetween, triad, triadName } from "../../lib/dance8/harmony/lattice";
import { readChord } from "../../lib/dance8/harmony/chords";
import { planKirtled } from "../../lib/dance8/harmony/pathSolver";
import { vocab } from "../../lib/canon";

const T120: TempoSegment[] = [{ startBar: 0, bpm: 120, beatsPerBar: 4 }];
const SEQ = vocab.KIRTLED_CANONICAL_SEQUENCE;

test("kirtled canon: C major's six triads with diminished omitted; relative minor of C is Am", () => {
  const names = keyTriads(0, "maj").map(triadName).sort();
  assert.deepEqual(names, vocab.KIRTLED_C_MAJOR.map((c) => c.chord).sort());
  assert.equal(triadName(cross(triad(0, "maj"), "R")), "Am");
  assert.ok(!keyTriads(0, "maj").some((t) => triadName(t) === "Gm"), "Gm is chromatic in C major");
});

test("kirtled canon: each crossing in the example is one side, mapped to the study's drum cue", () => {
  const sides = SEQ.chords.slice(1).map((c, i) => {
    const from = readChord(SEQ.chords[i]).anchor;
    const to = readChord(c).anchor;
    assert.ok(from && to, `unreadable chord in ${SEQ.chords[i]} -> ${c}`);
    return sideBetween(from, to);
  });
  assert.deepEqual(sides, ["L", "R", "P", "P", "R", "L"]);
  assert.deepEqual(sides.map((x) => vocab.KIRTLED_SIDE_CUES[x as "R" | "L" | "P"]), [...SEQ.cues]);
});

test("kirtled canon: the solver plays the example with the canonical words and cues", () => {
  const events: HarmonyEvent[] = SEQ.chords.map((symbol, i) => ({ id: `c${i}`, startBar: i, startBeat: 0, symbol }));
  const tl: HarmonyTimeline = {
    id: "kirtled-canon-example", schemaVersion: 1, trackId: "synthetic-canon", analysisProfileId: "synthetic-profile",
    events, approvalStatus: "approved", approvedBy: "canon-test",
  };
  const { plan } = planKirtled(tl, T120);
  assert.ok(plan, "solver returned no plan");
  const moves = plan!.moves.filter((m) => !m.passThrough);
  assert.deepEqual(moves.map((m) => m.word), [...SEQ.words]);
  assert.deepEqual(moves.map((m) => m.cue), [...SEQ.cues]);
  assert.equal(plan!.leaps.length, 0);
  assert.ok(plan!.moves.every((m) => m.sounding === false), "song-following never adds sound");
});

test("kirtled canon D8-20: the six-move table agrees with every list it restates", () => {
  const t = vocab.KIRTLED_MOVE_TABLE;
  assert.deepEqual(t.map((r) => [r.word, r.move]), vocab.KIRTLED_MOVES.map((m) => [m.word, m.move]), "same words and moves, same order");
  const body = (w: string) => vocab.KIRTLED_BODY_MOVES.find((b) => b.word === (w === "DASH" ? "FREEZE" : w))!;
  const trick = (w: string) => vocab.KIRTLED_SKATE_TRICKS.find((k) => k.cue === (w === "DASH" ? "HOLD" : w));
  for (const r of t) {
    assert.equal(r.dancer, body(r.word).detectedWhen, `${r.word} dancer is D8-17's`);
    assert.equal(r.skater, trick(r.word)?.label ?? null, `${r.word} skater is D8-16's`);
    assert.equal(r.colour, vocab.KIRTLED_WORDMARK[r.word[0] as keyof typeof vocab.KIRTLED_WORDMARK], `${r.word} takes its letter's wordmark colour`);
    for (const side of r.sides) assert.ok(side in vocab.KIRTLED_SIDE_CUES, `${r.word}: ${side} is a side with a cue`);
  }
  // A move word never names a drum: the drum is the crossed side's.
  assert.deepEqual(t.find((r) => r.word === "LA")!.sides, ["P"]);
  assert.equal(vocab.KIRTLED_SIDE_CUES.P, "snare");
  assert.deepEqual(t.find((r) => r.word === "TI")!.sides, ["jump"]);
  // KA orbits a corner: around C it crosses R, L, P in turn and comes back after six.
  let x = triad(0, "maj");
  const orbit = [triadName(x)];
  for (let k = 0; k < 6; k++) { x = cross(x, (["R", "L", "P"] as const)[k % 3]); orbit.push(triadName(x)); }
  assert.deepEqual(orbit, ["C", "Am", "F", "Fm", "Ab", "Cm", "C"]);
  // DO and DASH are the performance-mode moves (D8-08), not built.
  assert.deepEqual(vocab.KIRTLED_MOVES.filter((m) => !m.builtInSongFollowing).map((m) => m.word), ["DO", "DASH"]);
});

test("kirtled canon D8-22: the trio sits low to high on the A minor triangle, in the wordmark's colours", () => {
  const trio = vocab.KIRTLED_TRIO;
  assert.deepEqual(trio.map((p) => p.mapNote), ["A", "C", "E"]);
  assert.equal(triadName(triad(9, "min")), "Am");
  const palette = new Set<string>(Object.values(vocab.KIRTLED_WORDMARK).filter((c) => c !== "white"));
  for (const p of trio) assert.ok(palette.has(p.colour), `${p.name}: ${p.colour} is a wordmark colour`);
  assert.equal(new Set(trio.map((p) => p.colour)).size, 3);
});
