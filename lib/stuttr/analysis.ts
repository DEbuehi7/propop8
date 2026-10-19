// lib/stuttr/analysis.ts
//
// Measures a song from its stems: tempo, beat grid, downbeats, how loud each
// part is per bar, where the vocals sing (per eighth note), and the chord in
// each half bar. Pure functions on decoded mono samples; the same samples give
// the same numbers every time. Stuttr owns the masters, so Stuttr runs this;
// Dance8 reads only the saved result (canon D8-14). Everything here is a
// measurement for a person to check by ear, never a decision (GOV-14).
//
//   Grid:      spectral-flux onsets of the drums; tempo from autocorrelation
//              with a broad prior around 120 BPM, refined by the circular
//              strength of the onsets at each candidate period; beat phase
//              from the angle of that sum.
//   Downbeats: which of the four beat positions has the strongest kick
//              (30-120 Hz) and bass onsets. 4/4 is assumed and stated.
//   Chords:    pitch-class energy of the harmony stems (110-2000 Hz), matched
//              to the 24 major and minor triads by cosine similarity.

export const ANALYSIS_SR = 22050;
export const ONSET_FFT = 2048;
export const ONSET_HOP = 512;
export const CHROMA_FFT = 4096;
export const CHROMA_HOP = 2048;
/** An eighth note louder than this (RMS dBFS) counts as sung. */
export const VOICED_DB = -42;
/** A half bar whose harmony is quieter than this (RMS dBFS) has no chord. */
export const NO_CHORD_DB = -55;
export const BPM_RANGE: [number, number] = [60, 200];
/**
 * Spectral flux peaks slightly before the onset it detects (centred frames).
 * Measured on synthetic clicks at 22.05 kHz, hop 512: 16 ms. Added back to
 * the first beat; tests/stuttrAnalysis.test.ts pins it.
 */
export const ONSET_LATENCY_SEC = 0.016;
export const ANALYZER = "stuttr-analysis-1";
export const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export type PartGroup = "lead" | "backing" | "drums" | "bass" | "harmony" | "fx";

