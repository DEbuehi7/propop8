/**
 * Pins every decision (gate, selected clip, reason code, aggregate confidence)
 * the Dance8 orchestrator makes on the demo track. Regenerate deliberately with
 *   UPDATE_GOLDEN=1 npm test
 * and review the diff; never to make a change pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Orchestrator } from "../../lib/dance8/runtime/Orchestrator";
import clipsData from "../../fixtures/clips-demo.json";
import graphData from "../../fixtures/transitions-demo.json";
import policyData from "../../fixtures/policy-v1.json";
import trackData from "../../fixtures/track-demo.json";
import type { MotionLibrary } from "../../lib/dance8/authoring/validateBundle";
import type { TransitionGraph } from "../../lib/dance8/contracts/transition";
import type { RuntimePolicy } from "../../lib/dance8/contracts/policy";
import type { SignalFrame } from "../../lib/dance8/contracts/signal";

const track = trackData as unknown as { analysisProfile: { id: string }; frames: (SignalFrame & { t: number })[] };
const library = clipsData as unknown as MotionLibrary;

function produce() {
  return track.frames.map((fr) => {
    const o = new Orchestrator(
      track.frames,
      library.clips,
      graphData as unknown as TransitionGraph,
      policyData as unknown as RuntimePolicy,
      "golden",
      track.analysisProfile.id,
      { currentTime: 0 },
    );
    o.seek(fr.t * 1000);
    const d = o.makeDecision();
    const e = o.getTrace().getEntries().slice(-1)[0];
    return { t: fr.t, gate: d.gate, clip: d.selectedClipId ?? null, reason: e.reasonCode, aggregate: d.confidence.aggregate };
  });
}

test("dance8 golden: demo-track decisions are unchanged", () => {
  const actual = produce();
  const path = join(__dirname, "..", "fixtures", "dance8_decisions_golden.json");
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(path)) {
    writeFileSync(path, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(path, "utf8")));
});
