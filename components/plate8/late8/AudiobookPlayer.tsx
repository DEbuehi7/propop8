'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { clock, lineAt, type AudiobookManifest } from '@/lib/late8/audiobook';
import type { AudiobookState } from '@/lib/late8/load';

/**
 * The Late8 audiobook player (canon PL8-09): listen first. Play, ±15 s, seek,
 * speed, chapters, resume where you left off, and a read-along transcript
 * that follows the narration's own clock. Positions are kept in this
 * browser only (localStorage), so they never leave the listener's device.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

const read = (k: string): string | null => {
  try { return window.localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string) => {
  try { window.localStorage.setItem(k, v); } catch { /* private mode: no resume */ }
};

export default function AudiobookPlayer() {
  const [state, setState] = useState<AudiobookState | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/late8/audiobook')
      .then((r) => r.json() as Promise<AudiobookState>)
      .then((s) => { if (live) setState(s); })
      .catch(() => { if (live) setState({ state: 'unavailable', reason: 'the audiobook service did not answer' }); });
    return () => { live = false; };
  }, []);

  if (!state) {
    return <section className="rounded-lg border border-[#2D3456] bg-[#1A1F3A] p-6 text-[#A0A7B8]">Loading the audiobook…</section>;
  }
  if (state.state !== 'ok') {
    return (
      <section className="rounded-lg border border-[#2D3456] bg-[#1A1F3A] p-6">
        <h2 className="text-lg font-semibold mb-1">Stuttr Spies audiobook</h2>
        <p className="text-[#A0A7B8] text-sm">
          {state.state === 'not_configured' ? 'No audiobook is published yet.' : `The audiobook can't be loaded right now: ${state.reason}.`}
        </p>
      </section>
    );
  }
  return <Player book={state.manifest} />;
}

