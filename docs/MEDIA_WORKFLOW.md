# Media workflow

Two kinds of video, two short routines. Everything is decided by the files and
one command each; there is nothing to set by hand in an editor.

| You are making | Source | Command | Output |
|---|---|---|---|
| A helper clip for a PropOps8 page | iPhone screen recording | `npm run helpers` | `public/helpers/<id>.mp4` + poster + captions |
| A Dance8 video | Kling or Veo clips, the song's voice master | `npm run dance8 -- render <song>` | `<song>/dance8/renders/<song>-….mp4` |

## Formats

**Dance8**

- **Generated clips (Kling, Veo/Gemini).** Keep the file exactly as downloaded
  (MP4, H.264). Don't re-encode or trim it first: every re-encode loses detail,
  and the cut planner trims to the beat itself. Generate in the song's shape:
  9:16 for Shorts, Reels and TikTok (the default), 16:9 for YouTube, 4:5 for the
  Instagram feed. Generate all of a song's clips at one frame rate if the tool
  lets you choose; 24 fps is the canon sync grid (D8-03: 12 frames a beat at
  120 BPM) and what Veo produces.
- **Your dance takes.** Film on the phone as normal (HEVC is fine), 60 fps if
  the phone offers it, whole body in frame. `moves` reads them as they are.
- **The render.** H.264 High, yuv420p, AAC, MP4 with the index at the front,
  at the shape's full size (1080x1920 for 9:16, 1920x1080 for 16:9, 1080x1350
  for 4:5). The frame rate is the clips' own: 24 fps clips give a 24 fps video,
  so no frames are invented or dropped unevenly. 48 or 60 fps clips render at
  24 or 30 (every other frame, evenly). If one clip doesn't match the rest, the
  render names it. `--fps 30` overrides.
- **Audio** always comes from the song's voice master in the Stuttr library
  (`<song>/masters/<song>.<lang>.master.wav`), never from a clip's own
  soundtrack and never from the Suno master itself (D8-14). The voice master
  is built from your approved voice takes over the instrument stems, at the
  full mix's exact length (within 50 ms), 48 kHz, 24-bit. `--suno` builds one
  from Suno's own vocals instead.

**Helper clips** (made by `npm run helpers`; nothing to choose): 540 px wide,
30 fps, H.264, no sound, MP4 with the index at the front, a JPEG poster and
WebVTT captions. Each clip is 3 to 15 seconds and under 800 KB. The page loads
nothing until someone presses play.

**Concept clips** (AI video for AIM-B5R, Transect, Stuttr): not in this
repository, which is public. When one is used on a page it carries a Concept
badge and stays off the PropOps8 tools and paid flows (GOV-01, GOV-17).

## Dance8: from shot list to video

1. `npm run dance8 -- plan <song>`. The song's `dance8/README.txt` lists the
   shots to generate, each with an id and a length.
2. `npm run dance8 -- kling <song>` writes the upload pack,
   `<song>/dance8/kling/index.html`. It has one card per shot, giving:
   - the files to upload;
   - a prompt compiled from a fixed template;
   - the length, shape and resolution;
   - for lip sync, the singer's approved voice cut to the shot.

   The first run also makes the reference folders the shots need, each with a
   starter text file. Fill them in and run `kling` again; it never overwrites
   what you wrote. The folders are:
   - `~/StuttrLibrary/refs/cast/<character>/` holds `face.png` (mouth fully
     visible), `fullbody.png` and `character.txt` (`name:`, `look:`).
   - `~/StuttrLibrary/refs/scenes/<scene>/` holds `master.png` (the set's first
     frame), an optional `dancer.png`, and `scene.txt`.
   - `scene.txt` takes `place:`, `light:`, `hidden:` (what b-roll shows while
     someone sings), `dancer:`, `skater:`, and `cast:` (such as
     `Stuttr=brick-built-stuttr`).

   Scenes are shared by every song that uses the same scene id. A placeholder
   id from plan (`verse-1`, `chorus`) lives in the song's own `refs/` instead.
   Rename it in the cue map to a place to share it. Prompts describe the subject,
   set, action, camera and light; they never mention tempo or beats (D8-01).
3. Generate each card in Kling. Save the download as its shot id
   (`broll-intro-drone_wide.mp4`; a take number such as `-2` is fine) in one
   folder per song, `~/Downloads/<song>`, so shot ids from different songs never
   mix. Then run `npm run dance8 -- clips <song> ~/Downloads/<song>`. Files that
   match a shot come in as drafts; the rest are left alone. Run `kling` again
   for the shots still to make.
4. Watch each draft, then `npm run dance8 -- approve-clip <song> <clip> --drift 0.1`
   (your score: 0 matches the references, 1 is unrecognisable).
