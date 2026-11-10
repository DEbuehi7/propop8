# Album Desk baseline (Phase 0), 10 Nov 2026

Taken before any change, on `main` at `4fb65af` (merge of PR #66), in a cloud
Linux workspace (not the owner's Mac).

| Item | Found |
|---|---|
| Repo state | clean, `main`, up to date with `origin/main` |
| Package manager | npm 10.9.9 (`package-lock.json`); Node 22.23.4 |
| OS | Linux x86_64 (the owner's Mac is the target; paths use `~`) |
| ffmpeg / ffprobe | 6.1.1, both present |
| Canon | 1.10.0: 22 studies, 209 entries (LOCKED 141, OPEN 8) |
| Tests | `npm test`: 446 pass, 0 fail, about 97 s |
| Owner's StuttrInbox / StuttrLibrary | not on this machine: UNKNOWN; no real media or voice ids were used |
| Suno MCP | not connected in this session: no tools exposed, so none were assumed |

## Canon check

The brief names a v1.9.0 register as baseline. The repo is at 1.10.0; the only
change since 1.9.0 is D8-19 (CHOIR8 beat feel), added and locked by the owner
on 7 Nov. No entry conflicts with the brief's rules. Two of the brief's labels
differ from the repo, and the repo controls:

| Entry | The brief says | The repo says | Effect |
|---|---|---|---|
| STU-03 | LOCKED | PROPOSED (unchecked): store WAV stems, align time zero, annotate BPM and cue points | Followed anyway, since the desk does exactly this; not claimed as locked |
| D8-15 | LOCKED | PROPOSED: the BeatLens music-video UI | No UI built; nothing depends on it |

Also found:

- **ElevenLabs path.** `lib/stuttr/elevenlabs.ts` posts to
  `/v1/speech-to-speech/{voice_id}`; the current reference page documents
  `/v1/voice-changer/{voice_id}`
  ([docs](https://elevenlabs.io/docs/api-reference/speech-to-speech/convert)).
  The owner's late-October album conversions ran on the existing path, so it is
  left alone; switching needs one live call to confirm, which needs his
  approval. The same page says `enable_logging` defaults to true.
- **Suno Download All.** The help page says selected songs arrive "as a ZIP
  file" and that you choose the file type; it does not say how the files are
  named or foldered ([help](https://help.suno.com/en/articles/2409921)). The
  importer therefore reads any layout: song folders, loose files, Suno's
  `<part>_<title>` stem names and Studio's numbered multitrack names.
- **STU-04 is open.** The desk keeps its records beside the existing private
  library, labelled PROVISIONAL, and copies songs exactly as `stuttr add`
  already does. No storage policy was decided.

## Commands before the change

| Command | State | Evidence |
|---|---|---|
| `stuttr add` | VERIFIED | `tests/stuttrLibrary.test.ts`, `tests/dance8/plan.test.ts` |
| `stuttr analyze` | VERIFIED | `tests/dance8/plan.test.ts` (synthetic song, BPM within 0.2) |
| `stuttr convert`, `voices`, `album-voices` | PARTIAL | Fake provider in `tests/stuttrAlbum.test.ts`; no live call here; path differs from current docs (above) |
| `stuttr master`, `approve-master` | VERIFIED | `tests/stuttrAlbum.test.ts`, `tests/dance8/plan.test.ts` |
| `stuttr album`, `album-add`, `album-order`, `albums` | VERIFIED | `tests/stuttrAlbum.test.ts` |
| `dance8 plan`, `kling`, `clips`, `approve-clip` | VERIFIED | `tests/dance8/plan.test.ts`, `tests/dance8/kling.test.ts` |
| `dance8 render` | VERIFIED | `tests/dance8/plan.test.ts` runs `scripts/dance8/cut.ts` |
| Album-level import of a Suno ZIP | ABSENT | The brief's target |
| Album-level status with holds, job ledger, paid-job reconciliation | ABSENT | The brief's target |
| Clip QA against the shot (length, shape, rate) | PARTIAL | `ingestClips` warns on length and shape; nothing records or holds |
| Suno MCP | ABSENT | Not connected |
| Kling API | ABSENT | Manual pack only, by design |
| Kirtled performance mode (D8-08), MIDI exporter (D8-09) | ABSENT | Not built; not claimed |

## Redundant with the brief, so reused

The per-song pipeline already covers most of what the brief asks: source
copies by SHA-256 (`library.json`), WAV-first roles (`classifyFolder`), stem
length checks, voice presets with credit caps (`albumVoices`), the album list
and board (`albums.json`), Kling packs with lip-sync cuts and credits,
clip import by shot id, human drift scores, voice masters (D8-14), renders that
crop rather than stretch and play the master once, and render manifests.

## The smallest missing layer (what was built)

Album-level intake and orchestration, in `lib/stuttr/desk/`: a careful ZIP
reader, manifest and voice-map contracts, matching with suggestions, stem
alignment, an idempotent job ledger with ambiguous-call holds, derived track
states, clip and render QA, and the CLI verbs. See [`../ALBUM_DESK.md`](../ALBUM_DESK.md).
