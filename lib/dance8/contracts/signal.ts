export type SignalStatus = "known" | "unknown" | "invalid" | "not_applicable";

export interface SignalValue {
  value: number | null;
  confidence: number; // 0..1
  status: SignalStatus;
}

export type MusicSection =
  | "intro" | "verse" | "build" | "chorus" | "break" | "outro" | "unknown";

export interface AnalysisProfile {
  id: string;
  schemaVersion: 1;
  trackId: string;
  sourceHash: string;
  analyzerId: string;
  analyzerVersion: string;
  sampleRate: number;
  fftSize: number;
  hopSize: number;
  estimatedAnalysisLatencyMs: number;
  generatedAt: string;
}

export interface SignalFrame {
  t: number; // seconds from track origin
  beatIndex: number;
  barIndex: number;
  beatPhase: number; // 0 <= phase < 1
  bpm: SignalValue;
  energy: SignalValue;
  onset: SignalValue;
  low: SignalValue;
  mid: SignalValue;
  high: SignalValue;
  section: MusicSection;
  analysisProfileId: string;
}

/** Returns a number only for a usable known value; never invents a default. */
export function knownValue(s: SignalValue): number | null {
  if (s.status !== "known" || s.value === null) return null;
  return s.value;
}