export interface SongAnalysis {
  schemaVersion: 1;
  analyzer: typeof ANALYZER;
  trackId: string;
  sources: { group: PartGroup | "grid_fallback" | "harmony_fallback"; path: string; sha256: string }[];
  bpm: number;
  beatSec: number;
  firstBeatSec: number;
  beatsPerBar: 4;
  downbeatPhase: number;
  phaseScores: number[];
  /** Song time of bar 0. */
  firstDownbeatSec: number;
  /** 95th percentile distance of the tracked beats from the straight-line grid (steadiness check). */
  gridResidP95ms: number;
  bars: number;
  durationSec: number;
  /** RMS dBFS per bar; null when the song has no such part. */
  barDb: Record<PartGroup, number[] | null>;
  /** RMS dBFS per eighth note (8 per bar), for finding sung phrases. */
  eighthDb: { lead: number[] | null; backing: number[] | null };
  chords: { bar: number; half: 0 | 1; chord: string; fit: number }[];
  warnings: string[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

// ---------- FFT and short-time spectra ----------

const plans = new Map<number, { rev: Uint32Array; cos: Float64Array; sin: Float64Array; win: Float64Array }>();
function plan(n: number) {
  let p = plans.get(n);
  if (p) return p;
  if (n & (n - 1)) throw new Error("FFT size must be a power of two");
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((-2 * Math.PI * k) / n);
    sin[k] = Math.sin((-2 * Math.PI * k) / n);
  }
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  p = { rev, cos, sin, win };
  plans.set(n, p);
  return p;
}

/** In-place iterative radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  const { rev, cos, sin } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = i + k;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
      }
    }
  }
}

/**
 * Calls back with the magnitude spectrum (bins 0..nfft/2, scaled so a
 * full-scale sine peaks near 1) of every frame, Hann-windowed and centred on
 * frame * hop. Frame f is at time f * hop / sr.
 */
export function eachSpectrum(x: ArrayLike<number>, nfft: number, hop: number, cb: (frame: number, mag: Float64Array) => void): number {
  const { win } = plan(nfft);
  const frames = 1 + Math.floor(x.length / hop);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const mag = new Float64Array(nfft / 2 + 1);
  const scale = 4 / nfft;
  for (let f = 0; f < frames; f++) {
    const start = f * hop - nfft / 2;
    for (let i = 0; i < nfft; i++) {
      const s = start + i;
      re[i] = s >= 0 && s < x.length ? x[s] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k <= nfft / 2; k++) mag[k] = Math.hypot(re[k], im[k]) * scale;
    cb(f, mag);
  }
  return frames;
}

/**
 * Spectral-flux onset strength per ONSET_HOP frame: the rise in log magnitude
 * of every bin, summed. `band` limits it to one range (Hz), e.g. the kick.
 * (Checked against librosa on a real syncopated highlife stem: same tempo and
 * bar 1; log-spaced bands detuned it.)
 */
export function onsetEnvelope(x: ArrayLike<number>, sr = ANALYSIS_SR, band?: [number, number]): Float64Array {
  const binHz = sr / ONSET_FFT;
  const lo = band ? Math.max(1, Math.ceil(band[0] / binHz)) : 1;
  const hi = band ? Math.min(ONSET_FFT / 2, Math.floor(band[1] / binHz)) : ONSET_FFT / 2;
  const frames = 1 + Math.floor(x.length / ONSET_HOP);
  const env = new Float64Array(frames);
  let prev: Float64Array | null = null;
  eachSpectrum(x, ONSET_FFT, ONSET_HOP, (f, mag) => {
    const cur = new Float64Array(hi - lo + 1);
    let flux = 0;
    for (let k = lo; k <= hi; k++) {
      const v = Math.log1p(1000 * mag[k]);
      cur[k - lo] = v;
      if (prev) flux += Math.max(0, v - prev[k - lo]);
    }
    env[f] = flux;
    prev = cur;
  });
  return env;
}

// ---------- Tempo, beat phase and downbeats ----------

function circular(env: Float64Array, mean: number, frameSec: number, periodSec: number): { strength: number; angle: number } {
  let zr = 0;
  let zi = 0;
  const w = (2 * Math.PI * frameSec) / periodSec;
  for (let n = 0; n < env.length; n++) {
    const v = env[n] - mean;
    zr += v * Math.cos(w * n);
    zi -= v * Math.sin(w * n);
  }
  return { strength: Math.hypot(zr, zi), angle: Math.atan2(zi, zr) };
}

/**
 * Tempo and the time of the first beat (>= 0) from an onset envelope.
 * Coarse: autocorrelation over BPM_RANGE, weighted by a log-normal prior at
 * 120 BPM (one octave wide), so half/double tempo needs clear evidence.
 * Fine: the period within 3% that maximises the onsets' circular strength.
 * Phase: the angle of that sum, taken from phaseEnv when given.
 */
export function beatGrid(
  env: Float64Array, frameSec = ONSET_HOP / ANALYSIS_SR, phaseEnv?: Float64Array,
): { bpm: number; beatSec: number; firstBeatSec: number } {
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
  const lagMin = Math.floor(60 / BPM_RANGE[1] / frameSec);
  const lagMax = Math.ceil(60 / BPM_RANGE[0] / frameSec);
  let best = -Infinity;
  let bestLag = lagMin;
  const ac: number[] = [];
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let n = lag; n < env.length; n++) s += (env[n] - mean) * (env[n - lag] - mean);
    ac[lag] = s;
  }
  for (let lag = lagMin + 1; lag < lagMax; lag++) {
    const bpm = 60 / (lag * frameSec);
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    const w = ac[lag] * prior;
    if (ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1] && w > best) {
      best = w;
      bestLag = lag;
    }
  }
  const coarse = 60 / (bestLag * frameSec);
  let fine = coarse;
  let fineS = -1;
  for (let bpm = coarse * 0.97; bpm <= coarse * 1.03; bpm += 0.002) {
    const s = circular(env, mean, frameSec, 60 / bpm).strength;
    if (s > fineS) {
      fineS = s;
      fine = bpm;
    }
  }
  const beatSec = 60 / fine;
  // Phase from phaseEnv when given (the kick band): syncopated grooves put
  // their loudest hits off the beat, but the kick still lands on it.
  const pe = phaseEnv ?? env;
  const pMean = pe.reduce((a, b) => a + b, 0) / Math.max(1, pe.length);
  const { angle } = circular(pe, pMean, frameSec, beatSec);
  const theta = (((-angle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { bpm: r3(fine), beatSec: r6(beatSec), firstBeatSec: r3((theta / (2 * Math.PI)) * beatSec) };
}

/**
 * Dynamic-programming beat tracker (Ellis 2007, as in librosa): beats sit on
 * strong onsets, spaced close to the tempo's period; tightness sets how much a
 * gap may stretch. A straight line fitted through the tracked beats gives the
 * final period and the first beat (>= 0), which holds up in syncopated grooves
 * where the loudest hits fall off the beat.
 */
export function trackBeats(
  env: Float64Array, beatSec: number, frameSec = ONSET_HOP / ANALYSIS_SR, tightness = 400,
): { bpm: number; beatSec: number; firstBeatSec: number; beats: number[]; residP95ms: number } {
  const n = env.length;
  const p = beatSec / frameSec;
  let mean = 0;
  for (const v of env) mean += v;
  mean /= Math.max(1, n);
  let sd = 0;
  for (const v of env) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / Math.max(1, n)) || 1;
  const half = Math.round(p);
  const kernel = Array.from({ length: 2 * half + 1 }, (_, i) => Math.exp(-0.5 * (((i - half) * 32) / p) ** 2));
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) if (i + k >= 0 && i + k < n) s += (env[i + k] / sd) * kernel[k + half];
    local[i] = s;
  }
  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(p / 2);
  const hi = Math.round(2 * p);
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let arg = -1;
    for (let j = i - hi; j <= i - lo; j++) {
      if (j < 0) continue;
      const v = cum[j] - tightness * Math.log((i - j) / p) ** 2;
      if (v > best) { best = v; arg = j; }
    }
    cum[i] = local[i] + (arg >= 0 ? best : 0);
    back[i] = arg;
  }
  // Last beat: the best cumulative score within the final period.
  let last = Math.max(0, n - 1 - half);
  for (let i = last; i < n; i++) if (cum[i] > cum[last]) last = i;
  const frames: number[] = [];
  for (let i = last; i >= 0; i = back[i]) frames.push(i);
  frames.reverse();
  // Drop leading beats tracked through silence (no onset energy nearby).
  const thresh = 0.5 * local.reduce((a, b) => a + b, 0) / Math.max(1, n);
  while (frames.length > 2 && local[frames[0]] < thresh) frames.shift();
  const ts = frames.map((f) => f * frameSec);
  const k = ts.length;
  if (k < 4) return { bpm: r3(60 / beatSec), beatSec: r6(beatSec), firstBeatSec: 0, beats: ts, residP95ms: 0 };
  const mk = (k - 1) / 2;
  const mt = ts.reduce((a, b) => a + b, 0) / k;
  let num = 0;
  let den = 0;
  ts.forEach((t, i) => { num += (i - mk) * (t - mt); den += (i - mk) ** 2; });
  const per = num / den;
  const t0 = mt - per * mk;
  let first = (((t0 + ONSET_LATENCY_SEC) % per) + per) % per;
  if (per - first < 0.03) first = 0; // a beat a hair before 0 is the beat at 0, not the next one
  const resid = ts.map((t, i) => Math.abs(t - (t0 + per * i)) * 1000).sort((a, b) => a - b);
  const residP95ms = Math.round(resid[Math.min(k - 1, Math.floor(0.95 * (k - 1)))]);
  return { bpm: r3(60 / per), beatSec: r6(per), firstBeatSec: r3(first), beats: ts, residP95ms };
}

