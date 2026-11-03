/**
 * CHOIR8: one eight-count grammar on the song's own beat grid, expressed per
 * role, varied by section, DEFER while the grid is unchecked. Synthetic cue
 * maps only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Cue, CueMap } from "../../lib/dance8/contracts/scene";
import { countSheetHtml } from "../../lib/dance8/motion/countSheet";
import { DEFAULT_CAST, EIGHT_COUNT, EXPRESSION, planCue, planSong } from "../../lib/dance8/motion/rhythm";
import { choirSheet } from "../../lib/dance8/choirPipeline";
import { saveManifest, type Ctx } from "../../lib/stuttr/commands";
import { emptyManifest } from "../../lib/stuttr/library";

const cue = (o: Partial<Cue>): Cue => ({ id: "verse-1", section: "verse", startBar: 0, endBar: 2, sceneId: "rooftop", cameras: ["wide"], shotBars: 2, ...o });
const map = (o: Partial<CueMap> = {}): CueMap => ({
  id: "m", schemaVersion: 1, version: 1, trackId: "s1", analysisProfileId: "a", aspect: "16:9", tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }],
  cues: [cue({}), cue({ id: "chorus-1", section: "chorus", startBar: 2, endBar: 6 }), cue({ id: "break-1", section: "break", startBar: 6, endBar: 8 })],
  fallbackClipId: "placeholder-black", maxDriftScore: 0.3, approvalStatus: "approved", ...o,
});

test("CHOIR8: eight counts on the grid; the role says how, the beat says when", () => {
  assert.deepEqual(EIGHT_COUNT.map((s) => s.intent), ["load", "resolve", "travel", "release", "travel", "accent", "release", "resolve"]);
  const p = planCue(map(), map().cues[0]);
  assert.equal(p.relationship, "unison");
  assert.equal(p.counts.length, 8, "two 4/4 bars at 120 BPM: eight counts");
  assert.deepEqual(p.counts.map((c) => c.timeSec), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  const six = p.counts[5];
  assert.deepEqual(six.moves.map((m) => [m.role, m.doing]), [
    ["soloist", EXPRESSION.soloist.accent.doing], ["choir", EXPRESSION.choir.accent.doing], ["choir", EXPRESSION.choir.accent.doing],
    ["choir", EXPRESSION.choir.accent.doing], ["breaker", EXPRESSION.breaker.accent.doing], ["skater", EXPRESSION.skater.accent.doing],
  ]);
  // Same intent, different bodies: never airborne on a board from this grammar (D8-16 keeps tricks on chord changes).
  assert.ok(p.counts.every((c) => c.moves.find((m) => m.role === "skater")!.contact === "rolling"));
  assert.equal(p.counts[3].moves.find((m) => m.role === "breaker")!.contact, "airborne");
  // Stable per-performer style: the three choir rows differ a little, the same every time.
  const amps = p.counts[0].moves.filter((m) => m.role === "choir").map((m) => m.amplitude);
  assert.equal(new Set(amps).size, 3);
  assert.deepEqual(planCue(map(), map().cues[0]).counts[0].moves.map((m) => m.amplitude), p.counts[0].moves.map((m) => m.amplitude));
});

test("CHOIR8: the wave travels through the rows, a repeat is mirrored, call and response alternate", () => {
  const [, chorus, brk] = planSong(map());
  assert.equal(chorus.relationship, "wave");
  const at = (k: number, id: string) => chorus.counts[k].moves.find((m) => m.id === id)!;
  assert.deepEqual([at(0, "choir-front").active, at(0, "choir-mid").active, at(0, "choir-rear").active], [true, false, false]);
  assert.deepEqual([at(2, "choir-front").count, at(2, "choir-mid").count, at(2, "choir-rear").count], [3, 2, 1]);
  // Sixteen counts: the second phrase mirrors left and right.
  assert.equal(chorus.counts.length, 16);
  assert.deepEqual([at(0, "soloist").arrow, at(8, "soloist").arrow], ["↗", "↖"]);
  assert.equal(at(8, "soloist").direction[0], -at(0, "soloist").direction[0]);
  assert.equal(brk.relationship, "call_response");
  const sol = brk.counts.map((c) => c.moves.find((m) => m.id === "soloist")!.active);
  const choir = brk.counts.map((c) => c.moves.find((m) => m.id === "choir-front")!.active);
  assert.deepEqual(sol, [true, true, true, true, false, false, false, false]);
  assert.deepEqual(choir, sol.map((x) => !x));
});

test("CHOIR8: an unchecked grid is DEFER; a fast song counts in half time; tempo changes and the first downbeat are honoured", () => {
  const draft = planCue(map({ approvalStatus: "draft" }), map().cues[0]);
  assert.equal(draft.gate, "defer");
  assert.ok(draft.counts.every((c) => c.gate === "defer"));
  assert.match(draft.reason, /draft.*unchecked/);
  const fast = planCue(map({ tempo: [{ startBar: 0, bpm: 140, beatsPerBar: 4 }] }), cue({ endBar: 4 }));
  assert.equal(fast.beatsPerCount, 2);
  assert.equal(fast.counts.length, 8, "four bars of 4/4 in half time");
  const shifted = planCue(map({ firstDownbeatSec: 1.25, tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }, { startBar: 2, bpm: 60, beatsPerBar: 4 }] }), cue({ startBar: 2, endBar: 3 }));
  assert.deepEqual(shifted.counts.map((c) => c.timeSec), [5.25, 6.25, 7.25, 8.25], "bar 2 starts at 1.25 + 4 s; then a beat a second");
});

test("CHOIR8 count sheet and command: a page per song, DEFER said plainly", () => {
  const html = countSheetHtml("Song <&>", planSong(map({ approvalStatus: "draft" })));
  assert.ok(html.includes("<title>Song &lt;&amp;&gt; · CHOIR8 count sheet</title>"));
  assert.ok(html.includes("DEFER: the cue map is still a draft"));
  assert.ok(html.includes("Wave: the choir's front row starts"));
  const root = mkdtempSync(join(tmpdir(), "dance8-choir-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => "2026-11-02T00:00:00.000Z", log: (l) => lines.push(l) };
  try {
    const m = emptyManifest();
    m.tracks.push({ trackId: "s1", title: "Synthetic One", sunoPlan: "Pro", addedAt: "2026-11-02T00:00:00.000Z", files: [], voices: [] });
    saveManifest(c, m);
    assert.throws(() => choirSheet(c, "s1"), /no cue map yet/);
    mkdirSync(join(c.library, "s1", "dance8"), { recursive: true });
    writeFileSync(join(c.library, "s1", "dance8", "s1.cuemap.json"), JSON.stringify(map()));
    const r = choirSheet(c, "s1");
    assert.equal(r.plans.length, 3);
    assert.match(readFileSync(r.file, "utf8"), /Synthetic One: CHOIR8 count sheet/);
    assert.equal(DEFAULT_CAST.length, 6);
    assert.ok(lines[0].startsWith("choir count sheet:") && !lines.some((l) => l.includes("DEFER")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
