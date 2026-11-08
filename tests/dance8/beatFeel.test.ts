/**
 * Beat feel and freedom of choice (CHOIR8): where the song departs from its
 * own rhythm, each dancer chooses which hit to land on, inside the flow rules.
 * Synthetic drums and synthetic cue maps only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ANALYSIS_SR, syncFingerprint } from "../../lib/stuttr/analysis";
import { measureFeel, feelFromFingerprint, SHIFT_MIN_SEC, type BeatFeel, type FeelKind } from "../../lib/dance8/motion/beatFeel";
import { applyLandings, ENSEMBLE_SPREAD_COUNTS, MIN_GAP_COUNTS, offered, unit, type Landing } from "../../lib/dance8/motion/landing";
import { planSong, type CuePlan } from "../../lib/dance8/motion/rhythm";
import { countSheetHtml } from "../../lib/dance8/motion/countSheet";
import { choirSheet, countedBeats } from "../../lib/dance8/choirPipeline";
import type { Cue, CueMap } from "../../lib/dance8/contracts/scene";
import { saveManifest, type Ctx } from "../../lib/stuttr/commands";
import { CANON_REGISTER } from "../../lib/canon";
import { FLOW_RULES, LANDING_TEXT, ROLE_FREEDOM } from "../../lib/dance8/motion/landing";
import { emptyManifest } from "../../lib/stuttr/library";

// ---------- a synthetic drum track: kick every beat, snare on 2 and 4, a soft hat on each "and" ----------

const BEAT = 0.5;
const START = 0.25;
type Twist = "push60" | "drag50" | "push15" | "drop" | "sync";
function drums(beats: number, twists: Record<number, Twist>, gridShiftSec = 0): Float32Array {
  const sr = ANALYSIS_SR;
  const x = new Float32Array(Math.round((beats * BEAT + 1) * sr));
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const burst = (at: number, len: number, f: (u: number) => number) => {
    const i0 = Math.round(at * sr);
    for (let k = 0; k < len * sr && i0 + k < x.length; k++) x[i0 + k] += f(k / sr);
  };
  const kick = (t: number) => burst(t, 0.15, (u) => 0.8 * Math.sin(2 * Math.PI * 60 * u) * Math.exp(-u * 30));
  const snare = (t: number, a = 0.4) => burst(t, 0.12, () => a * (rnd() * 2 - 1));
  const hat = (t: number, a: number) => burst(t, 0.03, (u) => a * (rnd() * 2 - 1) * Math.exp(-u * 120));
  for (let b = 0; b < beats; b++) {
    const tw = twists[b];
    const t = START + b * BEAT + gridShiftSec + (tw === "push60" ? -0.06 : tw === "drag50" ? 0.05 : tw === "push15" ? -0.015 : 0);
    if (tw === "drop") continue;
    if (tw === "sync") { hat(t, 0.15); kick(t + BEAT / 2); snare(t + BEAT / 2, 0.5); continue; }
    kick(t);
    if (b % 2) snare(t);
    hat(t + BEAT / 2, 0.08);
  }
  return x;
}
const gridOf = (beats: number) => Array.from({ length: beats }, (_, b) => ({ beat: b, gridSec: START + b * BEAT, beatSec: BEAT, pos: b % 4 }));

test("beat feel: pushes, drags, drops and moved accents are read against the song's own habits", () => {
  const twists: Record<number, Twist> = { 5: "push60", 9: "drag50", 13: "drop", 17: "sync", 21: "push15", 27: "sync" };
  const feel = feelFromFingerprint(syncFingerprint(drums(32, twists)), gridOf(32));
  const at = (b: number) => feel[b];
  assert.equal(at(5).kind, "push");
  assert.ok(Math.abs(at(5).shiftMs! + 60) <= 12, `pushed 60 ms, read ${at(5).shiftMs} ms`);
  assert.equal(at(9).kind, "drag");
  assert.ok(Math.abs(at(9).shiftMs! - 50) <= 12, `dragged 50 ms, read ${at(9).shiftMs} ms`);
  assert.equal(at(13).kind, "dropped");
  assert.equal(at(13).hitSec, null);
  for (const b of [17, 27]) {
    assert.equal(at(b).kind, "syncopated", `beat ${b}`);
    assert.ok(Math.abs(at(b).andSec! - (START + b * BEAT + BEAT / 2)) <= 0.015, "the and is timed to its hit");
  }
  assert.equal(at(21).kind, "steady", `a 15 ms push is inside the groove (threshold ${SHIFT_MIN_SEC * 1000} ms)`);
  const plain = feel.filter((f, b) => !twists[b]);
  assert.ok(plain.every((f) => f.kind === "steady"), plain.filter((f) => f.kind !== "steady").map((f) => `${f.beat}:${f.kind}`).join(" "));
});

test("beat feel: a whole song sitting early or late is its habit, not an anomaly; nothing to read is unknown", () => {
  const feel = feelFromFingerprint(syncFingerprint(drums(24, { 9: "push60" }, -0.025)), gridOf(24));
  assert.deepEqual(feel.filter((f) => f.kind !== "steady").map((f) => [f.beat, f.kind]), [[9, "push"]]);
  assert.ok(feel.every((f) => f.kind === "unknown") === false);
  assert.ok(measureFeel(null, gridOf(4)).every((f) => f.kind === "unknown" && f.hitSec === null));
  const beyond = feelFromFingerprint(syncFingerprint(drums(8, {})), [{ beat: 99, gridSec: 99, beatSec: BEAT, pos: 3 }]);
  assert.equal(beyond[0].kind, "unknown", "a beat past the end of the pattern is unknown, never guessed");
});

// ---------- freedom of choice under the flow rules ----------

const cue = (o: Partial<Cue>): Cue => ({ id: "verse-1", section: "verse", startBar: 0, endBar: 4, sceneId: "rooftop", cameras: ["wide"], shotBars: 2, ...o });
const map = (o: Partial<CueMap> = {}): CueMap => ({
  id: "m", schemaVersion: 1, version: 1, trackId: "s1", analysisProfileId: "a", aspect: "16:9", tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }],
  cues: [cue({}), cue({ id: "chorus-1", section: "chorus", startBar: 4, endBar: 8 }), cue({ id: "break-1", section: "break", startBar: 8, endBar: 10 })],
  fallbackClipId: "placeholder-black", maxDriftScore: 0.3, approvalStatus: "approved", firstDownbeatSec: 0.25, ...o,
});

/** A busy, made-up feel for every counted beat: about half steady, the rest every kind of shift. */
function busyFeel(plans: CuePlan[]): Map<number, BeatFeel> {
  const out = new Map<number, BeatFeel>();
  for (const b of countedBeats(plans)) {
    const u = unit(`feel|${b.beat}`);
    const kind: FeelKind = u < 0.5 ? "steady" : u < 0.62 ? "push" : u < 0.74 ? "drag" : u < 0.87 ? "syncopated" : "dropped";
    const s = 30 + Math.round(60 * unit(`s|${b.beat}`));
    // Half the syncopated beats are pushed too, so "with" and "and" meet on one count and rule 4 has work to do.
    const shift = kind === "push" ? -s : kind === "drag" ? s : kind === "syncopated" && unit(`p|${b.beat}`) < 0.5 ? -s : 0;
    out.set(b.beat, {
      beat: b.beat, gridSec: b.gridSec, kind, shiftMs: kind === "dropped" ? null : shift,
      hitSec: kind === "dropped" ? null : b.gridSec + shift / 1000, onRatio: kind === "dropped" ? 0 : 1, andRatio: kind === "syncopated" ? 2 : 1,
      // Some ands sit late enough that rule 2 must refuse them.
      andSec: kind === "syncopated" ? b.gridSec + b.beatSec * (0.45 + 0.2 * unit(`a|${b.beat}`)) : null,
    });
  }
  return out;
}

