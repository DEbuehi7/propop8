// lib/dance8/authoring/klingCredits.ts
//
// Spending Kling credits carefully. Arithmetic only (GOV-14): the estimate is
// seconds x a per-second rate, and a rate is used only when a source states it
// or Daniel types it in from his own account; an unknown rate stays unknown
// (GOV-17), never a guess. Three savings come from the shot list itself:
//   - one b-roll clip per set and camera: every b-roll shot of the same set,
//     camera and settings is covered by one clip once it is approved, so only
//     the group's lead card is generated (the rest drop out after clips);
//   - a test card per set: the first shot of a set with no clip yet goes first,
//     and the set's other shots wait until that clip shows the references hold;
//   - a budget: cards go in priority order until the credits run out.
// Pure: no files.

import { GENERATORS } from "./generators";
import type { UploadCard } from "./klingPack";

/** Daniel's own rates, in the Stuttr library: {"kling-4.0-flash": 5, "lip-sync": 2} (credits per second). */
export const RATES_FILE = "kling-rates.json";
/** The key for Kling's lip-sync step, charged per second of audio. */
export const LIP_SYNC_RATE = "lip-sync";

export interface Rate {
  /** Kling app credits per second of output, native audio off. */
  perSec: number;
  source: string;
}
export type Rates = Record<string, Rate>;

const KLING_3_SOURCE = "Kling VIDEO 3.0 user guide, as reported by FrameSurfer on 13 Oct 2026 (checked 2 Nov 2026)";

/**
 * Rates a source states, native audio off. Kling 4.0, 4.0 Flash, Motion
 * Control and lip sync had no published rate on 2 Nov 2026: Kling shows the
 * cost on its Generate button, so Daniel enters those in kling-rates.json.
 */
export const PUBLISHED_RATES: Rates = {
  "kling-3.0": { perSec: 8, source: `${KLING_3_SOURCE}: 1080p` },
  "kling-3.0-720p": { perSec: 6, source: `${KLING_3_SOURCE}: 720p` },
};

/** Native audio costs half again on Kling 3.0 (9 vs 6 and 12 vs 8 credits a second); Dance8 never needs it. */
export const NATIVE_AUDIO_MARKUP = 1.5;

/** Reads kling-rates.json: generator ids (or "lip-sync") to credits per second. */
export function parseRates(raw: unknown): { rates: Rates; issues: string[] } {
  const rates: Rates = {};
  const issues: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { rates, issues: [`${RATES_FILE} must be an object of credits per second, like {"kling-4.0-flash": 5}`] };
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in GENERATORS) && k !== LIP_SYNC_RATE) issues.push(`${RATES_FILE}: "${k}" is not a generator (${[...Object.keys(GENERATORS), LIP_SYNC_RATE].join(", ")})`);
    else if (typeof v !== "number" || !Number.isFinite(v) || v < 0) issues.push(`${RATES_FILE}: "${k}" must be a number of credits per second`);
    else rates[k] = { perSec: v, source: `your ${RATES_FILE}` };
  }
  return { rates, issues };
}

/** Daniel's rates win over published ones (his plan's prices are the ones he pays). */
export const mergeRates = (own: Rates = {}): Rates => ({ ...PUBLISHED_RATES, ...own });

export type Batch =
  | "now"        // generate in this batch
  | "later"      // ready, but past the budget
  | "after_test" // waits for this set's test clip to be checked
  | "covered"    // another card's clip covers it
  | "no_rate"    // budget set, but its cost is unknown
  | "not_ready"; // files or words missing

export interface CreditNote {
  /** Seconds to generate: for a group's lead, the longest shot it covers. */
  generateSec: number;
  /** Seconds charged (whole seconds, rounded up). */
  billedSec: number;
  video: number | null;
  /** Lip-sync shots only: Kling's lip-sync step; null when its rate is unknown. */
  lipSync: number | null;
  /** Video plus lip sync; null when any part's rate is unknown. */
  total: number | null;
  batch: Batch;
  /** The shot whose clip covers this one. */
  coveredBy: string | null;
  /** Shots this card's clip covers. */
  covers: string[];
  /** The first shot of a set with no clip yet: generate it first and check the references. */
  testFirst: boolean;
}

export interface PlanOptions {
  /** Stop when the next card would pass this many credits. */
  budget?: number;
  /** Sets that already have a clip (approved or still to check), so need no test card. */
  testedScenes?: ReadonlySet<string>;
}

const billed = (sec: number) => Math.ceil(sec - 1e-9);
const KIND_PRIORITY: UploadCard["kind"][] = ["lip_sync", "dance", "trick", "broll"];

/**
 * A b-roll card's coverage group. The shot list asks for b-roll only where a
 * set and camera have no approved clip (shotBriefs, candidatesFor), so one
 * approved clip of the set and camera covers every b-roll card in the group.
 */
const groupKey = (c: UploadCard) => (c.kind === "broll" ? `${c.sceneId}|${c.camera}` : null);
const maxSecOf = (c: UploadCard) => GENERATORS[c.generator]?.maxSec ?? Infinity;

/**
 * Adds a credit note to every card, in the cards' order (the page order is
 * kept; the budget picks by priority: test cards, then lip sync, dance,
 * tricks and b-roll, each by song time).
 */
