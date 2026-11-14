// lib/dance8/reaction: the visual reaction layer (canon D8-25). See docs/DANCE8_REACTION_LAYER.md.
export * from "./contracts";
export { onsetPeaks, parseWindows, planReactionTrack, seedOf, type PlanInput } from "./plan";
export { average, follow, frameStream, maxFlashesPerSecond, renderWindow, tileLuma, type Features, type RenderedWindow } from "./render";
export { baseExcerptArgs, compositeArgs, concatArgs, overlayEncodeArgs } from "./ffmpeg";
export { previewHtml, type PreviewWindow } from "./preview";
export { LightBuffer, PALETTE, rng } from "./draw";
