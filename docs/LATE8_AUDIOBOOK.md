# Late8 audiobook

The Stuttr Spies audiobook plays on the Late8 page (`/plate8/late8`). Its audio
and manifest live in Cloudflare R2, never in git (canon PL8-09). The page shows
"No audiobook is published yet" until `LATE8_AUDIOBOOK_URL` is set.

## 1. The book folder (Stuttr library, private)

`npm run stuttr -- audiobook stuttr-spies-1` makes
`~/StuttrLibrary/audiobook/stuttr-spies-1/` with a `book.txt` to fill in
(`series:`, `title:`, `author:`; an optional `cover.jpg` sits next to it). Add
one folder per chapter, in name order (`01-the-pause`, `02-...`), each with:

- `chapter.txt`: `title:`, and optionally `mission:`, `narrator:`,
  `characters:` (a comma list), `scene:`, `location:`. It is published only with
  `status: approved` and `rights: cleared` (music, voice and likeness rights
  checked first, canon STU-02). Running the command makes a starter file in
  any chapter folder that has none.
- the final mix: `audio.wav` (or .mp3, .m4a, .flac, .aiff);
- optionally `transcript.txt`, one line each: `[mm:ss.xx] Speaker: words`.
  The times come from the narration itself (for example ElevenLabs'
  timestamps or your own marks), never from a model. Lines without a time
  still show; a time past the end of the audio is dropped;
- optionally `cover.jpg`.

Run the command again. It encodes each approved chapter to a 128 kbps MP3
named by its content (a new mix gets a new name, so no stale copy is ever
served), writes `publish/audiobook.json`, and lists every held chapter with
the reason.

## 2. Cloudflare R2, once

On the Mac, with Dance8's own Cloudflare account (canon D8-13):

```
npx wrangler login
npx wrangler r2 bucket create stuttr-audio
npx wrangler r2 bucket dev-url enable stuttr-audio
```

The r2.dev address is rate-limited and meant for development, which is fine
for a first chapter. For a public launch, connect a custom domain to the
bucket in the Cloudflare dashboard and use that address instead.

## 3. Upload, and point Late8 at it

```
npm run stuttr -- audiobook stuttr-spies-1 --upload stuttr-audio
```

It uploads the audio and covers first and the manifest last, then prints the
manifest's public URL. Put that URL in Netlify (Site configuration,
Environment variables) as `LATE8_AUDIOBOOK_URL`, once, and redeploy. Later
uploads need no redeploy: the page reads the manifest every few minutes.

## On the page

Listen: play, ±15 s, seek, speed, chapters, and resume where you left off
(kept in that browser only). Read along: the line being read is highlighted,
and a tap on a timed line jumps there. Lock-screen controls work where the
browser offers them. Mission Lens (spoiler-safe visuals) is not built yet.

The page is public, so a published chapter is published. That is why the
approved and cleared marks are required.
