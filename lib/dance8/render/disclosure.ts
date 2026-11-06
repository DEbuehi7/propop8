// lib/dance8/render/disclosure.ts
//
// What a Dance8 video says about how it was made: the caption burned into
// every final, and the text to paste as its description when it is uploaded
// (title, the song's description in the owner's words, then the disclosure).
// Pure: no files.

/** Burned into the first seconds of every final render. */
export const AI_DISCLOSURE = "All characters are fictional and AI-generated.";

export interface UploadText {
  title: string;
  /** The song's description (stuttr describe), if written. */
  about?: { logline: string; description?: string };
  /** The voice master the render played: Suno's own vocals, or converted voices. */
  audio: "suno" | "voices";
}

/** How the sound was made, from the voice master the render played. */
export const madeWith = (audio: UploadText["audio"]) =>
  audio === "suno" ? "Music and vocals made with Suno." : "Music made with Suno; voices converted with AI.";

/**
 * The upload description: the title, the logline, the longer description,
 * then the disclosure. With no description written, title and disclosure only.
 */
export function uploadDescription(u: UploadText): string {
  return [
    u.title,
    ...(u.about ? [u.about.logline] : []),
    ...(u.about?.description ? ["", u.about.description] : []),
    "",
    `${AI_DISCLOSURE} ${madeWith(u.audio)}`,
    "",
  ].join("\n");
}
