export interface PulseClockSnapshot {
  trackTime: number;
  playing: boolean;
  playbackRate: number;
}

export class PulseClock {
  private anchorContextTime = 0;
  private anchorTrackTime = 0;
  private playbackRate = 1;
  private playing = false;

  constructor(
    private audioContext: Pick<AudioContext, "currentTime">,
    private latencyCompensationMs = 0
  ) {}

  play(trackTime: number) {
    this.anchorContextTime = this.audioContext.currentTime;
    this.anchorTrackTime = trackTime;
    this.playing = true;
  }

  pause(): number {
    const t = this.now();
    this.anchorTrackTime = t;
    this.playing = false;
    return t;
  }

  seek(trackTime: number) {
    this.anchorTrackTime = trackTime;
    this.anchorContextTime = this.audioContext.currentTime;
  }

  setPlaybackRate(rate: number) {
    const current = this.now();
    this.anchorTrackTime = current;
    this.anchorContextTime = this.audioContext.currentTime;
    this.playbackRate = rate;
  }

  setLatencyCompensation(ms: number) {
    this.latencyCompensationMs = ms;
  }

  now(): number {
    if (!this.playing) return this.anchorTrackTime;
    const elapsed =
      (this.audioContext.currentTime - this.anchorContextTime) * this.playbackRate;
    return Math.max(
      0,
      this.anchorTrackTime + elapsed - this.latencyCompensationMs / 1000
    );
  }

  snapshot(): PulseClockSnapshot {
    return { trackTime: this.now(), playing: this.playing, playbackRate: this.playbackRate };
  }
}
