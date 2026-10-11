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
};

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
