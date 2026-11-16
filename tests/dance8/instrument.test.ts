/**
 * The Kirtled instrument as a performer: the event map (lib/dance8/harmony/eventMap.ts),
 * the instrument cameras CAM-KIR-01 and CAM-KIR-02 in the grid, and the completeness
 * rule (lib/dance8/render/grid.ts), and the drawn stand-ins (render/kirtledView.ts).
 * Synthetic data only: a made-up chord progression, cue map and clips.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { HarmonyEvent, HarmonyTimeline, Triad } from "../../lib/dance8/contracts/harmony";
import type { KirtledEventMap, PrincipalList } from "../../lib/dance8/contracts/instrument";
import type { VisualClip, VisualClipLibrary } from "../../lib/dance8/contracts/scene";
import { checkEventMap, draftEventMap, triadOn, triangleOf } from "../../lib/dance8/harmony/eventMap";
import { triad, triadName } from "../../lib/dance8/harmony/lattice";
import { resolveGrid, type GridPlan } from "../../lib/dance8/render/grid";
import { kirtledFrames } from "../../lib/dance8/render/kirtledView";
import { KIRTLED_ARMS } from "../../lib/canon/vocab";

const cue = {
  trackId: "song", tempo: [{ startBar: 0, bpm: 120, beatsPerBar: 4 }], firstDownbeatSec: 0.5, maxDriftScore: 0.3, vocals: [],
  cues: [{ id: "all", section: "verse" as const, startBar: 0, endBar: 16, sceneId: "stage", cameras: ["wide" as const], shotBars: 2 }],
};
const ev = (id: string, startBar: number, startBeat: number, symbol: string, extra: Partial<HarmonyEvent> = {}): HarmonyEvent => ({ id, startBar, startBeat, symbol, ...extra });
/** C, Am, Cmaj7 (two triangles), G7 (an approximation), Bdim (no triangle): bars 0 to 4. */
const timeline = (extra: Partial<HarmonyTimeline> = {}): HarmonyTimeline => ({
  id: "song-chords", schemaVersion: 1, trackId: "song", analysisProfileId: "test",
  events: [ev("h1", 0, 0, "C"), ev("h2", 1, 0, "Am"), ev("h3", 2, 0, "Cmaj7"), ev("h4", 3, 0, "G7"), ev("h5", 4, 0, "Bdim")],
  approvalStatus: "approved", approvedBy: "the owner", approvedAt: "2026-11-15T00:00:00Z", ...extra,
});
const approvedMap = (m: KirtledEventMap): KirtledEventMap => ({ ...m, status: "approved", approvedBy: "the owner", approvedAt: "2026-11-15T00:00:00Z" });
const draft = () => draftEventMap(timeline(), { id: "song-kirtled-events", trackId: "song" });

test("triangles: every one of the 24 chords sits on exactly one triangle, as canon D8-21 lays them out", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const t: Triad = triad(i >> 1, i % 2 ? "min" : "maj");
    const id = triangleOf(t);
    seen.add(id);
    assert.equal(triadName(triadOn(id)!), triadName(t));
    assert.equal(KIRTLED_ARMS["ABC".indexOf(id[0])].strip[Number(id[1]) - 1], triadName(t), `${triadName(t)} on ${id}`);
  }
  assert.equal(seen.size, 24);
  assert.equal(triadOn("D1"), null);
  assert.equal(triadOn("A9"), null);
});

test("draft: one event per chord with a triangle, on the chord's anchor; branches take their own hand; sevenths light two triangles", () => {
  const { map, skipped } = draft();
  assert.deepEqual(map.events.map((e) => [e.music.chord, e.play.triangle]), [["C", "A1"], ["Am", "A2"], ["Cmaj7", "A1"], ["G7", "B5"]]);
  assert.deepEqual(skipped.map((s) => s.harmonyEventId), ["h5"], "Bdim has no honest triangle");
  assert.equal(map.events[3].play.hand, "left", "arm B, the left branch, is the left hand");
  assert.deepEqual(map.events.slice(0, 3).map((e) => e.play.hand), ["right", "left", "right"], "the stem alternates hands");
  assert.deepEqual([...map.events[2].visual.lights].sort(), ["A1", "B6"], "Cmaj7 lights C and Em");
  assert.equal(map.status, "draft");
  assert.equal(map.source, "prerecorded");
  assert.ok(map.events.every((e) => e.camera.action === "hold"));
});

