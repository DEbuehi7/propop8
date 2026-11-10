/**
 * Canon D8-21: the Kirtled instrument's three arms, rebuilt from the lattice
 * and checked against vocab.KIRTLED_ARMS. The layout is a SPEC (CONCEPTUAL
 * under TRI-06); these tests pin its arithmetic only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { armOf, kirtledArms } from "../../lib/dance8/harmony/arms";
import { cross, NOTE_NAMES, triad, triadName } from "../../lib/dance8/harmony/lattice";
import type { Triad } from "../../lib/dance8/contracts/harmony";
import { vocab } from "../../lib/canon";

/** "F#m" -> F# minor, "Eb" -> E-flat major. Plain names only. */
function readTriad(name: string): Triad {
  const minor = name.endsWith("m");
  const root = (NOTE_NAMES as readonly string[]).indexOf(minor ? name.slice(0, -1) : name);
  if (root < 0) throw new Error(`not a plain chord name: ${name}`);
  return triad(root, minor ? "min" : "maj");
}

const arms = kirtledArms();
const all = Array.from({ length: 24 }, (_, i) => triad(i >> 1, i & 1 ? "min" : "maj"));

test("D8-21: the 24 triads split into three arms of eight, as vocab lists them", () => {
  assert.equal(arms.length, 3);
  assert.deepEqual(arms.map((a) => a.strip.length), [8, 8, 8]);
  assert.equal(new Set(arms.flatMap((a) => a.strip.map(triadName))).size, 24, "every triad once");
  assert.deepEqual(
    arms.map((a) => ({ arm: a.arm, strip: a.strip.map(triadName), notes: a.notes.map((n) => NOTE_NAMES[n]) })),
    vocab.KIRTLED_ARMS.map((a) => ({ arm: a.arm, strip: [...a.strip], notes: [...a.notes] })),
  );
});

test("D8-21: neighbours along an arm alternate R and P, and the strip closes on a P side", () => {
  for (const a of arms) {
    a.strip.forEach((t, k) => {
      const next = a.strip[(k + 1) % 8];
      assert.equal(triadName(cross(t, k % 2 === 0 ? "R" : "P")), triadName(next), `${a.arm} ${triadName(t)}`);
    });
  }
});

test("D8-21: R and P stay on the arm; L always leaves it", () => {
  for (const t of all) {
    assert.equal(armOf(cross(t, "R"), arms), armOf(t, arms));
    assert.equal(armOf(cross(t, "P"), arms), armOf(t, arms));
    assert.notEqual(armOf(cross(t, "L"), arms), armOf(t, arms));
  }
});

test("D8-21: transposing by 3 or 6 semitones stays on the arm; by 1, 2, 4 or 5 it moves", () => {
  const stays = (n: number) => all.filter((t) => armOf(triad(t.root + n, t.quality), arms) === armOf(t, arms)).length;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(stays), [0, 0, 24, 0, 0, 24]);
});

test("D8-21: the canonical sequence (D8-07) runs arms A, B, B, B, B, B, A", () => {
  assert.deepEqual(vocab.KIRTLED_CANONICAL_SEQUENCE.chords.map((c) => armOf(readTriad(c), arms)), ["A", "B", "B", "B", "B", "B", "A"]);
});
