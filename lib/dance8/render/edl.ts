// lib/dance8/render/edl.ts
//
// CMX 3600 edit decision list for a cut plan, so the edit opens as a real
// timeline in DaVinci Resolve, Premiere or Final Cut (via conversion) for
// hand polish. Video only; the song goes on the audio track by hand.
// Non-drop-frame timecode; the record side starts at 01:00:00:00.

import type { Cut, VisualClipLibrary } from "../contracts/scene";
import { frameAt } from "./ffmpegArgs";

export function timecode(frames: number, fps: number): string {
  const f = frames % fps;
  const totalSec = Math.floor(frames / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

export function toEdl(title: string, cuts: Cut[], library: VisualClipLibrary, fps: number): string {
  if (!Number.isInteger(fps) || fps <= 0) throw new Error("EDL needs a whole-number frame rate");
  const byId = new Map(library.clips.map((c) => [c.id, c]));
  const recordStart = 3600 * fps;
  const lines = [`TITLE: ${title.replace(/[\r\n]/g, " ").slice(0, 70)}`, "FCM: NON-DROP FRAME", ""];
  cuts.forEach((c, i) => {
    const clip = byId.get(c.clipId);
    if (!clip) throw new Error(`cut ${c.index} uses unknown clip ${c.clipId}`);
    const len = frameAt(c.endSec, fps) - frameAt(c.startSec, fps);
    const srcIn = frameAt(c.clipInSec, fps);
    const recIn = recordStart + frameAt(c.startSec, fps);
    const reel = `AX`; // auxiliary source; the clip name line tells the editor which file
    lines.push(
      `${String(i + 1).padStart(3, "0")}  ${reel.padEnd(8)} V     C        ` +
        `${timecode(srcIn, fps)} ${timecode(srcIn + len, fps)} ${timecode(recIn, fps)} ${timecode(recIn + len, fps)}`,
      `* FROM CLIP NAME: ${clip.file}`,
      `* COMMENT: ${c.cueId} bars ${c.startBar}-${c.endBar} ${c.camera} ${c.reason}`,
      "",
    );
  });
  return lines.join("\n");
}
