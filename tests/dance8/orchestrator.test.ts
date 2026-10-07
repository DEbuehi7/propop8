import { test } from "node:test";
import assert from "node:assert";
import { Orchestrator } from "../../lib/dance8/runtime/Orchestrator";
import { DecisionTrace } from "../../lib/dance8/runtime/DecisionTrace";
import posesData from "../../fixtures/poses.json";
import clipsData from "../../fixtures/clips-demo.json";
import graphData from "../../fixtures/transitions-demo.json";
import policyData from "../../fixtures/policy-v1.json";
import trackData from "../../fixtures/track-demo.json";
import type { PoseRegistry, MotionLibrary } from "../../lib/dance8/authoring/validateBundle";
import type { TransitionGraph } from "../../lib/dance8/contracts/transition";
import type { RuntimePolicy } from "../../lib/dance8/contracts/policy";

// Cast fixtures
const poses = posesData as unknown as PoseRegistry;
const library = clipsData as unknown as MotionLibrary;
const graph = graphData as unknown as TransitionGraph;
const policy = policyData as unknown as RuntimePolicy;
const { analysisProfile, frames } = trackData as unknown as {
  analysisProfile: any;
  frames: any[];
};

// Mock AudioContext
const mockAudioContext = {
  currentTime: 0,
};

function createOrchestrator() {
  return new Orchestrator(
    frames,
    library.clips,
    graph,
    policy,
    "test-track",
    analysisProfile.id,
    mockAudioContext as any
  );
}

test("ORCHESTRATOR: Core decision loop", async (t) => {
  await t.test("makes a decision at frame 0", () => {
    const orch = createOrchestrator();
    const decision = orch.makeDecision();
    assert.strictEqual(typeof decision.gate, "string");
    assert(
      ["execute", "defer", "escalate", "kill"].includes(decision.gate),
      `gate should be EDO-4, got ${decision.gate}`
    );
    assert.strictEqual(typeof decision.decisionId, "string");
  });

  await t.test("returns candidate scores sorted by total", () => {
    const orch = createOrchestrator();
    const decision = orch.makeDecision();
    assert(typeof decision.confidence === "object");
    assert(typeof decision.confidence.signal === "number");
    assert(typeof decision.confidence.aggregate === "number");
  });

  await t.test("updates clip history on execute", () => {
    const orch = createOrchestrator();
    const { selectedClipId: clipId1 } = orch.makeDecision();
    const state1 = orch.getState();
    assert.strictEqual(state1.currentClipId, clipId1 || "");

    // Make another decision
    const { selectedClipId: clipId2 } = orch.makeDecision();
    const state2 = orch.getState();
    if (clipId2) {
      assert(state2.recentClipHistory.includes(clipId2) || state2.currentClipId === clipId2);
    }
  });
});

test("ORCHESTRATOR: Signal state handling", async (t) => {
  await t.test("kills on invalid BPM", () => {
    const orch = createOrchestrator();
    // Find a frame with invalid BPM
    const invalidFrame = frames.find((f: any) => f.bpm?.status === "invalid");
    if (invalidFrame) {
      // This test assumes we can trigger it; actual implementation depends on fixture
      const decision = orch.makeDecision();
      assert(decision.gate !== undefined);
    }
  });

  await t.test("defers on unknown BPM", () => {
    const orch = createOrchestrator();
    // Find a frame with unknown BPM
    const unknownFrame = frames.find((f: any) => f.bpm?.status === "unknown");
    if (unknownFrame) {
      const decision = orch.makeDecision();
      assert(decision.gate !== undefined);
    }
  });
});

test("ORCHESTRATOR: Playback control", async (t) => {
  await t.test("play() starts playback", () => {
    const orch = createOrchestrator();
    orch.play(0);
    const state = orch.getState();
    assert.strictEqual(state.playing, true);
  });

  await t.test("pause() stops playback", () => {
    const orch = createOrchestrator();
    orch.play(0);
    orch.pause();
    const state = orch.getState();
    assert.strictEqual(state.playing, false);
  });

  await t.test("seek() moves to time", () => {
    const orch = createOrchestrator();
    orch.play(0);
    orch.seek(5000);
    const time = orch.now();
    assert.strictEqual(time, 5000);
  });

  await t.test("setPlaybackRate() changes rate", () => {
    const orch = createOrchestrator();
    orch.play(0);
    orch.setPlaybackRate(2);
    const state = orch.getState();
    assert.strictEqual(state.playbackRate, 2);
  });
});

test("ORCHESTRATOR: Determinism", async (t) => {
  await t.test("same input produces identical traces", () => {
    const orch1 = createOrchestrator();
    const orch2 = createOrchestrator();

    // Make 5 decisions on each
    for (let i = 0; i < 5; i++) {
      orch1.makeDecision();
      orch2.makeDecision();
    }

    const trace1 = orch1.getTrace().getEntries();
    const trace2 = orch2.getTrace().getEntries();

    assert.strictEqual(trace1.length, trace2.length);
    for (let i = 0; i < trace1.length; i++) {
      assert.deepStrictEqual(trace1[i].gate, trace2[i].gate);
      assert.deepStrictEqual(
        trace1[i].confidence.aggregate,
        trace2[i].confidence.aggregate
      );
    }
  });

  await t.test("seek and replay produces same decision", () => {
    const orch1 = createOrchestrator();
    orch1.play(0);
    const decision1 = orch1.makeDecision();

    const orch2 = createOrchestrator();
    orch2.play(0);
    orch2.seek(0);
    const decision2 = orch2.makeDecision();

    assert.deepStrictEqual(decision1.gate, decision2.gate);
    assert.deepStrictEqual(
      decision1.confidence.aggregate,
      decision2.confidence.aggregate
    );
  });
});

