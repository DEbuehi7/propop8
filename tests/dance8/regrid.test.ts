/**
 * dance8 plan --regrid (lib/dance8/authoring/regrid.ts): a cue map moves onto
 * a corrected beat grid by song time. The section layout is EDO's (tracked at
 * 119.476 BPM, verified by the owner at 93.995 BPM with bar 1 at 0.075 s);
 * the rest is synthetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CueMap, VocalPhrase } from "../../lib/dance8/contracts/scene";
import { regridCueMap, shotRenames } from "../../lib/dance8/authoring/regrid";
import type { ShotBrief } from "../../lib/dance8/authoring/shotBriefs";

const EDO_SECTIONS: [string, number, number][] = [
  ["intro-mask", 0, 2], ["intro-tree", 2, 4], ["v1-room", 4, 6], ["v1-sing", 6, 9], ["v1-street", 9, 12], ["v1-memory", 12, 14],
  ["v1-instrument", 14, 16], ["v1-mask", 16, 19], ["v1-ghost", 19, 21], ["bridge-ghost", 21, 24], ["v2-warehouse", 24, 28],
  ["v2-dance", 28, 32], ["v2-youth", 32, 34], ["v3-bravados", 34, 38], ["hook-hall", 38, 42], ["instr-duet", 42, 45],
  ["instr-plaza", 45, 48], ["instr-instrument", 48, 51], ["outro-dance", 51, 56], ["outro-answer", 56, 58], ["outro-tree", 58, 62],
];
const phrase = (id: string, startBar: number, endBar: number): VocalPhrase => ({ id, voice: "Stuttr", startBar, endBar });

function edoMap(over: Partial<CueMap> = {}): CueMap {
  return {
    id: "cuemap-edo", schemaVersion: 1, version: 2, trackId: "edo", analysisProfileId: "stuttr-analysis-1", aspect: "16:9",
    tempo: [{ startBar: 0, bpm: 119.476, beatsPerBar: 4 }], firstDownbeatSec: 0.391,
    cues: EDO_SECTIONS.map(([id, startBar, endBar]) => ({ id, section: "verse", startBar, endBar, sceneId: id, cameras: ["wide"], shotBars: 1 })),
    vocals: [phrase("lead-1", 4, 21), phrase("lead-2", 22, 23), phrase("lead-3", 24, 33), phrase("lead-4", 34, 42), phrase("lead-5", 51, 57), phrase("lead-6", 58, 62)],
    fallbackClipId: "placeholder-black", maxDriftScore: 0.25, approvalStatus: "draft", ...over,
  };
}
const EDO_94 = { bpm: 93.995, beatsPerBar: 4, firstDownbeatSec: 0.075, bars: 49 };

test("EDO: every section keeps its place in the song on the 94 BPM grid", () => {
  const { map, report } = regridCueMap(edoMap(), EDO_94);
  assert.deepEqual(map.tempo, [{ startBar: 0, bpm: 93.995, beatsPerBar: 4 }]);
  assert.equal(map.firstDownbeatSec, 0.075);
  assert.equal(map.version, 3);
  assert.deepEqual(map.cues.map((q) => [q.id, q.startBar, q.endBar]), [
    ["intro-mask", 0, 2], ["intro-tree", 2, 3], ["v1-room", 3, 5], ["v1-sing", 5, 7], ["v1-street", 7, 10], ["v1-memory", 10, 11],
    ["v1-instrument", 11, 13], ["v1-mask", 13, 15], ["v1-ghost", 15, 17], ["bridge-ghost", 17, 19], ["v2-warehouse", 19, 22],
    ["v2-dance", 22, 25], ["v2-youth", 25, 27], ["v3-bravados", 27, 30], ["hook-hall", 30, 33], ["instr-duet", 33, 36],
    ["instr-plaza", 36, 38], ["instr-instrument", 38, 40], ["outro-dance", 40, 44], ["outro-answer", 44, 46], ["outro-tree", 46, 49],
  ]);
  assert.deepEqual(map.cues.map((q) => [q.sceneId, q.cameras, q.shotBars]), edoMap().cues.map((q) => [q.sceneId, q.cameras, q.shotBars]), "scenes, cameras and shot lengths stay");
  // Each boundary lands within half a new bar (1.28 s) of where it was in the song.
  for (const q of report.cues) assert.ok(Math.abs(q.newSec[0] - q.oldSec[0]) <= 1.277, `${q.id} moved ${q.newSec[0] - q.oldSec[0]} s`);
  assert.deepEqual(report.cues.find((q) => q.id === "hook-hall"), { id: "hook-hall", oldBars: [38, 42], newBars: [30, 33], oldSec: [76.724, 84.759], newSec: [76.675, 84.335] });
});

test("sung phrases take the vocal stem's runs on the new grid, else widen to whole bars", () => {
  // Without a measurement: widened (an earlier start, a later end).
  const bare = regridCueMap(edoMap(), EDO_94);
  assert.deepEqual(bare.map.vocals!.map((v) => [v.id, v.startBar, v.endBar]), [
    ["lead-1", 3, 17], ["lead-2", 17, 19], ["lead-3", 19, 26], ["lead-4", 27, 34], ["lead-5", 40, 45], ["lead-6", 45, 49],
  ]);
  assert.equal(bare.report.notes.filter((n) => n.includes("no sung run there")).length, 6, "every phrase is flagged for a listen");
  // With EDO's measured runs: lead-4 ends a bar earlier and lead-6 starts a bar later, as the stem sings them.
  const measured = [phrase("m1", 3, 17), phrase("m2", 17, 19), phrase("m3", 19, 26), phrase("m4", 27, 33), phrase("m5", 40, 45), phrase("m6", 46, 49)];
  const fit = regridCueMap(edoMap(), EDO_94, measured);
  assert.deepEqual(fit.map.vocals!.map((v) => [v.id, v.voice, v.startBar, v.endBar]), [
    ["lead-1", "Stuttr", 3, 17], ["lead-2", "Stuttr", 17, 19], ["lead-3", "Stuttr", 19, 26], ["lead-4", "Stuttr", 27, 33], ["lead-5", "Stuttr", 40, 45], ["lead-6", "Stuttr", 46, 49],
  ], "ids and voices stay");
  assert.deepEqual(fit.report.notes, []);
  // Runs that would make two phrases overlap fall back to the widened bars.
  const greedy = regridCueMap(edoMap(), EDO_94, [phrase("a", 3, 18), phrase("b", 17, 19)]);
  const v = greedy.map.vocals!;
  for (let i = 1; i < v.length; i++) assert.ok(v[i].startBar >= v[i - 1].endBar, `${v[i - 1].id} and ${v[i].id} overlap`);
});

test("a section never shrinks to nothing, the end is checked, and an approved map is a draft again", () => {
  const tiny = edoMap({
    cues: [
      { id: "a", section: "intro", startBar: 0, endBar: 10, sceneId: "s", cameras: ["wide"], shotBars: 1 },
      { id: "flash", section: "verse", startBar: 10, endBar: 11, sceneId: "s", cameras: ["wide"], shotBars: 1 },
      { id: "b", section: "verse", startBar: 11, endBar: 70, sceneId: "s", cameras: ["wide"], shotBars: 1 },
    ],
    vocals: [], approvalStatus: "approved", approvedBy: "owner", approvedAt: "2026-11-01T00:00:00Z",
  });
  const { map, report } = regridCueMap(tiny, { bpm: 60, beatsPerBar: 4, firstDownbeatSec: 0.391, bars: 30 });
  assert.deepEqual(map.cues.map((q) => [q.id, q.startBar, q.endBar]), [["a", 0, 5], ["flash", 5, 6], ["b", 6, 30]]);
  assert.equal(map.approvalStatus, "draft");
  assert.equal(map.approvedBy, undefined);
  assert.ok(report.notes.includes("the cue map was approved; it is a draft again until you check the new bars"));
  assert.ok(report.notes.includes("the last section ran 5 bar(s) past the song's 30 on the new grid; it now stops at bar 30"));
  const collapse = regridCueMap(edoMap({ cues: [
    { id: "a", section: "intro", startBar: 0, endBar: 1, sceneId: "s", cameras: ["wide"], shotBars: 1 },
    { id: "b", section: "verse", startBar: 1, endBar: 2, sceneId: "s", cameras: ["wide"], shotBars: 1 },
  ], vocals: [] }), { bpm: 30, beatsPerBar: 4, firstDownbeatSec: 0.391, bars: 10 });
  assert.deepEqual(collapse.map.cues.map((q) => [q.id, q.startBar, q.endBar]), [["a", 0, 1], ["b", 1, 2]]);
  assert.ok(collapse.report.notes.some((n) => n.startsWith("a was shorter than a bar")));
  assert.throws(() => regridCueMap(edoMap(), { bpm: 0, beatsPerBar: 4, firstDownbeatSec: 0, bars: 49 }), /needs a tempo/);
});

test("shot renames: b-roll ids stay, lip-sync ids follow their bar", () => {
  const b = (id: string, kind: ShotBrief["kind"], cueId: string, camera: string, voice?: string) => ({ id, kind, cueId, camera, voice }) as ShotBrief;
  const before = [b("broll-v1-sing-wide", "broll", "v1-sing", "wide"), b("lip_sync-v1-sing-close-Stuttr-b6", "lip_sync", "v1-sing", "close", "Stuttr"), b("broll-gone-wide", "broll", "gone", "wide")];
  const after = [b("broll-v1-sing-wide", "broll", "v1-sing", "wide"), b("lip_sync-v1-sing-close-Stuttr-b5", "lip_sync", "v1-sing", "close", "Stuttr"), b("broll-new-orbit", "broll", "new", "orbit")];
  assert.deepEqual(shotRenames(before, after), {
    renamed: [["lip_sync-v1-sing-close-Stuttr-b6", "lip_sync-v1-sing-close-Stuttr-b5"]], gone: ["broll-gone-wide"], added: ["broll-new-orbit"],
  });
});
