// lib/dance8/harmony/eventMap.ts
//
// Checks a Kirtled event map (contracts/instrument.ts) against the song's beat
// grid, its harmony timeline and the instrument's canon layout (D8-21), and
// drafts one from the timeline for a person to edit and approve.
//
// The rule it enforces: a finger never triggers an unrelated light or note.
// Each event plays the triangle of the chord sounding at that moment (the
// chord's anchor), lights exactly that chord's triangles, and moves the camera
// only on a bar line. A chord a person has not verified is HOLD: it is played
// and drawn by nothing (D8-25). Pure and deterministic.

import type { HarmonyTimeline, Triad } from "../contracts/harmony";
import type { KirtledArmId, KirtledEventMap, TriangleId } from "../contracts/instrument";
import type { CueMap } from "../contracts/scene";
import { KIRTLED_PLAYER } from "../../canon/vocab";
import { kirtledArms } from "./arms";
import { readChord } from "./chords";
import { sameTriad, triadName } from "./lattice";
import { absBeat, beatsInBar, secAtBeat } from "./pathSolver";

export interface EventMapIssue { path: string; message: string }

/** One event that will be drawn: a verified chord, played and lit. */
export interface PlayedHit {
  id: string;
  /** Seconds from bar 0 (the first downbeat). */
  sec: number;
  bar: number;
  beat: number;
  triangle: TriangleId;
  hand: "left" | "right";
  lights: TriangleId[];
  dancers: "step" | "hold" | "none";
  camera: KirtledEventMap["events"][number]["camera"];
}

export interface EventMapCheck {
  ok: boolean;
  errors: EventMapIssue[];
  warnings: EventMapIssue[];
  /** The events that are drawn, in time order. Events on unverified chords are left out (HOLD). */
  hits: PlayedHit[];
}

const ARMS = kirtledArms();
const ARM_IDS: KirtledArmId[] = ["A", "B", "C"];
const TRI_RE = /^([ABC])([1-8])$/;
const EPS = 1e-6;

/** The triangle a triad sits on ("A1" .. "C8"). Every one of the 24 triads has exactly one. */
export function triangleOf(t: Triad): TriangleId {
  for (const [a, arm] of ARMS.entries()) {
    const k = arm.strip.findIndex((s) => sameTriad(s, t));
    if (k >= 0) return `${ARM_IDS[a]}${k + 1}` as TriangleId;
  }
  throw new Error(`${triadName(t)} is on no arm`);
}