/** Largest value within +-radius frames of a time. */
function peakNear(env: Float64Array, sec: number, frameSec: number, radius = 3): number {
  const c = Math.round(sec / frameSec);
  let m = 0;
  for (let i = Math.max(0, c - radius); i <= Math.min(env.length - 1, c + radius); i++) m = Math.max(m, env[i]);
  return m;
}

/** Which beat (0-3) starts the bar: the strongest kick and bass onsets on that position. */
export function downbeatPhase(beats: number[], kick: Float64Array, bass: Float64Array | null, frameSec = ONSET_HOP / ANALYSIS_SR): { phase: number; scores: number[] } {
  const score = (env: Float64Array) => {
    const v = beats.map((t) => peakNear(env, t, frameSec));
    const all = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length) || 1;
    return [0, 1, 2, 3].map((p) => {
      const sel = v.filter((_, i) => i % 4 === p);
      return sel.reduce((a, b) => a + b, 0) / Math.max(1, sel.length) / all;
    });
  };
  const k = score(kick);
  const b = bass ? score(bass) : [0, 0, 0, 0];
  const scores = k.map((x, i) => r3(x + b[i]));
  let phase = 0;
  for (let p = 1; p < 4; p++) if (scores[p] > scores[phase]) phase = p;
  return { phase, scores };
}