export function planCredits(cards: UploadCard[], rates: Rates, o: PlanOptions = {}): UploadCard[] {
  const at = new Map(cards.map((c, i) => [c.shotId, i]));
  const lead = new Map<string, string>();
  const groupSec = new Map<string, number>();
  const groups = new Map<string, UploadCard[]>();
  for (const c of cards) {
    const k = groupKey(c);
    if (k) groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const g of groups.values()) {
    // The lead can make the group's longest shot, hides mouths when any member must (its clip then suits
    // every member), then is the longest itself, then comes first on the page.
    const longest = Math.max(...g.map((c) => c.lengthSec));
    const can = (c: UploadCard) => Number(maxSecOf(c) >= longest);
    const [first] = [...g].sort((a, b) => can(b) - can(a) || Number(b.mouth === "hidden") - Number(a.mouth === "hidden")
      || b.lengthSec - a.lengthSec || at.get(a.shotId)! - at.get(b.shotId)!);
    for (const c of g) lead.set(c.shotId, first.shotId);
    groupSec.set(first.shotId, Math.min(longest, maxSecOf(first)));
  }

  const tested = o.testedScenes ?? new Set<string>();
  const testFor = new Map<string, string>();
  for (const c of cards) {
    const own = (lead.get(c.shotId) ?? c.shotId) === c.shotId;
    if (own && c.ready && !tested.has(c.sceneId) && !testFor.has(c.sceneId)) testFor.set(c.sceneId, c.shotId);
  }

  const notes = new Map<string, CreditNote>();
  for (const c of cards) {
    const leadId = lead.get(c.shotId) ?? c.shotId;
    const generateSec = groupSec.get(c.shotId) ?? c.lengthSec;
    const r = rates[c.generator];
    const video = r ? billed(generateSec) * r.perSec : null;
    const ls = rates[LIP_SYNC_RATE];
    const lipSync = c.kind === "lip_sync" ? (ls ? billed(c.songEndSec - c.songStartSec) * ls.perSec : null) : null;
    const total = video === null || (c.kind === "lip_sync" && lipSync === null) ? null : video + (lipSync ?? 0);
    const covered = leadId !== c.shotId;
    const testFirst = testFor.get(c.sceneId) === c.shotId;
    const waits = !covered && !testFirst && !tested.has(c.sceneId) && testFor.has(c.sceneId);
    const batch: Batch = covered ? "covered" : !c.ready ? "not_ready" : waits ? "after_test" : "now";
    notes.set(c.shotId, {
      generateSec, billedSec: billed(generateSec), video: covered ? 0 : video, lipSync: covered ? null : lipSync, total: covered ? 0 : total, batch,
      coveredBy: covered ? leadId : null, covers: covered ? [] : cards.filter((x) => x.shotId !== c.shotId && lead.get(x.shotId) === c.shotId).map((x) => x.shotId), testFirst,
    });
  }

  if (o.budget !== undefined) {
    const order = cards.filter((c) => notes.get(c.shotId)!.batch === "now").sort((a, b) => {
      const na = notes.get(a.shotId)!, nb = notes.get(b.shotId)!;
      return Number(nb.testFirst) - Number(na.testFirst) || KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
        || a.songStartSec - b.songStartSec || at.get(a.shotId)! - at.get(b.shotId)!;
    });
    let spent = 0;
    for (const c of order) {
      const n = notes.get(c.shotId)!;
      if (n.total === null) n.batch = "no_rate";
      else if (spent + n.total <= o.budget + 1e-9) spent += n.total;
      else n.batch = "later";
    }
  }
  return cards.map((c) => ({ ...c, credit: notes.get(c.shotId)! }));
}

export interface CreditSummary {
  now: number;
  nowKnown: number;
  nowCredits: number;
  later: number;
  afterTest: number;
  covered: number;
  savedByCover: number;
  notReady: number;
  noRate: number;
  /** Tools on cards to generate whose rate is unknown. */
  unknownTools: string[];
  lipSyncUnknown: boolean;
}

export function summarize(cards: UploadCard[], rates: Rates): CreditSummary {
  const n = (b: Batch) => cards.filter((c) => c.credit?.batch === b);
  const now = n("now");
  const toGenerate = cards.filter((c) => c.credit && c.credit.batch !== "covered");
  const savedByCover = n("covered").reduce((s, c) => {
    const r = rates[c.generator];
    return s + (r ? billed(c.lengthSec) * r.perSec : 0);
  }, 0);
  return {
    now: now.length,
    nowKnown: now.filter((c) => c.credit!.total !== null).length,
    nowCredits: now.reduce((s, c) => s + (c.credit!.total ?? 0), 0),
    later: n("later").length,
    afterTest: n("after_test").length,
    covered: n("covered").length,
    savedByCover,
    notReady: n("not_ready").length,
    noRate: n("no_rate").length,
    unknownTools: [...new Set(toGenerate.filter((c) => c.credit!.video === null).map((c) => c.tool))].sort(),
    lipSyncUnknown: toGenerate.some((c) => c.kind === "lip_sync") && !rates[LIP_SYNC_RATE],
  };
}
