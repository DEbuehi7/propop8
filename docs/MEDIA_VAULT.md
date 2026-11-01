# Media Vault v1

One read-only index over the music and media records that already exist in
the private Stuttr library. Build it with:

```
npm run stuttr -- media-vault
```

It writes `~/StuttrLibrary/media-vault.json` and prints a short summary. It
reads the files each tool already writes, keeps their ids, and changes none
of them. There is no database and no migration; rebuild it any time. Code:
`lib/stuttr/mediaVault.ts`; test: `tests/stuttrMediaVault.test.ts`.

**What it is not:**
- It is not the AIM Vault (`lib/vault/`, `scripts/vault/`). That is the
  encrypted company-document vault for AIM LLC, SBI and Aura8 on Supabase.
- Media stays out of the AIM Vault, and property, tenant and client data stay
  out of this one (GOV-15).
- Nothing reads `media-vault.json` yet. It is the contract later readers
  (Late8, State8, a contact sheet) can build on.

## Where each part comes from

| Vault part | Read from | Ids it keeps |
| --- | --- | --- |
| Albums and running order | `albums.json` | album `id`, song `trackId`, sequence = position |
| 01 Original | `library.json` track files | `trackId`, each file's `path` + `sha256`, `sunoPlan` |
| 02 Voice master work | `library.json` takes and masters, `<song>/cast.json` | take `path` + `sha256` + `sourceSha256`, master `key` + `sha256` |
| 04 Dance8 | `<song>/analysis/`, `<song>/dance8/` cue map, shot list, clip library, renders and their manifests | cue map `version`, clip `source.generator`, render audio `sha256` |
| 03 Visual (references) | `refs/` folders and `<song>/dance8/kling/cards.json` | scene id, character folder name |
| Status | The album board's own rules (`lib/stuttr/album.ts`) | the same stage names: source, stems, lead, backing, mix, master, dance8, video |

## Checks it makes

These are deterministic and read-only:

- **Master still current.** Every take, stem and cast it was built from is unchanged and still approved (`masterProblem`, `castDrift`).
- **Analysis matches the stems.** Every file the analysis measured still has the SHA-256 it recorded.
- **Render audio.** Each render's audio, from its manifest, is an approved voice master of the song.

## Compared with the proposed track record

ChatGPT's proposed fields, mapped to what exists. Existing names are kept; no
field was renamed to fit the proposal.

| Proposed | v1 |
| --- | --- |
| `track_id`, `album_id`, `sequence` | `trackId`, `albums[].albumId`, `albums[].sequence` (a song can be on several albums) |
| `canonical_title` / `display_title` | `title` (one title today) |
| `source_type`, `source_path` | `original.fullMix`, `original.stems[]` with path and SHA-256 |
| `stems_present`, `lyrics_present` | `original.stems[]`, `original.lyrics` |
| `voice_cast`, `voice_status` | `voice.mode`, `voice.cast`, `voice.takes[]` |
| `voice_master_id`, `voice_master_status` | `voice.masters[]` (`key`, `status`, `current`) |
| `dance8_analysis_status`, `dance8_plan_status` | `dance8.analysis`, `dance8.cueMap`, `status.dance8` |
| `kirtled_status` | not indexed yet (the Kirtled plan is rebuilt by every `plan`) |
| `clip_status`, `video_status` | `dance8.clips`, `dance8.renders[]`, `status.video` |
| `artwork_status` | absent: no artwork records exist |
| `audiobook_*` | absent: `audiobook: null` (the Late8 audiobook is a proposal) |
| `rights`, `provenance` | `original.sunoPlan` and every SHA-256; rights beyond that wait on canon STU-04 |
| `release_state` | absent |
| `created_at`, `updated_at` | `original.addedAt`, take `addedAt`, master `builtAt`, vault `builtAt` |

The file's `absent` list names what the index does not hold yet, so no reader
mistakes a missing kind of record for an empty one.
