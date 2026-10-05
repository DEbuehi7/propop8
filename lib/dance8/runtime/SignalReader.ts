import type { SignalFrame } from "../contracts/signal";

export function findFrameIndexAtTime(frames: SignalFrame[], t: number): number {
  let low = 0;
  let high = frames.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (frames[mid].t <= t) low = mid + 1;
    else high = mid - 1;
  }
  return Math.max(0, Math.min(high, frames.length - 1));
}

export function readLookahead(
  frames: SignalFrame[],
  currentIndex: number,
  maxFrames: number
): SignalFrame[] {
  return frames.slice(currentIndex, currentIndex + maxFrames);
}