/** The triad on a triangle, or null for an id that names no triangle. */
export function triadOn(id: string): Triad | null {
  const m = TRI_RE.exec(id);
  return m ? ARMS[ARM_IDS.indexOf(m[1] as KirtledArmId)].strip[Number(m[2]) - 1] : null;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Checks `map`. A final (o.final) needs an approved map, an approved harmony
 * timeline, and no event on an unverified chord; a draft allows them, says so,
 * and draws only the verified events.
 */
export function checkEventMap(
  map: KirtledEventMap,
  cue: Pick<CueMap, "trackId" | "tempo" | "cues">,
  timeline: HarmonyTimeline | null,
  o: { final?: boolean } = {},
): EventMapCheck {
  const errors: EventMapIssue[] = [];
  const warnings: EventMapIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });
  const hits: PlayedHit[] = [];
  const done = (): EventMapCheck => ({ ok: errors.length === 0, errors, warnings, hits: errors.length ? [] : hits });

  if (map.schemaVersion !== 1) err("schemaVersion", "must be 1");
  if (map.trackId !== cue.trackId) err("trackId", `is "${map.trackId}", but the cue map is for "${cue.trackId}"`);
  if (map.source !== "prerecorded") err("source", "must be prerecorded: the song exists before the performance, so the map is authored");
  if (!timeline) err("harmonyTimelineId", "the song has no harmony timeline yet; the events have no chords to stand for");
  else if (map.harmonyTimelineId !== timeline.id) err("harmonyTimelineId", `is "${map.harmonyTimelineId}", but the song's timeline is "${timeline.id}"`);
  if (!Array.isArray(map.events)) err("events", "must be a list");
  if (o.final) {
    if (map.status !== "approved" || !map.approvedBy || !map.approvedAt) err("status", "a final follows an approved event map (approvedBy and approvedAt)");
  } else if (map.status !== "approved") warn("status", "the event map is a draft (fine for a draft)");
  if (errors.length || !timeline) return done();

  const tempo = cue.tempo;
  const songEndBar = Math.max(0, ...cue.cues.map((c) => c.endBar));
  const timelineVerified = timeline.approvalStatus === "approved" && !!timeline.approvedBy;
  if (!timelineVerified) (o.final ? err : warn)("harmonyTimelineId", `the chord timeline "${timeline.id}" is not approved, so no chord is verified: every event holds and nothing is drawn`);
  const chords = timeline.events
    .map((e) => ({ e, at: absBeat(tempo, e.startBar, e.startBeat) }))
    .sort((a, b) => a.at - b.at);

  const ids = new Set<string>();
  const handAt = new Set<string>();
  let last = -Infinity;
  map.events.forEach((ev, i) => {
    const p = `events[${i}]`;
    if (!ev.id || ids.has(ev.id)) err(`${p}.id`, ev.id ? `"${ev.id}" is used twice` : "is missing");
    ids.add(ev.id);
    if (!(Number.isInteger(ev.bar) && ev.bar >= 0 && ev.bar < songEndBar)) { err(`${p}.bar`, `must be a whole bar from 0 to ${songEndBar - 1}`); return; }
    const bpb = beatsInBar(tempo, ev.bar);
    if (!(ev.beat >= 0 && ev.beat < bpb && Math.abs(ev.beat * 4 - Math.round(ev.beat * 4)) < EPS)) { err(`${p}.beat`, `must be on a sixteenth, from 0 to under ${bpb}`); return; }
    const at = absBeat(tempo, ev.bar, ev.beat);
    if (at < last - EPS) err(p, "is earlier than the event before it; keep the events in time order");
    last = at;

    // 1. The playing.
    const played = triadOn(ev.play?.triangle ?? "");
    if (!played) { err(`${p}.play.triangle`, "must name a triangle, A1 to C8 (arm, then 1 next to the hub to 8 at the tip)"); return; }
    if (!["left", "right"].includes(ev.play.hand)) { err(`${p}.play.hand`, "must be left or right"); return; }
    const key = `${at.toFixed(4)}|${ev.play.hand}`;
    if (handAt.has(key)) err(`${p}.play.hand`, `the ${ev.play.hand} hand already plays at bar ${ev.bar}, beat ${ev.beat}`);
    handAt.add(key);

    // 2. The musical event: the chord sounding at that moment, and it must be the one named.
    const k = chords.findIndex((c, j) => c.at <= at + EPS && (j + 1 === chords.length || at < chords[j + 1].at - EPS));
    const h = k >= 0 ? chords[k].e : undefined;
    if (!h) { err(`${p}.music`, "comes before the first chord of the timeline"); return; }
    if (ev.music?.harmonyEventId !== h.id) { err(`${p}.music.harmonyEventId`, `the chord sounding here is ${h.id} (${h.symbol}), not "${ev.music?.harmonyEventId}"`); return; }
    if (ev.music.chord !== h.symbol) err(`${p}.music.chord`, `${h.id} is written "${h.symbol}", not "${ev.music.chord}"`);
    const r = readChord(h.symbol);
    if (!r.anchor) { err(p, `${h.symbol} has no honest triangle (${r.note}); nothing can be played on it`); return; }
    if (!sameTriad(played, r.anchor)) {
      err(`${p}.play.triangle`, `${ev.play.triangle} is ${triadName(played)}, but the chord here is ${h.symbol}, played on ${triangleOf(r.anchor)}: a hand plays only the chord it stands for`);
      return;
    }

    // 3. The answer on screen: exactly the chord's own triangles.
    const lit = r.lit.map(triangleOf);
    if (!Array.isArray(ev.visual?.lights) || !sameSet(ev.visual.lights, lit)) err(`${p}.visual.lights`, `${h.symbol} lights ${lit.join(" and ")}, and nothing else`);
    if (!["step", "hold", "none"].includes(ev.visual?.dancers)) err(`${p}.visual.dancers`, "must be step, hold or none");

    // 4. The camera: changes only on a bar line.
    const cam = ev.camera ?? { action: "hold" };
    if (!["hold", "enlarge", "switch"].includes(cam.action)) err(`${p}.camera.action`, "must be hold, enlarge or switch");
    else if (cam.action !== "hold" && Math.abs(ev.beat) > EPS) err(`${p}.camera.action`, `${cam.action} changes the picture, so it lands on a bar line (beat 0)`);
    if (cam.action === "switch" && !["CAM-KIR-01", "CAM-KIR-02"].includes(cam.to ?? "")) err(`${p}.camera.to`, "a switch names CAM-KIR-01 or CAM-KIR-02");
    if (cam.action !== "switch" && cam.to !== undefined) err(`${p}.camera.to`, "only a switch names a camera");

    // Verified by a person, or it holds (D8-25).
    const verified = timelineVerified && (r.status === "verified" || (r.status === "approximate" && !!h.approvedBy));
    if (!verified) {
      if (timelineVerified) (o.final ? err : warn)(p, `${h.symbol} is ${r.status === "approximate" ? "an approximation nobody approved" : "unverified"}; this event holds and draws nothing`);
      return;
    }
    hits.push({
      id: ev.id, sec: secAtBeat(tempo, at), bar: ev.bar, beat: ev.beat, triangle: ev.play.triangle, hand: ev.play.hand,
      lights: lit, dancers: ev.visual.dancers, camera: cam,
    });
  });
  return done();
}