test("check: verified chords are drawn; an unapproved approximation holds; nothing holds silently in a final", () => {
  const m = draft().map;
  const d = checkEventMap(m, cue, timeline());
  assert.ok(d.ok, JSON.stringify(d.errors));
  assert.deepEqual(d.hits.map((h) => h.triangle), ["A1", "A2", "A1"], "G7 nobody approved holds");
  assert.equal(d.hits[1].sec, 2, "bar 1 at 120 BPM is 2 s from bar 0");
  assert.ok(d.warnings.some((w) => /G7.*holds/.test(w.message)));
  assert.ok(d.warnings.some((w) => w.path === "status"), "a draft map says so");

  const f = checkEventMap(approvedMap(m), cue, timeline(), { final: true });
  assert.ok(!f.ok && f.errors.some((e) => /G7/.test(e.message)), "a final refuses the unapproved approximation");
  const t2 = timeline({ events: timeline().events.map((e) => (e.id === "h4" ? { ...e, approvedBy: "the owner" } : e)) });
  const ok = checkEventMap(approvedMap(m), cue, t2, { final: true });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  assert.equal(ok.hits.length, 4);
  assert.ok(!checkEventMap(m, cue, t2, { final: true }).ok, "a final needs the map itself approved");
});

test("check: with no verified chord timeline every event holds and nothing is drawn (D8-25)", () => {
  const t = timeline({ approvalStatus: "draft", approvedBy: undefined, approvedAt: undefined });
  const d = checkEventMap(draft().map, cue, t);
  assert.ok(d.ok);
  assert.equal(d.hits.length, 0);
  assert.ok(!checkEventMap(approvedMap(draft().map), cue, t, { final: true }).ok);
  assert.ok(!checkEventMap(draft().map, cue, null).ok, "no timeline, no chords to stand for");
});

test("check: a finger never triggers an unrelated note or light, and the camera moves only on a bar line", () => {
  const broken = (f: (m: KirtledEventMap) => void) => {
    const m = structuredClone(draft().map);
    f(m);
    return checkEventMap(m, cue, timeline()).errors.map((e) => `${e.path}: ${e.message}`).join("\n");
  };
  assert.match(broken((m) => { m.events[1].play.triangle = "C1"; }), /C1 is D, but the chord here is Am, played on A2/);
  assert.match(broken((m) => { m.events[0].visual.lights = ["A1", "A2"]; }), /C lights A1, and nothing else/);
  assert.match(broken((m) => { m.events[2].visual.lights = ["A1"]; }), /Cmaj7 lights A1 and B6/);
  assert.match(broken((m) => { m.events[0].music.harmonyEventId = "h2"; }), /the chord sounding here is h1 \(C\)/);
  assert.match(broken((m) => { m.events[0].music.chord = "Am"; }), /h1 is written "C"/);
  assert.match(broken((m) => { m.events[1].beat = 2; m.events[1].camera = { action: "enlarge" }; }), /enlarge changes the picture, so it lands on a bar line/);
  assert.match(broken((m) => { m.events[0].camera = { action: "switch" }; }), /a switch names CAM-KIR-01 or CAM-KIR-02/);
  assert.match(broken((m) => { m.events[0].camera = { action: "hold", to: "CAM-KIR-02" }; }), /only a switch names a camera/);
  assert.match(broken((m) => { m.events[0].beat = 0.3; }), /on a sixteenth/);
  assert.match(broken((m) => { m.events.push({ ...structuredClone(m.events[0]), id: "k999" }); }), /earlier than the event before it|right hand already plays/);
  assert.match(broken((m) => { m.events[1] = { ...structuredClone(m.events[1]), bar: 0, beat: 0, id: "k002", play: { triangle: "A1", hand: "right" }, music: { harmonyEventId: "h1", chord: "C" }, visual: { lights: ["A1"], dancers: "step" } }; }), /the right hand already plays at bar 0, beat 0/);
  assert.match(broken((m) => { m.events[0].id = m.events[1].id; }), /used twice/);
  assert.match(broken((m) => { m.trackId = "other"; }), /cue map is for "song"/);
});

// --- The instrument cameras and the completeness rule in the grid ---

