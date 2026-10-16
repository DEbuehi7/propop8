/**
 * Kirtled song-following solver: lattice math, chord reading, routes, timing.
 * All chord timelines here are synthetic test progressions, not Stuttr songs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { TempoSegment } from "../../lib/dance8/contracts/scene";
import type { HarmonyEvent, HarmonyTimeline, Triad } from "../../lib/dance8/contracts/harmony";
import {
  corners, cross, keyTriads, neighborTri, pathBetween, SIDES, sideBetween, triad, triadAt, triadName,
  triadNotes, walkPath,
} from "../../lib/dance8/harmony/lattice";
import { readChord } from "../../lib/dance8/harmony/chords";
import {
  absBeat, planKirtled, posAt, secAtBeat, slotBeats, validateHarmony,
} from "../../lib/dance8/harmony/pathSolver";
import { barToSec } from "../../lib/dance8/authoring/validateCueMap";

const T120: TempoSegment[] = [{ startBar: 0, bpm: 120, beatsPerBar: 4 }];
const ALL: Triad[] = Array.from({ length: 24 }, (_, i) => triad(i >> 1, i % 2 ? "min" : "maj"));
const name = (t: Triad | null) => (t ? triadName(t) : null);

let n = 0;
const ev = (startBar: number, startBeat: number, symbol: string, extra: Partial<HarmonyEvent> = {}): HarmonyEvent => ({
  id: `e${++n}`, startBar, startBeat, symbol, ...extra,
});
const timeline = (events: HarmonyEvent[], extra: Partial<HarmonyTimeline> = {}): HarmonyTimeline => ({
  id: "tl-test", schemaVersion: 1, trackId: "synthetic-track", analysisProfileId: "synthetic-profile",
  events, approvalStatus: "draft", ...extra,
});

// ---------------- lattice ----------------

test("lattice: every side shares two corners and matches R/L/P", () => {
  for (let a = -4; a <= 4; a++) {
    for (let b = -3; b <= 3; b++) {
      for (const t of ["U", "D"] as const) {
        const tri = { t, a, b };
        for (const s of SIDES) {
          const nb = neighborTri(tri, s);
          const shared = corners(nb).filter(([x, y]) => corners(tri).some(([p, q]) => p === x && q === y));
          assert.equal(shared.length, 2, `${t}(${a},${b}) ${s}`);
          assert.deepEqual(triadAt(nb), cross(triadAt(tri), s));
        }
      }
    }
  }
});

test("lattice: R, L and P each undo themselves, and neighbors share exactly two notes", () => {
  for (const t of ALL) {
    for (const s of SIDES) {
      assert.deepEqual(cross(cross(t, s), s), t);
      const shared = triadNotes(t).filter((p) => triadNotes(cross(t, s)).includes(p));
      assert.equal(shared.length, 2);
    }
  }
  assert.equal(sideBetween(triad(0, "maj"), triad(9, "min")), "R"); // C -> Am
  assert.equal(sideBetween(triad(0, "maj"), triad(4, "min")), "L"); // C -> Em
  assert.equal(sideBetween(triad(0, "maj"), triad(0, "min")), "P"); // C -> Cm
  assert.equal(sideBetween(triad(0, "maj"), triad(7, "maj")), null); // C -> G is not a neighbor
});

test("lattice: any triad reaches any other in at most 5 crossings", () => {
  let most = 0;
  for (const x of ALL) for (const y of ALL) most = Math.max(most, pathBetween(x, y).length);
  assert.equal(most, 5);
});

test("routes: C -> G goes through Em; a key keeps waypoints in the key", () => {
  const C = triad(0, "maj");
  assert.deepEqual(walkPath(C, pathBetween(C, triad(7, "maj"))).map(triadName), ["C", "Em", "G"]);
  const Cm = triad(0, "min");
  const F = triad(5, "maj");
  assert.deepEqual(walkPath(Cm, pathBetween(Cm, F)).map(triadName), ["Cm", "Ab", "Fm", "F"]);
  assert.deepEqual(walkPath(Cm, pathBetween(Cm, F, keyTriads(0, "maj"))).map(triadName), ["Cm", "C", "Am", "F"]);
});

// ---------------- chord reading ----------------

test("chords: exact, approximate and unresolved readings", () => {
  const cases: [string, string, boolean, string[]][] = [
    ["C", "verified", true, ["C"]],
    ["Am", "verified", true, ["Am"]],
    ["F#m", "verified", true, ["F#m"]],
    ["Bb", "verified", true, ["Bb"]],
    ["Cmaj7", "verified", true, ["C", "Em"]],
    ["Am7", "verified", true, ["Am", "C"]],
    ["C6", "verified", true, ["C", "Am"]],
    ["Ebmaj7", "verified", true, ["Eb", "Gm"]],
    ["C/E", "verified", true, ["C"]],
    ["Am7/G", "verified", true, ["Am", "C"]],
    ["G7", "approximate", true, ["G"]],
    ["Csus4", "approximate", true, ["C"]],
    ["C/Bb", "approximate", true, ["C"]],
    ["C6/9", "approximate", true, ["C"]],
    ["Bdim", "unresolved", true, []],
    ["Bm7b5", "unresolved", true, []],
    ["Caug", "unresolved", true, []],
    ["N.C.", "unresolved", true, []],
    ["H7", "unresolved", false, []],
    ["Cxyz", "unresolved", false, []],
    ["", "unresolved", false, []],
  ];
  for (const [sym, status, readable, lit] of cases) {
    const r = readChord(sym);
    assert.equal(r.status, status, sym);
    assert.equal(r.readable, readable, sym);
    assert.deepEqual(r.lit.map(triadName), lit, sym);
  }
});

test("chords: a seventh-chord diamond is two triangles that share a side", () => {
  for (const sym of ["Cmaj7", "Am7", "C6", "Ebmaj7", "F#m7"]) {
    const r = readChord(sym);
    assert.equal(r.lit.length, 2, sym);
    assert.notEqual(sideBetween(r.lit[0], r.lit[1]), null, sym);
  }
});

// ---------------- clock ----------------

test("clock: beats, bars and seconds agree with the cue map across a tempo change", () => {
  const tempo: TempoSegment[] = [
    { startBar: 0, bpm: 120, beatsPerBar: 4 },
    { startBar: 2, bpm: 90, beatsPerBar: 3 },
  ];
  assert.equal(absBeat(tempo, 2, 0), 8);
  assert.equal(absBeat(tempo, 3, 1), 12);
  assert.deepEqual(posAt(tempo, 12), { bar: 3, beat: 1 });
  assert.deepEqual(posAt(tempo, 7.5), { bar: 1, beat: 3.5 });
  for (const bar of [0, 1, 2, 3, 5]) assert.equal(secAtBeat(tempo, absBeat(tempo, bar, 0)), barToSec(tempo, bar));
  assert.equal(slotBeats(120), 1);
  assert.equal(slotBeats(70), 0.5);
  assert.equal(slotBeats(170), 2);
});

// ---------------- planning ----------------

/** Rules every plan must keep, whatever the input. */
function assertPlanRules(tl: HarmonyTimeline, tempo: TempoSegment[]) {
  const { plan } = planKirtled(tl, tempo);
  assert.ok(plan);
  const at = (e: HarmonyEvent) => absBeat(tempo, e.startBar, e.startBeat);
  const byId = new Map(tl.events.map((e) => [e.id, e]));
  const order = tl.events.map((e) => e.id);
  let last = -Infinity;
  for (const m of plan.moves) {
    assert.equal(m.sounding, false);
    assert.equal(sideBetween(m.from, m.to), m.side, "every crossing is a real shared side");
    const b = absBeat(tempo, m.atBar, m.atBeat);
    assert.ok(b >= last, "moves are in time order");
    last = b;
    const e = byId.get(m.eventId)!;
    assert.ok(b <= at(e) + 1e-9, "never after its chord");
    const i = order.indexOf(e.id);
    if (i > 0) assert.ok(b > at(byId.get(order[i - 1])!) + 1e-9, "never before the previous chord");
    if (!m.passThrough) assert.ok(Math.abs(b - at(e)) < 1e-9, "the arriving crossing lands on the chord");
  }
  for (const l of plan.leaps) assert.equal(l.sounding, false);
  assert.equal(plan.mode, "song_following");
}