5. Build the audio: `npm run stuttr -- master <song>` (your approved voices;
   `--suno` for Suno's own vocals). Listen to it, then
   `npm run stuttr -- approve-master <song>`. Only approved takes go in. If a
   take changes or is rejected later, the master can't be used in a final until
   you rebuild it with `--replace` and approve it again.
6. `npm run dance8 -- render <song> --short chorus-1` for a draft short, or
   `npm run dance8 -- render <song> --approved` for the final. A draft plays the
   approved master, or the newest draft one with a warning. The final refuses
   drafts, stand-ins and an unapproved master, and always adds the AI
   disclosure caption. With two approved masters, `--master en` (or `suno`)
   picks one. Add `--edl` to
   open the cut in Resolve or Premiere for hand finishing, `--lyrics` to burn in
   the sung lines, `--seed 2` for another variation of the same edit.

### Who sings which section (`cast.json`)

To give a section to another singer (Mo on the chorus, M, Ja and Bo shouting
the hook), the song gets a private cast file, `~/StuttrLibrary/<song>/cast.json`.
It names the lead voice and the backing voices for every section of the cue
map. Suno's lyric file is never changed.

1. `npm run stuttr -- analyze <song>`, then `npm run dance8 -- plan <song>`
   (the cast uses the cue map's sections).
2. `npm run stuttr -- cast <song>` writes a starter: the lead voice wherever
   the lead stem sings, and `"suno"` (Suno's own backing vocals) wherever the
   backing stem sings. Edit it, for example `"lead": "Mo"` for a section, or
   `"backing": ["M", "Ja", "Bo"]` in place of `"suno"`; `[]` means no backing.
   Run `cast <song>` again to check it and see who sings where.
3. `npm run stuttr -- convert <song> --cast --dry` shows what each voice would
   convert and the credits; without `--dry` it converts. Each voice converts
   only its own sections, cut from the stem at the quietest eighth note within
   a beat of the section line and trimmed to where someone sings, with the
   same ±50 ms timing check. A part that already has a take costs nothing.
4. `npm run stuttr -- mix <song> --cast` to listen, then approve each voice
   (`approve <song> Mo`, or `--section chorus-1` for one part; add
   `--from backing_vocals` for backing).
5. `npm run stuttr -- master <song>` builds the master from the cast's approved
   takes, each at its own time with 10 ms fades where the singer changes.
   `--no-cast` builds it from one whole-song lead take instead.
6. `npm run dance8 -- plan <song>` again: each sung line gets its singer, and a
   line that crosses a change of singer is split there, so the lip-sync shots
   are per singer. That goes into `<song>.cuemap.cast.json`, which is rebuilt
   every time; your own cue map is never changed.

If the cast or the cue map's sections change after the master is approved, the
final render refuses it until you rebuild and approve it again. Scene, camera
and lyric edits don't affect it. If a part's take was made for an older cast,
reject it and run `convert --cast` again.

Each render writes `<video>.manifest.json`: every clip used, where it came from,
its drift score, the seed, the frame rate and the audio file's SHA-256 with
which master it was.

### Albums: the master list and the voice presets

Each album's songs, in running order, live in a private list next to the
library, `~/StuttrLibrary/albums.json`. It records only what you decide: the
order, the album's title, and one voice mode per song:

- `solo`: the lead (Stuttr unless you set `--lead`) replaces Suno's lead, and
  Suno's backing vocals stay.
- `crew`: the lead, plus Suno's backing vocals converted into Stuttr, M, Ja
  and Bo.
- `cast`: different voices sing different sections (`cast.json`, above).

1. `npm run stuttr -- album SontheraVein` makes the album the first time, then
   shows its board.
2. `npm run stuttr -- album-add sontheravein bland clean cold --mode solo` adds
   songs by library id, at the end. `--at 1` puts them at track 1 (it also
   moves songs already on the album), and `album-order` sets the whole order at
   once. A song can be listed before you add it to the library.
3. `npm run stuttr -- album sontheravein` shows the board. It has one row per
   song, with these columns: source, stems, lead, backing, mix, master, Dance8
   and video. Below the table is each song's next step as a command. Every
   status is read from the library each time, never stored. A song is done when
   its voice master is approved and still matches its takes.
4. `npm run stuttr -- voices <song>` uses the song's mode from the list (or
   `--preset solo|crew|cast`). It first shows what it would convert and the
   credits; nothing is spent. With `--go` it converts, then makes the listening
   mix and lists what to approve. Takes the song already has cost nothing.
5. `npm run stuttr -- album-voices sontheravein` does the same for every song on
   the album that isn't done, and adds up the total. To convert, add `--go`
   and `--max-credits` at least that total; if the estimate comes out higher,
   nothing is converted. If a song fails, it stops there. Run it again to carry
   on; finished parts are skipped.
6. Listening, approving and approving the master stay yours. The board shows
   each command.

A rejected whole-song take isn't converted again by accident. Add `--redo` to
`convert`, `voices` or `album-voices`, and the new take replaces the rejected
one.

## Helper clips: from recording to page

1. **Record** on the phone (Control Centre, Screen Recording) using the
   synthetic sample data. Go slowly, close the keyboard before scrolling, and
   stay out of admin, sign-in, checkout and file-picker screens (they get cut
   anyway). AirDrop the recording to the Mac; it lands in `~/Downloads`.
2. **Note the seconds** you want: open it in QuickTime and read the times off
   the scrubber. Several pieces of one recording can be joined.
3. **Add or edit the entry** in `lib/helpers/registry.ts`: the page (`route`),
   a title, the recording's file name, the `segments` in seconds, the poster
   frame and one caption per step (the steps appear beside the video and light
   up as it plays). Phone recordings use `IPHONE_PAGE`, which crops off the
   status bar and browser bars.
4. **Render**: `npm run helpers` (all clips) or `npm run helpers -- <id>`.
   Recordings elsewhere: `--src <folder>`. Caption text only: `--captions`.
5. **Check**: `npm run verify` confirms the files match the registry, the page
   exists and renders the clips, and the sizes are within budget. `npm run dev`
   to watch them on the page.

A page shows its clips by rendering `<HelperClips route="/tools/…" />`. The
recert page, the vacancy calculator and every calculator under `app/tools/[slug]`
already do, so a new clip for those needs only a registry entry.

**Before re-recording**, check the clip still matches the app: a helper must
never show a button, number or screen the live tool no longer has. Re-record
after any change to what the recorded screen shows.