const clip = (id: string, extra: Partial<VisualClip> = {}): VisualClip => ({
  id, schemaVersion: 1, sceneId: "stage", camera: "wide", durationSec: 40, aspect: "16:9", file: `${id}.mp4`,
  source: { type: "ai_generated", createdAt: "2026-11-15T00:00:00Z", license: "proprietary" },
  drift: { status: "known", driftScore: 0.1, method: "human_review" }, approvalStatus: "approved", ...extra,
});
const kir = (id: string, camera: "CAM-KIR-01" | "CAM-KIR-02", extra: Partial<VisualClip> = {}) =>
  clip(id, { instrument: { camera, eventMapId: "song-kirtled-events", songStartSec: 0.5 }, ...extra });
const plan = (blocks: GridPlan["blocks"]): GridPlan => ({ id: "t", schemaVersion: 1, trackId: "song", aspect: "16:9", blocks });
const instrumentBlocks: GridPlan["blocks"] = [
  { startBar: 0, endBar: 2, layout: "one", primary: 0, cells: [{ view: "instrument", camera: "CAM-KIR-01" }] },
  { startBar: 2, endBar: 4, layout: "three", primary: 0, cells: [{ view: "instrument", camera: "CAM-KIR-01" }, { clipId: "stuttr" }, { clipId: "dancers" }] },
  { startBar: 4, endBar: 6, layout: "three", primary: 1, cells: [{ clipId: "stuttr" }, { view: "instrument", camera: "CAM-KIR-02" }, { view: "kirtled" }] },
];
const principals: PrincipalList = {
  schemaVersion: 1, trackId: "song",
  principals: [{ id: "stuttr", kind: "performer", name: "Stuttr" }, { id: "kirtled", kind: "instrument", name: "Kirtled" }],
};
const lib = (...clips: VisualClip[]): VisualClipLibrary => ({ version: 1, clips: [clip("stuttr", { isolates: "stuttr" }), clip("dancers"), ...clips] });

test("grid: an instrument camera can lead a block; without footage a draft draws a stand-in and a final refuses", () => {
  const d = resolveGrid(plan(instrumentBlocks), cue, lib(), { fps: 24, principals });
  assert.ok(d.ok, JSON.stringify(d.errors));
  assert.deepEqual(d.blocks[0].cells.map((c) => [c.view, c.camera, c.primary]), [["instrument", "CAM-KIR-01", true]]);
  assert.deepEqual(d.blocks[2].cells.map((c) => c.camera ?? c.view), ["clip", "CAM-KIR-02", "kirtled"]);
  assert.ok(d.blocks[2].cells[1].primary, "the close-up leads");
  assert.ok(d.warnings.some((w) => /CAM-KIR-01 has no footage here yet: a drawn stand-in/.test(w.message)));
  const f = resolveGrid(plan(instrumentBlocks), cue, lib(), { fps: 24, approved: true, principals, eventMap: { id: "song-kirtled-events", approved: true } });
  assert.ok(!f.ok && f.errors.some((e) => /a final shows the instrument itself, not the drawn stand-in/.test(e.message)));
});

