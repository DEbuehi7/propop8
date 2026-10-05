import type { MotionClip } from "../contracts/motion";
import type { RuntimePolicy } from "../contracts/policy";
import type { SignalFrame } from "../contracts/signal";
import type { TransitionGraph } from "../contracts/transition";
import type { DecisionConfidence, DecisionTrace as DecisionTraceEntry, DecisionGate } from "../contracts/decision";
import { PulseClock, type PulseClockSnapshot } from "./PulseClock";
import { scoreCandidates } from "./CandidateScorer";
import { resolveDecisionGate } from "./DecisionGate";
import { resolveTransitionForTrace } from "./TransitionResolver";
import { DecisionTrace } from "./DecisionTrace";
import { findFrameIndexAtTime } from "./SignalReader";

export interface OrchestratorState {
  currentClipId: string;
  recentClipHistory: string[];
  playbackRate: number;
  playing: boolean;
}

/**
 * Top-level orchestrator for Dance8 Gate 1 decision loop.
 */
export class Orchestrator {
  private pulseClock: PulseClock;
  private decisionTrace = new DecisionTrace();
  private currentClipId: string = "";
  private recentClipHistory: string[] = [];

  constructor(
    private frames: SignalFrame[],
    private clips: MotionClip[],
    private graph: TransitionGraph,
    private policy: RuntimePolicy,
    private trackId: string,
    private analysisProfileId: string,
    audioContext: Pick<AudioContext, "currentTime">
  ) {
    this.pulseClock = new PulseClock(audioContext, policy.outputLatencyCompensationMs);
  }

  /**
   * Makes a decision at the current playback time.
   */
  makeDecision(level: "section" | "phrase" | "move" | "transition" = "move"): {
    gate: DecisionGate;
    selectedClipId: string | undefined;
    confidence: DecisionConfidence;
    decisionId: string;
  } {
    const trackTime = this.pulseClock.now();
    const frameIndex = findFrameIndexAtTime(this.frames, trackTime);
    const frame = this.frames[frameIndex];

    // Score candidates
    const scores = scoreCandidates(this.clips, frame, this.policy, this.recentClipHistory);
    const topScore = scores.length > 0 ? scores[0] : null;

    // Resolve gate and confidence
    const { gate, confidence } = resolveDecisionGate(frame, topScore, this.policy);

    // Determine selected clip
    let selectedClipId: string | undefined;
    if (gate === "execute" && topScore) {
      selectedClipId = topScore.clipId;
      this.currentClipId = selectedClipId;
      // Update history
      this.recentClipHistory.unshift(selectedClipId);
      if (this.recentClipHistory.length > this.policy.repetitionWindowDecisions) {
        this.recentClipHistory.pop();
      }
    }

    // Compute decision ID
    const beat = Math.floor((trackTime * 120) / 60000); // assume 120 BPM base
    const decisionId = `${this.trackId}:${level}:${beat}`;

    // Build trace entry
    const entry: DecisionTraceEntry = {
      id: decisionId,
      level,
      atBeat: beat,
      atTime: trackTime,
      candidateScores: scores,
      selectedId: selectedClipId,
      confidence,
      gate,
      analysisProfileId: this.analysisProfileId,
      transitionGraphVersion: this.graph.version,
      runtimePolicyVersion: this.policy.version,
      mappingBundleVersion: 1, // placeholder
      reasonCode:
        gate === "kill"
          ? "invalid_input"
          : gate === "defer"
            ? "unknown_input"
            : gate === "execute"
              ? "best_candidate"
              : "policy_rejected",
    };

    this.decisionTrace.addEntry(entry);

    return { gate, selectedClipId, confidence, decisionId };
  }

  /**
   * Starts playback.
   */
  play(trackTime: number = 0): void {
    this.pulseClock.play(trackTime);
  }

  /**
   * Pauses playback.
   */
  pause(): number {
    return this.pulseClock.pause();
  }

  /**
   * Seeks to a specific time.
   */
  seek(trackTime: number): void {
    this.pulseClock.seek(trackTime);
  }

  /**
   * Sets playback rate.
   */
  setPlaybackRate(rate: number): void {
    this.pulseClock.setPlaybackRate(rate);
  }

  /**
   * Gets current orchestrator state.
   */
  getState(): OrchestratorState {
    const snapshot = this.pulseClock.snapshot();
    return {
      currentClipId: this.currentClipId,
      recentClipHistory: [...this.recentClipHistory],
      playbackRate: snapshot.playbackRate,
      playing: snapshot.playing,
    };
  }

  /**
   * Gets decision trace.
   */
  getTrace(): DecisionTrace {
    return this.decisionTrace;
  }

  /**
   * Gets current playback time.
   */
  now(): number {
    return this.pulseClock.now();
  }
}
