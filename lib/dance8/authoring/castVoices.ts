// lib/dance8/authoring/castVoices.ts
//
// The singers in a cue map come from the song's cast (lib/stuttr/cast.ts),
// so lip-sync shots are made per singer. Each sung line takes the voice the
// cast gives its section; a line that runs across a change of singer is split
// at the section line, and its lyric stays with the first part. A lead line in
// a section with no lead, or a backing line in a section with no backing, is
// dropped: that part isn't in the master. Backing lines are named after the
// voices layered there ("M+Ja+Bo"), or "Backing" where Suno's own backing
// vocals stay. Lines are told apart by their ids from plan (lead-N,
// backing-N). Pure and deterministic: the same cue map and cast give the
// same lines, and running it again changes nothing.

import { SUNO_BACKING, type CastFile } from "../../stuttr/cast";
import type { CueMap, VocalPhrase } from "../contracts/scene";

export const SUNO_BACKING_LABEL = "Backing";

const isBacking = (v: VocalPhrase) => v.id.startsWith("backing");

export function castVocals(map: Pick<CueMap, "cues" | "vocals">, cast: CastFile): { vocals: VocalPhrase[]; dropped: string[] } {
  const cues = [...map.cues].sort((a, b) => a.startBar - b.startBar);
  const byId = new Map(cast.sections.map((s) => [s.id, s]));
  const voiceIn = (cueId: string, backing: boolean): string | null => {
    const s = byId.get(cueId);
    if (!s) return null;
    if (!backing) return s.lead;
    if (s.backing === SUNO_BACKING) return SUNO_BACKING_LABEL;
    return s.backing.length ? s.backing.join("+") : null;
  };
  const out: VocalPhrase[] = [];
  const dropped: string[] = [];
  for (const v of map.vocals ?? []) {
    const pieces = cues
      .map((q) => ({ a: Math.max(v.startBar, q.startBar), b: Math.min(v.endBar, q.endBar), voice: voiceIn(q.id, isBacking(v)) }))
      .filter((x) => x.a < x.b);
    if (pieces.length === 0) {
      out.push(v);
      continue;
    }
    const merged: { a: number; b: number; voice: string | null }[] = [];
    for (const x of pieces) {
      const last = merged[merged.length - 1];
      if (last && last.voice === x.voice && last.b === x.a) last.b = x.b;
      else merged.push({ ...x });
    }
    const kept = merged.filter((x): x is { a: number; b: number; voice: string } => x.voice !== null);
    if (kept.length === 0) {
      dropped.push(v.id);
      continue;
    }
    kept.forEach((x, i) => {
      const id = kept.length === 1 ? v.id : `${v.id}${String.fromCharCode(97 + i)}`;
      const { text, ...rest } = v;
      out.push({ ...rest, id, voice: x.voice, startBar: x.a, endBar: x.b, ...(i === 0 && text ? { text } : {}) });
    });
  }
  out.sort((x, y) => x.startBar - y.startBar || Number(isBacking(x)) - Number(isBacking(y)) || x.id.localeCompare(y.id, "en", { numeric: true }));
  return { vocals: out, dropped };
}