test("grid: instrument footage plays where it lines up with the song, and a final needs it played to the approved event map", () => {
  const library = lib(kir("kir-over", "CAM-KIR-01"), kir("kir-close", "CAM-KIR-02"));
  const d = resolveGrid(plan(instrumentBlocks), cue, library, { fps: 24, principals });
  assert.ok(d.ok, JSON.stringify(d.errors));
  assert.deepEqual(d.blocks[1].cells[0], { ...d.blocks[1].cells[0], view: "clip", clipId: "kir-over", camera: "CAM-KIR-01", inSec: 4 }, "bar 2 is 4 s into a clip that starts at song 0.5 s");
  const ok = resolveGrid(plan(instrumentBlocks), cue, library, { fps: 24, approved: true, principals, eventMap: { id: "song-kirtled-events", approved: true } });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  const unapproved = resolveGrid(plan(instrumentBlocks), cue, library, { fps: 24, approved: true, principals, eventMap: { id: "song-kirtled-events", approved: false } });
  assert.ok(unapproved.errors.some((e) => /played to the song's approved event map/.test(e.message)));
  const other = resolveGrid(plan(instrumentBlocks), cue, library, { fps: 24, approved: true, principals, eventMap: { id: "another-map", approved: true } });
  assert.ok(!other.ok);
  const twice = resolveGrid(plan([{ startBar: 0, endBar: 2, layout: "three", primary: 0, cells: [{ view: "instrument", camera: "CAM-KIR-01" }, { view: "instrument", camera: "CAM-KIR-01" }, { clipId: "stuttr" }] }]), cue, library, { fps: 24, principals });
  assert.ok(twice.errors.some((e) => /shows CAM-KIR-01 in more than one cell/.test(e.message)));
  const bad = resolveGrid(plan([{ startBar: 0, endBar: 2, layout: "one", primary: 0, cells: [{ view: "instrument" }] }]), cue, library, { fps: 24 });
  assert.ok(bad.errors.some((e) => /must be CAM-KIR-01 \(overhead\) or CAM-KIR-02 \(close\)/.test(e.message)));
});

test("completeness: every principal has an approved view of its own before a final; a draft lists what is missing", () => {
  const library = lib(kir("kir-over", "CAM-KIR-01"));
  const final = (o: { principals?: PrincipalList | null; library?: VisualClipLibrary }) =>
    resolveGrid(plan(instrumentBlocks.slice(0, 2)), cue, o.library ?? library, { fps: 24, approved: true, principals: o.principals, eventMap: { id: "song-kirtled-events", approved: true } });
  const ok = final({ principals });
  assert.ok(ok.ok, JSON.stringify(ok.errors));
  assert.ok(ok.warnings.some((w) => /no approved CAM-KIR-02 footage/.test(w.message)), "the close-up is wanted, not required");
  assert.ok(final({ principals: null }).errors.some((e) => /no principal list/.test(e.message)));
  const noKirtled = { ...principals, principals: principals.principals.filter((x) => x.id !== "kirtled") };
  assert.ok(final({ principals: noKirtled }).errors.some((e) => /the plan shows Kirtled, so the principal list must name it/.test(e.message)));
  const withBravados = { ...principals, principals: [...principals.principals, { id: "bravados", kind: "performer" as const, name: "8th Street Bravados" }] };
  assert.ok(final({ principals: withBravados }).errors.some((e) => /8th Street Bravados has no approved clip of its own/.test(e.message)));
  const draftOver = { version: 1, clips: [clip("stuttr", { isolates: "stuttr" }), clip("dancers"), kir("kir-over", "CAM-KIR-01", { approvalStatus: "draft" })] };
  assert.ok(final({ principals, library: draftOver }).errors.some((e) => /Kirtled has no approved CAM-KIR-01 footage/.test(e.message)));
  const d = resolveGrid(plan(instrumentBlocks.slice(0, 2)), cue, lib(), { fps: 24, principals: withBravados });
  assert.ok(d.ok);
  assert.ok(d.warnings.some((w) => /Kirtled has no approved CAM-KIR-01 footage.*fine for a draft/.test(w.message)));
  assert.ok(d.warnings.some((w) => /8th Street Bravados has no approved clip/.test(w.message)));
});

// --- The drawn stand-ins ---

const sha = (frames: Uint8Array[]) => createHash("sha256").update(Buffer.concat(frames)).digest("hex");
const brightness = (f: Uint8Array) => f.reduce((n, v) => n + v, 0);

test("stand-ins: at rest nothing moves; a played event lights its chord and marks the hand; the same bytes every time", () => {
  const base = { width: 320, height: 180, fps: 24, startSec: 0, frames: 48, bpm: 120, beatsPerBar: 4 };
  const rest = [...kirtledFrames({ ...base, view: "overhead" })];
  assert.ok(rest.every((f) => Buffer.compare(Buffer.from(f), Buffer.from(rest[0])) === 0), "with no events the instrument stays at rest: no pulse, no light");
  const hits = [{ sec: 1, triangle: "A2", hand: "left" as const, lights: ["A2"] }];
  const run = () => [...kirtledFrames({ ...base, view: "overhead", hits })];
  const a = run();
  assert.equal(sha(a), sha(run()));
  assert.equal(Buffer.compare(Buffer.from(a[10]), Buffer.from(rest[10])), 0, "before the hand arrives, nothing has changed");
  assert.ok(brightness(a[24]) > brightness(rest[24]) * 1.05, "on the hit the chord's triangle lights and the hand's ring shows");
  assert.ok(brightness(a[47]) > brightness(rest[47]), "the chord stays lit until the next event");
  const close = [...kirtledFrames({ ...base, view: "detail", hits })];
  assert.notEqual(sha(close), sha(a), "the close-up is its own picture");
  assert.ok(brightness(close[24]) > brightness(close[10]), "close on the played triangle, the hit shows");
});