test("plan: I-vi-IV-V in C, one chord per bar at 120 bpm", () => {
  const tl = timeline([ev(0, 0, "C"), ev(1, 0, "Am"), ev(2, 0, "F"), ev(3, 0, "G")], {
    keys: [{ startBar: 0, startBeat: 0, tonic: 0, quality: "maj" }],
  });
  const r = planKirtled(tl, T120);
  assert.equal(r.ok, true);
  const p = r.plan!;
  assert.deepEqual(p.stances.map((s) => name(s.anchor)), ["C", "Am", "F", "G"]);
  assert.deepEqual(p.leaps, []);
  // C->Am and Am->F are one crossing each; F->G takes four, all through in-key triangles.
  assert.deepEqual(
    p.moves.map((m) => [m.atBar, m.atBeat, name(m.to), m.side, m.word, m.cue, m.passThrough]),
    [
      [1, 0, "Am", "R", "RA", "kick", false],
      [2, 0, "F", "L", "RA", "hihat", false],
      [2, 1, "Am", "L", "RA", "hihat", true],
      [2, 2, "C", "R", "RA", "kick", true],
      [2, 3, "Em", "L", "RA", "hihat", true],
      [3, 0, "G", "R", "RA", "kick", false],
    ],
  );
  assert.equal(p.moves.at(-1)!.atSec, 6);
  assertPlanRules(tl, T120);
});