function checkRules(plans: CuePlan[], feel: Map<number, BeatFeel>, label: string) {
  const slots = plans.flatMap((p) => p.counts.map((c) => ({ c, countSec: (p.beatsPerCount * 60) / p.bpm }))).sort((a, b) => a.c.timeSec - b.c.timeSec);
  const last = new Map<string, { hit: number | null; held: boolean; slot: number }>();
  slots.forEach(({ c, countSec }, i) => {
    const f = feel.get(c.beat);
    const allowed = new Set(offered(f, c.timeSec, c.count === 1).map((o) => o.landing));
    const active = c.moves.filter((m) => m.active);
    for (const m of c.moves) if (!m.active) assert.equal(m.landing, undefined, `${label}: a resting dancer has no landing`);
    for (const m of active) assert.ok(m.landing && allowed.has(m.landing), `${label} ${c.timeSec}s ${m.id}: ${m.landing} was not offered (${[...allowed]})`);
    if (!f || f.kind === "steady" || f.kind === "unknown") assert.ok(active.every((m) => m.landing === "on"), `${label}: steady means on the beat`);
    if (c.count === 1) {
      assert.equal(new Set(active.map((m) => m.landing)).size <= 1, true, `${label} rule 1: the one is shared`);
      assert.ok(active.every((m) => m.landing !== "and"), `${label} rule 1: never the and on the one`);
    }
    const hits = active.flatMap((m) => (m.hitSec == null ? [] : [m.hitSec]));
    if (hits.length) assert.ok(Math.max(...hits) - Math.min(...hits) <= ENSEMBLE_SPREAD_COUNTS * countSec + 1e-3, `${label} rule 4 at ${c.timeSec}s`);
    const next = slots[i + 1];
    for (const m of active) {
      const prev = last.get(m.id);
      if (m.hitSec != null) {
        if (prev?.hit != null) assert.ok(m.hitSec - prev.hit >= MIN_GAP_COUNTS * countSec - 1e-3, `${label} rule 2: ${m.id} at ${c.timeSec}s lands ${(m.hitSec - prev.hit).toFixed(3)}s after its last hit`);
        if (next) assert.ok(next.c.timeSec - m.hitSec >= MIN_GAP_COUNTS * countSec - 1e-3, `${label} rule 2: ${m.id} at ${c.timeSec}s crowds the next beat`);
      }
      if (m.landing === "hold") assert.ok(!(prev?.held && prev.slot === i - 1), `${label} rule 3: ${m.id} holds twice in a row at ${c.timeSec}s`);
      last.set(m.id, { hit: m.hitSec ?? prev?.hit ?? null, held: m.landing === "hold", slot: i });
    }
  });
}