// ---------- Loudness ----------

export function rmsDb(x: ArrayLike<number>, fromSec: number, toSec: number, sr = ANALYSIS_SR): number {
  const a = Math.max(0, Math.floor(fromSec * sr));
  const b = Math.min(x.length, Math.floor(toSec * sr));
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return b > a && s > 0 ? r1(10 * Math.log10(s / (b - a))) : -120;
}

// ---------- Chords ----------

/** Pitch-class energy (C..B) per CHROMA_HOP frame, from 110 Hz to 2 kHz. */
export function chromaFrames(x: ArrayLike<number>, sr = ANALYSIS_SR): { frameSec: number; chroma: Float64Array[] } {
  const binHz = sr / CHROMA_FFT;
  const pcOf: number[] = [];
  for (let k = 0; k <= CHROMA_FFT / 2; k++) {
    const f = k * binHz;
    pcOf[k] = f >= 110 && f <= 2000 ? ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12 : -1;
  }
  const chroma: Float64Array[] = [];
  eachSpectrum(x, CHROMA_FFT, CHROMA_HOP, (_f, mag) => {
    const c = new Float64Array(12);
    for (let k = 0; k < mag.length; k++) if (pcOf[k] >= 0) c[pcOf[k]] += mag[k];
    chroma.push(c);
  });
  return { frameSec: CHROMA_HOP / sr, chroma };
}

