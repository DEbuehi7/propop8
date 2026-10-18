/**
 * Mouth track builder. Synthetic signals only: silence and sine tones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMouthTrack, checkMouthTrack, frameLoudnessDb, MOUTH_FPS, mouthAt, mouthOpenness, percentile } from "../../lib/dance8/authoring/mouthTrack";

const RATE = 16000;
/** Mono int16 samples from [seconds, amplitude 0..1] segments of a 220 Hz tone. */
function tone(parts: [number, number][]): Int16Array {
  const out: number[] = [];
  for (const [sec, amp] of parts) {
    const n = Math.round(sec * RATE);
    for (let i = 0; i < n; i++) out.push(Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * amp * 32767));
  }
  return Int16Array.from(out);
}
const meta = { trackId: "test-song", voice: "Stuttr", lang: "en", role: "vocals" as const, source: { path: "test-song/voices/stuttr.en.wav", sha256: "a".repeat(64) }, startSec: 0 };

test("one value per 24 fps frame; a full-scale sine is about -3 dBFS", () => {
  const db = frameLoudnessDb(tone([[1, 1]]), RATE);
  assert.equal(db.length, MOUTH_FPS);
  assert.ok(db.every((d) => Math.abs(d - -3.01) < 0.1), String(db[0]));
  assert.equal(frameLoudnessDb(new Int16Array(RATE / 2), RATE)[0], -Infinity);
  assert.equal(percentile([5, 1, 3], 50), 3);
  assert.equal(percentile([], 95), null);
});

test("silence is closed, the loud part is open, and closing is gradual", () => {
  const t = buildMouthTrack(tone([[0.5, 0], [0.5, 0.5], [0.5, 0]]), RATE, meta);
  assert.equal(t.open.length, 36);
  assert.deepEqual(t.open.slice(0, 12), Array(12).fill(0));
  // A steady tone sits at the reference, give or take a 0.1 dB frame ripple.
  assert.ok(t.open.slice(12, 24).every((v) => v >= 0.99 && v <= 1), t.open.join(" "));
  assert.deepEqual(t.open.slice(24, 28), [0.657, 0.317, 0, 0], "closes at most 0.34 per frame");
  assert.ok(t.refDb !== null && Math.abs(t.refDb - -9.03) < 0.1, String(t.refDb));
  assert.deepEqual(checkMouthTrack(t), []);
});

test("the take's level does not change the shape; a softer syllable opens less", () => {
  const loud = mouthOpenness(frameLoudnessDb(tone([[0.5, 0.8], [0.5, 0.08]]), RATE)).open;
  const quiet = mouthOpenness(frameLoudnessDb(tone([[0.5, 0.2], [0.5, 0.02]]), RATE)).open;
  assert.deepEqual(loud, quiet);
  assert.ok(loud[0] >= 0.99);
  assert.ok(Math.abs(loud[23] - 0.333) < 0.01, `20 dB softer opens a third: ${loud[23]}`);
  assert.deepEqual(mouthOpenness([-Infinity, -80]).open, [0, 0], "all silent: closed, no reference");
});

test("song time lookup honours the take's start; same input gives the same track", () => {
  const s = tone([[0.5, 0.5]]);
  const t = buildMouthTrack(s, RATE, { ...meta, role: "backing_vocals", startSec: 64.6 });
  assert.equal(t.id, "test-song.stuttr.en.backing.mouth");
  assert.equal(mouthAt(t, 64.59), 0);
  assert.ok(mouthAt(t, 64.6) >= 0.99);
  assert.equal(mouthAt(t, 65.2), 0);
  assert.deepEqual(buildMouthTrack(s, RATE, { ...meta, startSec: 64.6, role: "backing_vocals" }), t);
  assert.deepEqual(checkMouthTrack({ ...t, fps: 30, open: [1.5] }), ["fps must be 24 (D8-03)", "open[0] must be between 0 and 1"]);
});