/** Every count pushed 90 ms with its accent moved a full half beat: "with" and "and" are 0.68 of a beat apart, so rule 4 must choose. */
function clashFeel(plans: CuePlan[]): Map<number, BeatFeel> {
  return new Map(countedBeats(plans).map((b): [number, BeatFeel] => [b.beat, {
    beat: b.beat, gridSec: b.gridSec, kind: "syncopated", shiftMs: -90, hitSec: b.gridSec - 0.09, onRatio: 0.6, andRatio: 2, andSec: b.gridSec + b.beatSec / 2,
  }]));
}

test("freedom of choice: every variation keeps the four flow rules, across unison, wave and call and response", () => {
  for (const m of [map(), map({ tempo: [{ startBar: 0, bpm: 140, beatsPerBar: 4 }] })]) {
    const base = planSong(m);
    for (const [name, feel] of [["busy", busyFeel(base)], ["clash", clashFeel(base)]] as const) {
      const used = new Set<string>();
      for (let v = 0; v < 40; v++) {
        const chosen = applyLandings(base, feel, { variation: v });
        checkRules(chosen, feel, `${name} ${m.tempo[0].bpm} BPM v${v}`);
        for (const p of chosen) for (const c of p.counts) for (const x of c.moves) if (x.landing) used.add(x.landing);
      }
      if (name === "clash") assert.deepEqual([...used].sort(), ["and", "on", "with"], "both liberties stay live; rule 4 only keeps them apart");
    }
  }
});

test("freedom of choice: seeded, varied, timing only, and the soloist and breaker take more liberties than the choir and skater", () => {
  const base = planSong(map());
  const feel = busyFeel(base);
  assert.deepEqual(applyLandings(base, feel, { variation: 3 }), applyLandings(base, feel, { variation: 3 }), "same variation, same choices");
  const sig = (p: CuePlan[]) => p.flatMap((x) => x.counts.flatMap((c) => c.moves.map((m) => m.landing ?? "-"))).join("");
  const sigs = new Set(Array.from({ length: 8 }, (_, v) => sig(applyLandings(base, feel, { variation: v }))));
  assert.ok(sigs.size >= 6, `8 variations gave ${sigs.size} different sets of choices`);
  // Timing only: what each role does is untouched.
  const chosen = applyLandings(base, feel, { variation: 1 });
  const strip = (p: CuePlan[]) => p.map((x) => x.counts.map((c) => c.moves.map((m) => {
    const rest: Partial<typeof m> = { ...m };
    delete rest.landing;
    delete rest.hitSec;
    return rest;
  })));
  assert.deepEqual(strip(chosen), strip(base));
  // Liberties (anything but "on") on counts that offered a choice, over 40 variations.
  const free: Record<string, [number, number]> = {};
  for (let v = 0; v < 40; v++) {
    for (const p of applyLandings(base, feel, { variation: v })) for (const c of p.counts) {
      if (c.count === 1 || offered(c.feel, c.timeSec, false).length < 2) continue;
      for (const m of c.moves) if (m.landing) {
        const r = (free[m.role] ??= [0, 0]);
        r[1]++;
        if (m.landing !== "on") r[0]++;
      }
    }
  }
  const rate = (r: string) => free[r][0] / free[r][1];
  assert.ok(rate("soloist") > rate("choir") + 0.1 && rate("breaker") > rate("skater") + 0.1, JSON.stringify(free));
  assert.ok(rate("choir") > 0, "the choir still takes some liberties");
});