test("plan: C -> G glides through Em as a spin around G, landing on the downbeat", () => {
  const tl = timeline([ev(0, 0, "C"), ev(1, 0, "G")]);
  const { plan } = planKirtled(tl, T120);
  assert.deepEqual(
    plan!.moves.map((m) => [m.atBar, m.atBeat, m.atSec, name(m.to), m.word, m.cue, m.passThrough]),
    [
      [0, 3, 1.5, "Em", "KA", "hihat", true],
      [1, 0, 2, "G", "KA", "kick", false],
    ],
  );
  assertPlanRules(tl, T120);
});

test("plan: the speed limit sets crossing spacing by tempo", () => {
  const tl = () => timeline([ev(0, 0, "C"), ev(1, 0, "G")]);
  const slow = planKirtled(tl(), [{ startBar: 0, bpm: 70, beatsPerBar: 4 }]).plan!;
  assert.deepEqual(slow.moves.map((m) => [m.atBar, m.atBeat]), [[0, 3.5], [1, 0]]);
  const fast = planKirtled(tl(), [{ startBar: 0, bpm: 170, beatsPerBar: 4 }]).plan!;
  assert.deepEqual(fast.moves.map((m) => [m.atBar, m.atBeat]), [[0, 2], [1, 0]]);
});

test("plan: a far chord with no time to glide becomes a labeled leap, not a key change", () => {
  const tl = timeline([ev(0, 0, "C"), ev(0, 1, "F#m")]);
  const { plan } = planKirtled(tl, T120);
  assert.deepEqual(plan!.moves, []);
  assert.equal(plan!.leaps.length, 1);
  const l = plan!.leaps[0];
  assert.equal(l.reason, "too_far_for_tempo");
  assert.equal(l.word, null);
  assert.ok(l.crossingsNeeded >= 2);
  assert.equal(name(l.to), "F#m");
});

test("plan: TI only where the timeline's key changes, even after a held chord", () => {
  const keys = [
    { startBar: 0, startBeat: 0, tonic: 0, quality: "maj" as const },
    { startBar: 2, startBeat: 0, tonic: 2, quality: "maj" as const },
  ];
  const tl = timeline([ev(0, 0, "C"), ev(1, 0, "Am"), ev(2, 0, "N.C."), ev(3, 0, "D")], { keys });
  const { plan } = planKirtled(tl, T120);
  assert.equal(plan!.leaps.length, 1);
  assert.deepEqual(
    [plan!.leaps[0].reason, plan!.leaps[0].word, plan!.leaps[0].atBar, name(plan!.leaps[0].from), name(plan!.leaps[0].to)],
    ["key_change", "TI", 3, "Am", "D"],
  );
  // Same chords without key segments: no TI anywhere.
  const noKeys = planKirtled(timeline([ev(0, 0, "C"), ev(1, 0, "Am"), ev(2, 0, "N.C."), ev(3, 0, "D")]), T120).plan!;
  assert.ok(noKeys.leaps.every((l) => l.word !== "TI"));
});

test("plan: unresolved chords and unapproved approximations hold the last stance", () => {
  const tl = timeline([ev(0, 0, "C"), ev(1, 0, "Bdim"), ev(2, 0, "G7"), ev(3, 0, "Am")]);
  const { plan } = planKirtled(tl, T120);
  const s = plan!.stances;
  assert.deepEqual(s.map((x) => [x.status, name(x.anchor), x.hold ?? null]), [
    ["verified", "C", null],
    ["unresolved", "C", "unresolved"],
    ["approximate", "C", "needs_approval"],
    ["verified", "Am", null],
  ]);
  assert.deepEqual(s[1].lit.map(triadName), ["C"]);
  // The only move is the arrival on Am, from C.
  assert.deepEqual(plan!.moves.map((m) => [name(m.from), name(m.to)]), [["C", "Am"]]);
});