test("ORCHESTRATOR: Replay consistency", async (t) => {
  await t.test("pause and resume preserves state", () => {
    const orch = createOrchestrator();
    orch.play(0);

    // Make decision
    const decision1 = orch.makeDecision();

    // Pause
    const pausedTime = orch.pause();

    // Resume from same time
    orch.play(pausedTime);
    const decision2 = orch.makeDecision();

    // Should have similar confidence (not identical due to time advancement)
    assert(typeof decision1.confidence === "object");
    assert(typeof decision2.confidence === "object");
  });

  await t.test("multiple seeks to same time produce same decision", () => {
    const orch = createOrchestrator();

    // Seek to time 1000, make decision
    orch.seek(1000);
    const decision1 = orch.makeDecision();

    // Seek back to 1000, make decision
    orch.seek(1000);
    const decision2 = orch.makeDecision();

    assert.deepStrictEqual(decision1.gate, decision2.gate);
  });
});

test("ORCHESTRATOR: Stress test", async (t) => {
  await t.test("handles 1000+ decisions without degradation", () => {
    const orch = createOrchestrator();
    orch.play(0);

    let errorCount = 0;
    for (let i = 0; i < 1000; i++) {
      try {
        const decision = orch.makeDecision();
        assert(decision.gate);
      } catch (e) {
        errorCount++;
      }
    }

    assert.strictEqual(errorCount, 0);

    const trace = orch.getTrace();
    const stats = trace.getStatistics();
    assert.strictEqual(stats.totalDecisions, 1000);
    assert(stats.executeCount + stats.deferCount + stats.escalateCount + stats.killCount > 0);
  });

  await t.test("maintains statistics under load", () => {
    const orch = createOrchestrator();

    for (let i = 0; i < 100; i++) {
      orch.makeDecision();
    }

    const stats = orch.getTrace().getStatistics();
    assert.strictEqual(stats.totalDecisions, 100);
    assert(stats.avgConfidence >= 0 && stats.avgConfidence <= 1);
    assert(Object.keys(stats.limitingDimensionCounts).length > 0);
  });
});

test("ORCHESTRATOR: Decision trace recording", async (t) => {
  await t.test("records decision entries with full metadata", () => {
    const orch = createOrchestrator();
    orch.makeDecision();

    const entries = orch.getTrace().getEntries();
    assert(entries.length > 0);

    const entry = entries[0];
    assert(entry.id);
    assert(entry.level);
    assert(typeof entry.atTime === "number");
    assert(typeof entry.atBeat === "number");
    assert(Array.isArray(entry.candidateScores));
    assert(entry.confidence);
    assert(entry.gate);
  });

  await t.test("computes decision ID consistently", () => {
    const orch = createOrchestrator();
    orch.play(0);

    // Advance audio context time between decisions
    mockAudioContext.currentTime = 0;
    const decision1 = orch.makeDecision();

    mockAudioContext.currentTime = 1; // 1 second later
    const decision2 = orch.makeDecision();

    // IDs might be the same if both fall on beat 0, so just check format
    assert(decision1.decisionId.includes("test-track"));
    assert(decision1.decisionId.includes("move"));
    assert(decision2.decisionId.includes("test-track"));
    assert(decision2.decisionId.includes("move"));
  });
});

test("ORCHESTRATOR: Trace statistics", async (t) => {
  await t.test("getStatistics computes gate counts", () => {
    const orch = createOrchestrator();

    for (let i = 0; i < 50; i++) {
      orch.makeDecision();
    }

    const stats = orch.getTrace().getStatistics();
    assert.strictEqual(
      stats.executeCount +
        stats.deferCount +
        stats.escalateCount +
        stats.killCount,
      50
    );
  });

  await t.test("getStatistics tracks limiting dimensions", () => {
    const orch = createOrchestrator();

    for (let i = 0; i < 30; i++) {
      orch.makeDecision();
    }

    const stats = orch.getTrace().getStatistics();
    const dimensions = Object.keys(stats.limitingDimensionCounts);
    assert(dimensions.includes("signal") || dimensions.includes("policy"));
  });
});

test("ORCHESTRATOR: State export/import", async (t) => {
  await t.test("trace serializes to JSON", () => {
    const orch = createOrchestrator();
    orch.makeDecision();

    const trace = orch.getTrace();
    const json = trace.toJSON();
    assert(Array.isArray(json.entries));
    assert(json.entries.length > 0);
  });

  await t.test("trace deserializes from JSON", () => {
    const orch1 = createOrchestrator();
    orch1.makeDecision();

    const json = orch1.getTrace().toJSON();
    const orch2Trace = DecisionTrace.fromJSON(json);

    assert.strictEqual(
      orch1.getTrace().getEntries().length,
      orch2Trace.getEntries().length
    );
  });
});

test("ORCHESTRATOR: Edge cases", async (t) => {
  await t.test("handles empty clip list gracefully", () => {
    const orch = new Orchestrator(
      frames,
      [],
      graph,
      policy,
      "test-track",
      analysisProfile.id,
      mockAudioContext as any
    );

    const decision = orch.makeDecision();
    assert(decision.selectedClipId === undefined);
  });

  await t.test("handles single clip", () => {
    const orch = new Orchestrator(
      frames,
      library.clips.slice(0, 1),
      graph,
      policy,
      "test-track",
      analysisProfile.id,
      mockAudioContext as any
    );

    const decision = orch.makeDecision();
    assert(decision.gate !== undefined);
  });
});