/**
 * A first event map from the harmony timeline, for a person to edit and
 * approve: one event on each chord change that has a triangle, played on the
 * chord's anchor; the left hand takes the left branch (arm B), the right hand
 * the right branch (arm C), and the stem (arm A) goes to the hand that did not
 * play last. The camera holds and the dancers step. The player is EDO EDO
 * BOY (canon D8-24) unless `performer` says otherwise. Chords with no honest
 * triangle are left out and listed.
 */
export function draftEventMap(
  timeline: HarmonyTimeline,
  o: { id: string; trackId: string; performer?: string | null },
): { map: KirtledEventMap; skipped: { harmonyEventId: string; why: string }[] } {
  const skipped: { harmonyEventId: string; why: string }[] = [];
  const events: KirtledEventMap["events"] = [];
  let lastHand: "left" | "right" = "left";
  const sorted = [...timeline.events].sort((a, b) => a.startBar - b.startBar || a.startBeat - b.startBeat);
  for (const h of sorted) {
    const r = readChord(h.symbol);
    if (!r.anchor) { skipped.push({ harmonyEventId: h.id, why: r.note }); continue; }
    const triangle = triangleOf(r.anchor);
    const arm = triangle[0];
    const hand: "left" | "right" = arm === "B" ? "left" : arm === "C" ? "right" : lastHand === "left" ? "right" : "left";
    lastHand = hand;
    events.push({
      id: `k${String(events.length + 1).padStart(3, "0")}`, bar: h.startBar, beat: h.startBeat,
      play: { triangle, hand }, music: { harmonyEventId: h.id, chord: h.symbol },
      visual: { lights: r.lit.map(triangleOf), dancers: "step" }, camera: { action: "hold" },
    });
  }
  return {
    map: { id: o.id, schemaVersion: 1, trackId: o.trackId, harmonyTimelineId: timeline.id, source: "prerecorded", performer: o.performer ?? KIRTLED_PLAYER, status: "draft", events },
    skipped,
  };
}