test("plan: an approved approximation moves the dancers", () => {
  const tl = timeline([ev(0, 0, "C"), ev(2, 0, "G7", { approvedBy: "synthetic-reviewer" })]);
  const { plan } = planKirtled(tl, T120);
  assert.equal(name(plan!.stances[1].anchor), "G");
  assert.equal(plan!.stances[1].status, "approximate");
  assert.equal(plan!.stances[1].hold, undefined);
  assert.equal(name(plan!.moves.at(-1)!.to), "G");
});

test("plan: seventh chords light a diamond; moving between them follows the anchors", () => {
  const tl = timeline([ev(0, 0, "C"), ev(1, 0, "Cmaj7"), ev(2, 0, "Am7")]);
  const { plan } = planKirtled(tl, T120);
  assert.deepEqual(plan!.stances.map((x) => x.lit.map(triadName)), [["C"], ["C", "Em"], ["Am", "C"]]);
  assert.deepEqual(plan!.moves.map((m) => [m.atBar, name(m.from), name(m.to), m.side]), [[2, "C", "Am", "R"]]);
});

test("plan: rules hold on a longer, mixed progression and the result never changes", () => {
  const tl = timeline(
    [
      ev(0, 0, "Em"), ev(1, 0, "C"), ev(1, 2, "G"), ev(2, 0, "D"), ev(3, 0, "Bm7"), ev(3, 2, "Cmaj7"),
      ev(4, 0, "N.C."), ev(5, 0, "Am"), ev(5, 3, "Ebm"), ev(6, 0, "B7"), ev(7, 0, "Em"),
    ],
    { keys: [{ startBar: 0, startBeat: 0, tonic: 4, quality: "min" }] },
  );
  assertPlanRules(tl, T120);
  const first = JSON.stringify(planKirtled(tl, T120));
  for (let i = 0; i < 10; i++) assert.equal(JSON.stringify(planKirtled(tl, T120)), first);
});

// ---------------- validation ----------------

test("validate: structural problems block planning", () => {
  const out = planKirtled(timeline([ev(1, 0, "C"), ev(0, 0, "Am")]), T120);
  assert.equal(out.ok, false);
  assert.equal(out.plan, null);
  assert.deepEqual(out.issues.map((i) => i.code), ["event_order"]);

  const beat = validateHarmony(timeline([ev(0, 4, "C")]), T120);
  assert.deepEqual(beat.issues.map((i) => i.code), ["position_invalid"]);

  const dup = validateHarmony(timeline([{ id: "x", startBar: 0, startBeat: 0, symbol: "C" }, { id: "x", startBar: 1, startBeat: 0, symbol: "G" }]), T120);
  assert.deepEqual(dup.issues.map((i) => i.code), ["duplicate_id"]);

  const tempo = planKirtled(timeline([ev(0, 0, "C")]), [{ startBar: 1, bpm: 120, beatsPerBar: 4 }]);
  assert.equal(tempo.plan, null);
  assert.ok(tempo.issues.every((i) => i.code === "tempo_invalid"));
});

test("validate: an unreadable chord is flagged but the plan still holds there", () => {
  const out = planKirtled(timeline([ev(0, 0, "C"), ev(1, 0, "Cxyz"), ev(2, 0, "Am")]), T120);
  assert.equal(out.ok, false);
  assert.deepEqual(out.issues.map((i) => i.code), ["chord_unreadable"]);
  assert.ok(out.plan);
  assert.equal(out.plan.stances[1].hold, "unresolved");
});

test("validate: render-ready timelines need approval, including each approximation", () => {
  const draft = validateHarmony(timeline([ev(0, 0, "C"), ev(1, 0, "G7")]), T120, { requireApproved: true });
  assert.deepEqual(draft.issues.map((i) => i.code), ["approximation_unapproved", "not_approved"]);

  const approved = validateHarmony(
    timeline([ev(0, 0, "C"), ev(1, 0, "G7", { approvedBy: "synthetic-reviewer" })], {
      approvalStatus: "approved", approvedBy: "synthetic-reviewer", approvedAt: "2026-01-01T00:00:00Z",
    }),
    T120,
    { requireApproved: true },
  );
  assert.deepEqual(approved.issues, []);
});