test("freedom of choice: no feel, or a steady song, means everyone on the beat; the gate is unchanged", () => {
  const base = planSong(map({ approvalStatus: "draft" }));
  const none = applyLandings(base, new Map());
  assert.ok(none.every((p) => p.gate === "defer" && p.counts.every((c) => c.moves.every((m) => !m.active || (m.landing === "on" && m.hitSec === c.timeSec)))));
  const steadyFeel = new Map(measureFeel(null, countedBeats(base)).map((f): [number, BeatFeel] => [f.beat, { ...f, kind: "steady" }]));
  assert.ok(applyLandings(base, steadyFeel).every((p) => p.counts.every((c) => c.moves.every((m) => !m.active || m.landing === "on"))));
});

// ---------- the command and the count sheet ----------

test("choir command: reads the song's onset pattern, writes the choices, and says how to get another set", () => {
  const root = mkdtempSync(join(tmpdir(), "dance8-feel-"));
  const lines: string[] = [];
  const c: Ctx = { library: root, log: (l: string) => lines.push(l), now: () => "2026-11-07T12:00:00.000Z" };
  try {
    const m = emptyManifest();
    m.tracks.push({ trackId: "s1", title: "Synth", sunoPlan: "Pro", addedAt: "2026-11-07T12:00:00.000Z", files: [], voices: [] });
    saveManifest(c, m);
    mkdirSync(join(root, "s1", "dance8"), { recursive: true });
    mkdirSync(join(root, "s1", "analysis"), { recursive: true });
    const cm = map({ cues: [cue({ endBar: 8 })] });
    writeFileSync(join(root, "s1", "dance8", "s1.cuemap.json"), JSON.stringify(cm));

    choirSheet(c, "s1");
    assert.ok(lines.some((l) => /beat feel: unknown .*npm run stuttr -- analyze s1/.test(l)), lines.join("\n"));

    const twists: Record<number, Twist> = { 5: "push60", 9: "drag50", 13: "drop", 17: "sync", 23: "sync", 26: "push60" };
    writeFileSync(join(root, "s1", "analysis", "s1.analysis.json"), JSON.stringify({ sync: syncFingerprint(drums(34, twists)) }));
    lines.length = 0;
    const { plans, file } = choirSheet(c, "s1", { variation: 2 });
    const kinds = plans[0].counts.map((x) => x.feel?.kind);
    assert.deepEqual([kinds[5], kinds[9], kinds[13], kinds[17]], ["push", "drag", "dropped", "syncopated"]);
    assert.ok(lines.some((l) => /beat feel: .*push.*variation 2/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => l.includes("--variation 3")));
    const json = JSON.parse(readFileSync(join(root, "s1", "dance8", "choir", "choir-plan.json"), "utf8"));
    assert.equal(json.variation, 2);
    assert.equal(json.feelMeasured, true);
    const html = readFileSync(file, "utf8");
    assert.ok(html.includes("Beat feel:") && html.includes("the beat drops out") && html.includes("The one is shared"));
    checkRules(plans, new Map(plans.flatMap((p) => p.counts.map((x): [number, BeatFeel] => [x.beat, x.feel!]))), "command");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("count sheet: a steady song shows no beat-feel table; landings are marked where they leave the beat", () => {
  const base = planSong(map());
  assert.ok(!countSheetHtml("S", applyLandings(base, new Map())).includes("Beat feel:"));
  const html = countSheetHtml("S", applyLandings(base, busyFeel(base), { variation: 0 }), { variation: 0, feelNote: "Measured." });
  assert.ok(html.includes("Beat feel:") && html.includes("variation 0"));
  const liberties: Exclude<Landing, "on">[] = ["with", "and", "hold"];
  const text: Record<Exclude<Landing, "on">, string> = { with: "with the hit", and: "on the and", hold: "holds through" };
  assert.ok(liberties.some((w) => html.includes(`<b>${text[w]}`)), "a liberty is marked in bold");
});

test("canon D8-19 (locked) says what the code does", () => {
  const e = CANON_REGISTER.find((x) => x.id === "D8-19");
  assert.ok(e && e.status === "LOCKED", "D8-19 is locked");
  assert.deepEqual(Object.keys(LANDING_TEXT), ["on", "with", "and", "hold"], "four choices");
  assert.equal(FLOW_RULES.length, 4, "four flow rules");
  assert.equal(MIN_GAP_COUNTS, 0.5);
  assert.equal(ENSEMBLE_SPREAD_COUNTS, 0.5);
  assert.match(e.statement, /at least half a count before the next beat/);
  assert.match(e.statement, /within half a count of each other/);
  assert.match(e.statement, /never two holds in a row/);
  assert.match(e.statement, /first count of every phrase is shared/);
  assert.equal(ROLE_FREEDOM.choir / ROLE_FREEDOM.soloist, 0.5, "the choir leans half as far as the soloist");
  assert.equal(ROLE_FREEDOM.skater / ROLE_FREEDOM.breaker, 0.5, "the skater leans half as far as the breaker");
  assert.match(e.statement, /lean half as far/);
});

