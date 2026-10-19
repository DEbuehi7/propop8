/**
 * Song analysis (lib/stuttr/analysis.ts). Synthetic signals only: clicks,
 * sine bursts and triads with known times and pitches.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_SR, analyzeSong, beatGrid, bestTriad, chromaFrames, fft, onsetEnvelope, ONSET_HOP, trackBeats,
} from "../lib/stuttr/analysis";

const SR = ANALYSIS_SR;
const frameSec = ONSET_HOP / SR;

/** Adds a decaying sine burst at time t. */
function burst(x: Float32Array, t: number, freq: number, amp: number, decay = 80, len = 600) {
  const s = Math.round(t * SR);
  for (let i = 0; i < len && s + i < x.length; i++) x[s + i] += Math.sin((2 * Math.PI * freq * i) / SR) * Math.exp(-i / decay) * amp;
}
function tones(x: Float32Array, from: number, to: number, freqs: number[], amp = 0.15) {
  for (let i = Math.round(from * SR); i < Math.min(x.length, Math.round(to * SR)); i++) for (const f of freqs) x[i] += Math.sin((2 * Math.PI * f * i) / SR) * amp;
}
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

test("fft matches a direct DFT", () => {
  const n = 16;
  const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + 0.5 * Math.cos(i * 0.4));
  const im = new Float64Array(n);
  const want = Array.from({ length: n }, (_, k) => {
    let a = 0;
    let b = 0;
    for (let t = 0; t < n; t++) { a += re[t] * Math.cos((-2 * Math.PI * k * t) / n); b += re[t] * Math.sin((-2 * Math.PI * k * t) / n); }
    return [a, b];
  });
  fft(re, im);
  want.forEach(([a, b], k) => { assert.ok(Math.abs(re[k] - a) < 1e-9 && Math.abs(im[k] - b) < 1e-9, `bin ${k}`); });
});

test("click track: tempo and first beat (onset latency corrected)", () => {
  const x = new Float32Array(SR * 20);
  for (let t = 0.25; t < 20; t += 0.6) burst(x, t, 1000, 0.8);
  const env = onsetEnvelope(x);
  const coarse = beatGrid(env, frameSec);
  assert.ok(Math.abs(coarse.bpm - 100) < 0.1, `coarse ${coarse.bpm}`);
  const g = trackBeats(env, coarse.beatSec, frameSec);
  assert.ok(Math.abs(g.bpm - 100) < 0.05, `bpm ${g.bpm}`);
  assert.ok(Math.abs(g.firstBeatSec - 0.25) < 0.01, `first beat ${g.firstBeatSec}`);
  assert.ok(g.residP95ms <= 12, `steady grid: ${g.residP95ms} ms`);
});

test("syncopated groove: off-beat hits and a missing kick don't move the beat", () => {
  const x = new Float32Array(SR * 24);
  const beat = 60 / 96;
  for (let k = 0; k * beat < 23; k++) {
    if (k % 4 !== 2) burst(x, 0.1 + k * beat, 80, 0.8, 300, 3000); // kick, with a gap on beat 3
    burst(x, 0.1 + k * beat, 2500, 0.3, 120); // the beat's own click
    burst(x, 0.1 + (k + 0.75) * beat, 6000, 0.12, 40); // quiet hat on the last sixteenth
    if (k % 2 === 1) burst(x, 0.1 + (k + 0.5) * beat, 1200, 0.25, 150); // offbeat guitar skank
  }
  const env = onsetEnvelope(x);
  const g = trackBeats(env, beatGrid(env, frameSec).beatSec, frameSec);
  assert.ok(Math.abs(g.bpm - 96) < 0.1, `bpm ${g.bpm}`);
  const off = (((g.firstBeatSec - 0.1) / beat) % 1 + 1) % 1;
  assert.ok(off < 0.06 || off > 0.94, `first beat ${g.firstBeatSec} is ${off.toFixed(2)} of a beat off the kick`);
});

test("triads: the best match and its fit", () => {
  const c = new Float64Array(12);
  c[0] = c[4] = c[7] = 1;
  assert.deepEqual(bestTriad(c), { chord: "C", fit: 1 });
  const am = new Float64Array(12);
  am[9] = am[0] = am[4] = 1;
  assert.equal(bestTriad(am).chord, "Am");
  assert.deepEqual(bestTriad(new Float64Array(12)), { chord: "N.C.", fit: 0 });
  const { chroma } = chromaFrames(Object.assign(new Float32Array(SR * 2), {}).map((_, i) => [60, 64, 67].reduce((s, m) => s + Math.sin((2 * Math.PI * hz(m) * i) / SR), 0) * 0.2));
  const sum = new Float64Array(12);
  for (const f of chroma.slice(2, -2)) for (let i = 0; i < 12; i++) sum[i] += f[i];
  const r = bestTriad(sum);
  assert.equal(r.chord, "C");
  assert.ok(r.fit > 0.9, `fit ${r.fit}`);
});

test("whole song: grid, downbeat, bars, part levels, sung eighths and chords", () => {
  const dur = 33; // 16 bars at 120 BPM plus a tail
  const beat = 0.5;
  const drums = new Float32Array(SR * dur);
  const bass = new Float32Array(SR * dur);
  const keys = new Float32Array(SR * dur);
  const lead = new Float32Array(SR * dur);
  for (let k = 0; k * beat < 32; k++) {
    burst(drums, k * beat, 60, k % 4 === 0 ? 0.9 : 0.5, 400, 4000);
    burst(drums, k * beat, 2500, 0.3, 120);
    burst(drums, (k + 0.5) * beat, 7000, 0.1, 40);
    if (k % 4 === 0) burst(bass, k * beat, 55, 0.7, 3000, 20000);
  }
  tones(keys, 0, 16, [60, 64, 67].map(hz));
  tones(keys, 16, 32, [57, 60, 64].map(hz));
  tones(lead, 4, 12, [hz(69)], 0.3);
  const a = analyzeSong({ trackId: "synthetic", durationSec: dur, sources: [], parts: { drums, bass, harmony: keys, lead } });
  assert.ok(Math.abs(a.bpm - 120) < 0.1, `bpm ${a.bpm}`);
  assert.equal(a.downbeatPhase, 0);
  assert.ok(a.firstDownbeatSec >= 0 && a.firstDownbeatSec < 0.03, `first downbeat ${a.firstDownbeatSec}`);
  assert.equal(a.bars, 16);
  assert.equal(a.eighthDb.lead!.length, 128);
  assert.equal(a.eighthDb.backing, null);
  const sung = a.eighthDb.lead!.map((d) => d > -42);
  assert.deepEqual([sung[15], sung[16], sung[47], sung[48]], [false, true, true, false], "sung from bar 2 to bar 6");
  assert.ok(a.chords.filter((c) => c.bar < 8).every((c) => c.chord === "C" && c.fit > 0.9));
  assert.ok(a.chords.filter((c) => c.bar >= 8).every((c) => c.chord === "Am" && c.fit > 0.9));
  assert.ok(a.barDb.lead![3] > -20 && a.barDb.lead![0] < -100);
  assert.deepEqual(analyzeSong({ trackId: "synthetic", durationSec: dur, sources: [], parts: { drums, bass, harmony: keys, lead } }), a, "deterministic");
});