/** Best major or minor triad for a pitch-class vector, with its cosine fit (0..1). */
export function bestTriad(c: ArrayLike<number>): { chord: string; fit: number } {
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += c[i] * c[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return { chord: "N.C.", fit: 0 };
  let best = { chord: "N.C.", fit: -1 };
  for (let r = 0; r < 12; r++) {
    for (const [q, third] of [["", 4], ["m", 3]] as const) {
      const fit = (c[r] + c[(r + third) % 12] + c[(r + 7) % 12]) / (norm * Math.sqrt(3));
      if (fit > best.fit + 1e-12) best = { chord: NOTE_NAMES[r] + q, fit };
    }
  }
  return { chord: best.chord, fit: Math.round(best.fit * 100) / 100 };
}

// ---------- Whole song ----------

export interface AnalysisInput {
  trackId: string;
  durationSec: number;
  sources: SongAnalysis["sources"];
  /** Mono samples at ANALYSIS_SR, already summed per group. Missing groups are absent. */
  parts: Partial<Record<PartGroup, Float32Array>>;
  /** Used for the grid when there are no drum stems (e.g. the instrumental). */
  gridFallback?: Float32Array;
  /** Used for chords when there are no harmony stems. */
  harmonyFallback?: Float32Array;
  warnings?: string[];
}

export function analyzeSong(inp: AnalysisInput): SongAnalysis {
  const warnings = [...(inp.warnings ?? [])];
  const frameSec = ONSET_HOP / ANALYSIS_SR;
  const gridSrc = inp.parts.drums ?? inp.gridFallback;
  if (!gridSrc) throw new Error("no drums stem and no instrumental or full mix to find the beat in");
  if (!inp.parts.drums) warnings.push("no drum stem: the beat grid comes from the mix, check it by ear");
  const env = onsetEnvelope(gridSrc);
  const kick = onsetEnvelope(gridSrc, ANALYSIS_SR, [30, 150]);
  const grid = trackBeats(env, beatGrid(env, frameSec).beatSec, frameSec);
  const beats: number[] = [];
  for (let t = grid.firstBeatSec; t < inp.durationSec - 1e-9; t += grid.beatSec) beats.push(t);
  const bassEnv = inp.parts.bass ? onsetEnvelope(inp.parts.bass) : null;
  const db = downbeatPhase(beats, kick, bassEnv, frameSec);
  const firstDownbeatSec = r3(grid.firstBeatSec + db.phase * grid.beatSec);
  const barSec = 4 * grid.beatSec;
  const bars = Math.max(0, Math.floor((inp.durationSec - firstDownbeatSec) / barSec + 1e-9));
  warnings.push("4/4 time is assumed");
  if (grid.bpm < 70 || grid.bpm > 170) warnings.push(`${grid.bpm} BPM is unusual; it may be half or double the felt tempo`);

  const barStart = (b: number) => firstDownbeatSec + b * barSec;
  const perBar = (x?: Float32Array) => (x ? Array.from({ length: bars }, (_, b) => rmsDb(x, barStart(b), barStart(b + 1))) : null);
  const perEighth = (x?: Float32Array) =>
    x ? Array.from({ length: bars * 8 }, (_, k) => rmsDb(x, firstDownbeatSec + (k * grid.beatSec) / 2, firstDownbeatSec + ((k + 1) * grid.beatSec) / 2)) : null;

  const harm = inp.parts.harmony ?? inp.harmonyFallback;
  if (!inp.parts.harmony && harm) warnings.push("no harmony stems: chords come from the mix and may be pulled by the vocals");
  const chords: SongAnalysis["chords"] = [];
  if (harm) {
    const { frameSec: cf, chroma } = chromaFrames(harm);
    for (let b = 0; b < bars; b++) {
      for (const half of [0, 1] as const) {
        const t0 = barStart(b) + half * 2 * grid.beatSec;
        const t1 = t0 + 2 * grid.beatSec;
        const sum = new Float64Array(12);
        for (let f = Math.ceil(t0 / cf); f < Math.min(chroma.length, Math.ceil(t1 / cf)); f++) for (let i = 0; i < 12; i++) sum[i] += chroma[f][i];
        const quiet = rmsDb(harm, t0, t1) < NO_CHORD_DB;
        chords.push({ bar: b, half, ...(quiet ? { chord: "N.C.", fit: 0 } : bestTriad(sum)) });
      }
    }
  } else warnings.push("no harmony to read chords from");

  return {
    schemaVersion: 1,
    analyzer: ANALYZER,
    trackId: inp.trackId,
    sources: inp.sources,
    bpm: grid.bpm,
    beatSec: grid.beatSec,
    firstBeatSec: grid.firstBeatSec,
    beatsPerBar: 4,
    downbeatPhase: db.phase,
    phaseScores: db.scores,
    firstDownbeatSec,
    gridResidP95ms: grid.residP95ms,
    bars,
    durationSec: r3(inp.durationSec),
    barDb: {
      lead: perBar(inp.parts.lead), backing: perBar(inp.parts.backing), drums: perBar(inp.parts.drums),
      bass: perBar(inp.parts.bass), harmony: perBar(harm), fx: perBar(inp.parts.fx),
    },
    eighthDb: { lead: perEighth(inp.parts.lead), backing: perEighth(inp.parts.backing) },
    chords,
    warnings,
  };
}

/** Which analysis group a library stem belongs to (by its stem name). */
export function groupOfStem(stemName: string | undefined): PartGroup | null {
  const s = (stemName ?? "").toLowerCase();
  if (/click|metronome/.test(s)) return null;
  if (/drum|percussion|perc/.test(s)) return "drums";
  if (/bass/.test(s)) return "bass";
  if (/fx|sfx|effect/.test(s)) return "fx";
  return "harmony";
}