function Player({ book }: { book: AudiobookManifest }) {
  const audio = useRef<HTMLAudioElement>(null);
  const scroller = useRef<HTMLOListElement>(null);
  const lastSaved = useRef(0);
  const resumeOnLoad = useRef(true);
  const [index, setIndex] = useState(() => {
    const saved = Number(read(`late8:${book.bookId}:chapter`));
    return Number.isInteger(saved) && saved >= 0 && saved < book.chapters.length ? saved : 0;
  });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(book.chapters[index]?.durationSec ?? 0);
  const [rate, setRate] = useState(() => {
    const r = Number(read('late8:rate'));
    return (SPEEDS as readonly number[]).includes(r) ? r : 1;
  });
  const ch = book.chapters[index];
  const posKey = `late8:${book.bookId}:${ch.id}:pos`;
  const current = lineAt(ch.transcript, time);
  const cover = ch.cover ?? book.cover;

  const save = useCallback((t: number) => { write(posKey, String(Math.floor(t))); lastSaved.current = t; }, [posKey]);

  const go = useCallback((i: number, keepPlaying: boolean) => {
    if (i < 0 || i >= book.chapters.length) return;
    if (audio.current) save(audio.current.currentTime);
    resumeOnLoad.current = true;
    setIndex(i);
    setTime(0);
    setDuration(book.chapters[i].durationSec);
    write(`late8:${book.bookId}:chapter`, String(i));
    if (keepPlaying) requestAnimationFrame(() => { audio.current?.play().catch(() => setPlaying(false)); });
  }, [book, save]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  };
  const skip = (d: number) => {
    const a = audio.current;
    if (a) a.currentTime = Math.min(Math.max(0, a.currentTime + d), a.duration || duration);
  };
  const seek = (t: number) => {
    const a = audio.current;
    if (a) a.currentTime = t;
    setTime(t);
  };

  useEffect(() => { if (audio.current) audio.current.playbackRate = rate; write('late8:rate', String(rate)); }, [rate, index]);

  // Lock-screen and headphone controls, where the browser offers them.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${ch.number}. ${ch.title}`, artist: book.series, album: book.title,
        artwork: cover ? [{ src: cover }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => { void audio.current?.play(); });
      navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => skip(15));
      navigator.mediaSession.setActionHandler('previoustrack', index > 0 ? () => go(index - 1, true) : null);
      navigator.mediaSession.setActionHandler('nexttrack', index < book.chapters.length - 1 ? () => go(index + 1, true) : null);
    } catch { /* not supported here */ }
    // skip is stable enough for this purpose; re-registered when the chapter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, ch, cover, index, go]);

  // Keep the line being read in view inside the transcript box (never scrolls the page).
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-line="${current}"]`);
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 3);
  }, [current]);

  return (
    <section className="rounded-lg border border-[#2D3456] bg-[#1A1F3A] p-5 md:p-6" aria-label="Audiobook player">
      <div className="flex gap-4 items-start">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-20 h-20 md:w-28 md:h-28 rounded-md object-cover border border-[#2D3456] shrink-0" />
        ) : null}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-teal-400">{book.series}{book.series !== book.title ? ` · ${book.title}` : ''}</p>
          <h2 className="text-xl font-semibold break-words">Chapter {ch.number}: {ch.title}</h2>
          <p className="text-sm text-[#A0A7B8] break-words">
            {[ch.mission && `Mission: ${ch.mission}`, ch.narrator && `Narrated by ${ch.narrator}`, ch.location, ch.scene].filter(Boolean).join(' · ')}
          </p>
          {ch.characters.length ? (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {ch.characters.map((c) => <span key={c} className="text-xs rounded-full border border-[#2D3456] px-2 py-0.5 text-[#C9CEDA]">{c}</span>)}
            </p>
          ) : null}
        </div>
      </div>

      <audio
        ref={audio}
        src={ch.audio}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          a.playbackRate = rate;
          if (Number.isFinite(a.duration)) setDuration(a.duration);
          if (resumeOnLoad.current) {
            resumeOnLoad.current = false;
            const pos = Number(read(posKey));
            if (pos > 5 && pos < a.duration - 5) { a.currentTime = pos; setTime(pos); }
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setTime(t);
          if (Math.abs(t - lastSaved.current) >= 5) save(t);
        }}
        onPlay={() => setPlaying(true)}
        onPause={(e) => { setPlaying(false); save(e.currentTarget.currentTime); }}
        onEnded={() => {
          write(posKey, '0');
          if (index < book.chapters.length - 1) go(index + 1, true);
          else setPlaying(false);
        }}
      />

      <div className="mt-5">
        <input
          type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1} value={Math.min(Math.floor(time), Math.floor(duration))}
          onChange={(e) => seek(Number(e.target.value))} aria-label="Position in chapter" className="w-full accent-teal-400"
        />
        <div className="flex justify-between text-xs text-[#A0A7B8] tabular-nums"><span>{clock(time)}</span><span>-{clock(Math.max(0, duration - time))}</span></div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => go(index - 1, playing)} disabled={index === 0} aria-label="Previous chapter" className="px-3 py-2 rounded-md border border-[#2D3456] disabled:opacity-40">⏮</button>
        <button type="button" onClick={() => skip(-15)} aria-label="Back 15 seconds" className="px-3 py-2 rounded-md border border-[#2D3456]">−15</button>
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="px-6 py-2 rounded-md bg-teal-500 text-[#0A0E27] font-semibold">{playing ? 'Pause' : 'Play'}</button>
        <button type="button" onClick={() => skip(15)} aria-label="Forward 15 seconds" className="px-3 py-2 rounded-md border border-[#2D3456]">+15</button>
        <button type="button" onClick={() => go(index + 1, playing)} disabled={index >= book.chapters.length - 1} aria-label="Next chapter" className="px-3 py-2 rounded-md border border-[#2D3456] disabled:opacity-40">⏭</button>
        <label className="ml-1 text-sm text-[#A0A7B8]">
          <span className="sr-only">Playback speed</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="bg-[#0F1220] border border-[#2D3456] rounded-md px-2 py-2 text-[#E8EAEF]">
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div>
          <h3 className="text-sm font-semibold mb-2">Read along</h3>
          {ch.transcript.length ? (
            <ol ref={scroller} className="relative max-h-72 overflow-y-auto space-y-2 pr-1 text-sm leading-relaxed">
              {ch.transcript.map((l, i) => (
                <li key={i} data-line={i}>
                  <button
                    type="button" disabled={l.t === null} onClick={() => l.t !== null && seek(l.t)}
                    className={`text-left w-full rounded px-2 py-1 ${i === current ? 'bg-teal-500/15 text-[#E8EAEF]' : 'text-[#A0A7B8]'} ${l.t === null ? 'cursor-default' : 'hover:bg-white/5'}`}
                  >
                    {l.speaker ? <span className="font-semibold text-teal-300">{l.speaker}: </span> : null}{l.text}
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-[#A0A7B8]">No transcript for this chapter.</p>}
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Chapters</h3>
          <ol className="space-y-1 text-sm">
            {book.chapters.map((c, i) => (
              <li key={c.id}>
                <button type="button" onClick={() => go(i, playing)} aria-current={i === index ? 'true' : undefined}
                  className={`w-full text-left rounded px-2 py-1.5 ${i === index ? 'bg-teal-500/15 text-[#E8EAEF]' : 'text-[#A0A7B8] hover:bg-white/5'}`}>
                  {c.number}. {c.title} <span className="text-xs text-[#6B7186]">{clock(c.durationSec)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
