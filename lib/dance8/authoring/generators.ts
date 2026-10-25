// lib/dance8/authoring/generators.ts
//
// Limits of the video generators Dance8 writes shot briefs for. Data only, so
// a new model is a new entry, not new code. Figures come from Kling's own
// Kling 4.0 launch notes (Oct 2026) and the Kling 3.0 / O3 API pages; a limit
// that a source does not state is left undefined and is not enforced.

import type { AspectRatio } from "../contracts/scene";

export interface GeneratorProfile {
  id: string;
  label: string;
  minSec: number;
  maxSec: number;
  resolution: "720p" | "1080p" | "4k";
  aspects: AspectRatio[];
  maxKeyframes?: number;
  maxRefImages?: number;
  maxRefVideos?: number;
  maxRefVideoTotalSec?: number;
  maxElements?: number;
  maxRefItems?: number;
  /** Generates only whole seconds. */
  wholeSeconds: boolean;
}

export const GENERATORS: Record<string, GeneratorProfile> = {
  "kling-4.0": {
    id: "kling-4.0",
    label: "Kling 4.0 (finals)",
    minSec: 3,
    maxSec: 30,
    resolution: "1080p",
    aspects: ["21:9", "16:9", "1:1", "9:16"],
    maxKeyframes: 10,
    maxRefImages: 10,
    maxRefVideos: 5,
    maxRefVideoTotalSec: 30,
    maxElements: 7,
    maxRefItems: 15,
    wholeSeconds: true,
  },
  "kling-4.0-flash": {
    id: "kling-4.0-flash",
    label: "Kling 4.0 Flash (fast drafts)",
    minSec: 3,
    maxSec: 20,
    resolution: "720p",
    aspects: ["21:9", "16:9", "1:1", "9:16"],
    wholeSeconds: true,
  },
  "kling-3.0": {
    id: "kling-3.0",
    label: "Kling 3.0",
    minSec: 3,
    maxSec: 15,
    resolution: "1080p",
    aspects: ["16:9", "1:1", "9:16"],
    wholeSeconds: true,
  },
  // Dance shots (your dance onto a character). Kling 3.0 Motion Control: a 3-30 s
  // reference video with character orientation following the video (10 s when it
  // follows the image), output 720p or 1080p at 16:9, 9:16 or 1:1 (checked
  // 25 Oct 2026 against the Kling Motion Control node docs and Runway's Kling 3.0
  // Motion Control guide). The clip is as long as the reference, so not whole seconds.
  "kling-3.0-motion-control-720p": {
    id: "kling-3.0-motion-control-720p",
    label: "Kling 3.0 Motion Control, 720p (dance drafts)",
    minSec: 3,
    maxSec: 30,
    resolution: "720p",
    aspects: ["16:9", "1:1", "9:16"],
    wholeSeconds: false,
  },
  "kling-3.0-motion-control-1080p": {
    id: "kling-3.0-motion-control-1080p",
    label: "Kling 3.0 Motion Control, 1080p (dance finals)",
    minSec: 3,
    maxSec: 30,
    resolution: "1080p",
    aspects: ["16:9", "1:1", "9:16"],
    wholeSeconds: false,
  },
};

/** The generator for dance shots: Motion Control, at the tier's resolution. */
export const danceGenerator = (final: boolean): GeneratorProfile =>
  GENERATORS[final ? "kling-3.0-motion-control-1080p" : "kling-3.0-motion-control-720p"];

/** Supported aspect to generate at when the video's own aspect is not offered. */
export function generateAspect(want: AspectRatio, g: GeneratorProfile): { aspect: AspectRatio; cropped: boolean } {
  if (g.aspects.includes(want)) return { aspect: want, cropped: false };
  const ratio = (a: AspectRatio) => {
    const [w, h] = a.split(":").map(Number);
    return w / h;
  };
  // Generate the nearest wider-or-equal-height option and crop in.
  const sorted = [...g.aspects].sort(
    (a, b) => Math.abs(Math.log(ratio(a) / ratio(want))) - Math.abs(Math.log(ratio(b) / ratio(want))) || a.localeCompare(b),
  );
  return { aspect: sorted[0], cropped: true };
}
