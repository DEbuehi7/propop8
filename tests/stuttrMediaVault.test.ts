/**
 * Media Vault v1: one read-only index over the records the Stuttr library and
 * Dance8 already write. Synthetic library only: records and placeholder bytes,
 * no real audio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveAlbums } from "../lib/stuttr/albumCommands";
import { saveManifest, type Ctx } from "../lib/stuttr/commands";
import { emptyManifest, type LibraryFile, type LibraryTrack, type VoiceTake } from "../lib/stuttr/library";
import { buildMediaVault, MEDIA_VAULT_FILE, mediaVaultCommand, vaultSummary } from "../lib/stuttr/mediaVault";

const AT = "2026-10-25T00:00:00.000Z";
const file = (id: string, role: LibraryFile["role"], name: string, extra: Partial<LibraryFile> = {}): LibraryFile =>
  ({ role, path: `${id}/source/${name}`, originalName: name, sha256: `sha-${id}-${name}`, bytes: 1, ...extra });

function song(id: string, title: string, o: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    trackId: id, title, sunoPlan: "Pro", addedAt: AT, voices: [],
    files: [
      file(id, "full_mix", `${title}.wav`, { audio: { format: "wav", lossy: false, sampleRate: 48000, channels: 2, bitsPerSample: 24, durationSec: 180 } }),
      file(id, "vocals", "0 Lead Vocals.wav"), file(id, "stem", "2 Drums.wav", { stemName: "drums" }), file(id, "lyrics", "lyrics.txt"),
    ],
    ...o,
  };
}

/** Every file under root with its SHA-256, to prove a build changed nothing. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[p.slice(root.length)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(root);
  return out;
}

test("media vault: one record per song from the files that already exist, read-only, with what is absent named", () => {
  const root = mkdtempSync(join(tmpdir(), "stuttr-vault-"));
  const lines: string[] = [];
  const c: Ctx = { library: join(root, "library"), now: () => AT, log: (l) => lines.push(l) };
  const put = (rel: string, body: string | Buffer) => {
    mkdirSync(join(c.library, rel, ".."), { recursive: true });
    writeFileSync(join(c.library, rel), body);
  };
  try {
    // vein: approved lead, an approved master that still matches, analysed, planned, clips and two renders.
    const vein = song("vein", "VEIN (The Nerve)");
    const lead: VoiceTake = {
      voice: "Stuttr", lang: "en", path: "vein/voices/stuttr.en.mp3", originalName: "stuttr.en.mp3", sha256: "sha-take", bytes: 1, sourceRole: "vocals",
      sourceSha256: "sha-vein-0 Lead Vocals.wav", method: "elevenlabs_voice_changer", durationSec: 180, timingDeltaMs: 4, timingOk: true, status: "approved", addedAt: AT,
    };
    vein.voices = [lead];
    vein.masters = [{
      key: "en", kind: "voices", path: "vein/masters/vein.en.master.wav", sha256: "sha-master", bytes: 1, durationSec: 180, lengthDeltaMs: 0,
      lead: { path: lead.path, sha256: lead.sha256, voice: "Stuttr" }, backing: [], beds: [{ path: "vein/source/2 Drums.wav", sha256: "sha-vein-2 Drums.wav" }], sunoBacking: [],
      status: "approved", builtAt: AT,
    }];
    const m = emptyManifest();
    m.tracks.push(vein, song("bland", "BLAND"));
    saveManifest(c, m);
    saveAlbums(c, { schemaVersion: 1, albums: [{ id: "sontheravein", title: "SontheraVein", songs: [{ trackId: "vein", mode: "solo" }, { trackId: "bland", mode: "solo" }, { trackId: "pulse" }] }] });

    put("vein/analysis/vein.analysis.json", JSON.stringify({ analyzer: "stuttr-analysis-1", bpm: 92.058, bars: 67, durationSec: 180, sources: [{ group: "drums", path: "vein/source/2 Drums.wav", sha256: "sha-vein-2 Drums.wav" }] }));
    put("vein/dance8/vein.cuemap.json", JSON.stringify({ version: 3, approvalStatus: "draft", cues: [{ id: "intro", sceneId: "rooftop_canopy" }, { id: "verse-1", sceneId: "verse-1" }, { id: "chorus-1", sceneId: "rooftop_canopy" }] }));
    put("vein/dance8/vein.briefs.json", JSON.stringify([{ kind: "lip_sync" }, { kind: "lip_sync" }, { kind: "broll" }]));
    put("vein/dance8/vein.clips.json", JSON.stringify({ version: 1, clips: [
      { approvalStatus: "approved", source: { type: "ai_generated", generator: "kling-4.0-flash" } },
      { approvalStatus: "draft", source: { type: "ai_generated", generator: "kling-3.0-motion-control-720p" } },
      { approvalStatus: "approved", source: { type: "human_authored" } },
    ] }));
    put("vein/dance8/renders/vein-draft.mp4", "x");
    put("vein/dance8/renders/vein-draft.mp4.manifest.json", JSON.stringify({ audio: { sha256: "sha-master" } }));
    put("vein/dance8/renders/vein-final.mp4", "x");
    put("vein/dance8/renders/vein-final.mp4.manifest.json", JSON.stringify({ audio: { sha256: "sha-suno-mix" } }));
    put("refs/scenes/rooftop_canopy/master.png", "png");
    put("refs/scenes/rooftop_canopy/scene.txt", "place: x\nlight: y\n");
    put("vein/refs/scenes/verse-1/scene.txt", "place: x\n");
    put("refs/cast/stuttr/face.png", "png");
    put("vein/dance8/kling/cards.json", JSON.stringify([
      { ready: true, uploads: [{ path: join(c.library, "refs/cast/stuttr/face.png") }, { path: join(c.library, "refs/scenes/rooftop_canopy/master.png") }] },
      { ready: false, uploads: [{ path: null }] },
    ]));

    const before = snapshot(c.library);
    const v = buildMediaVault(c);
    assert.deepEqual(snapshot(c.library), before, "building the index changes nothing");

    assert.deepEqual(v.albums, [{ id: "sontheravein", title: "SontheraVein", songs: [
      { sequence: 1, trackId: "vein", mode: "solo", inLibrary: true }, { sequence: 2, trackId: "bland", mode: "solo", inLibrary: true }, { sequence: 3, trackId: "pulse", mode: null, inLibrary: false },
    ] }]);
    assert.deepEqual(v.tracks.map((t) => t.trackId), ["bland", "vein"]);
    const t = v.tracks.find((x) => x.trackId === "vein")!;
    assert.deepEqual(t.albums, [{ albumId: "sontheravein", sequence: 1 }]);
    assert.deepEqual([t.done, t.next, t.status.master, t.status.dance8, t.status.video], [true, null, "approved", "planned", "final"]);
    assert.deepEqual(t.original.fullMix, { path: "vein/source/VEIN (The Nerve).wav", sha256: "sha-vein-VEIN (The Nerve).wav", durationSec: 180 });
    assert.deepEqual(t.original.stems.map((s) => [s.role, s.name]), [["vocals", null], ["stem", "drums"]]);
    assert.equal(t.original.lyrics?.path, "vein/source/lyrics.txt");
    assert.deepEqual(t.voice.takes.map((x) => [x.voice, x.role, x.status, x.section]), [["Stuttr", "lead", "approved", null]]);
    assert.deepEqual(t.voice.masters.map((x) => [x.key, x.status, x.current, x.problem]), [["en", "approved", true, null]]);
    assert.deepEqual(t.dance8.analysis, { path: "vein/analysis/vein.analysis.json", analyzer: "stuttr-analysis-1", bpm: 92.058, bars: 67, durationSec: 180, matchesStems: true });
    assert.deepEqual(t.dance8.cueMap, { path: "vein/dance8/vein.cuemap.json", version: 3, approvalStatus: "draft", sections: 3, scenes: ["rooftop_canopy", "verse-1"] });
    assert.deepEqual(t.dance8.shotsToMake, { lip_sync: 2, broll: 1, dance: 0, trick: 0 });
    assert.deepEqual(t.dance8.clips, { total: 3, approved: 2, draft: 1, retired: 0, generators: ["human_authored", "kling-3.0-motion-control-720p", "kling-4.0-flash"] });
    assert.deepEqual(t.dance8.renders.map((r) => [r.file, r.final, r.approvedMaster]), [
      ["vein/dance8/renders/vein-draft.mp4", false, true], ["vein/dance8/renders/vein-final.mp4", true, false],
    ], "a render whose audio is not an approved voice master is flagged");
    assert.deepEqual(t.visual.scenes, [
      { id: "rooftop_canopy", dir: "refs/scenes/rooftop_canopy", master: true, text: true },
      { id: "verse-1", dir: "vein/refs/scenes/verse-1", master: false, text: true },
    ]);
    assert.deepEqual(t.visual.characters, [{ id: "stuttr", dir: "refs/cast/stuttr", face: true, fullbody: false, text: false }]);
    assert.deepEqual(t.visual.kling, { cards: 2, ready: 1 });
    assert.equal(t.audiobook, null);

    const b = v.tracks.find((x) => x.trackId === "bland")!;
    assert.deepEqual([b.done, b.dance8.analysis, b.dance8.cueMap, b.dance8.renders, b.visual.kling], [false, null, null, [], null]);
    assert.equal(b.next, "npm run stuttr -- voices bland --preset solo   (shows the credits; add --go to convert)");
    assert.ok(v.absent.some((a) => /audiobook records/.test(a)) && v.absent.some((a) => /artwork records/.test(a)));

    assert.deepEqual(vaultSummary(v), [
      "2 tracks on 1 album; 0 on no album",
      "voice masters approved and current: 1; stale: 0",
      "Dance8: 1 analysed, 1 planned, 1 with approved clips, 1 with a final video",
      "renders not playing an approved voice master: vein",
    ]);

    // A drums stem replaced after the master and the analysis: both are flagged, nothing is changed.
    const changed = JSON.parse(readFileSync(join(c.library, "library.json"), "utf8"));
    changed.tracks.find((x: LibraryTrack) => x.trackId === "vein").files.find((f: LibraryFile) => f.stemName === "drums").sha256 = "sha-new-drums";
    writeFileSync(join(c.library, "library.json"), JSON.stringify(changed));
    const v2 = mediaVaultCommand(c);
    const t2 = v2.tracks.find((x) => x.trackId === "vein")!;
    assert.deepEqual([t2.done, t2.status.master, t2.voice.masters[0].current, t2.dance8.analysis?.matchesStems], [false, "stale", false, false]);
    assert.match(t2.voice.masters[0].problem!, /has changed since it was built/);
    assert.ok(lines.includes("analysis older than the song's files (run analyze again): vein"));
    const written = JSON.parse(readFileSync(join(c.library, MEDIA_VAULT_FILE), "utf8"));
    assert.deepEqual([written.schemaVersion, written.builtAt, written.tracks.length], [1, AT, 2]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
