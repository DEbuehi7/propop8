/**
 * Locks the AIM canon (lib/canon). Two kinds of test:
 *   - structure: every entry cites a real study page, every study is covered,
 *     every repo path an entry points to exists, vocabularies have the counts
 *     the studies define, and the small deterministic rules behave;
 *   - lock: a SHA-256 of the whole canon must match tests/fixtures/canon_lock.json.
 * Regenerate the lock deliberately, after bumping CANON_VERSION, with
 *   UPDATE_GOLDEN=1 npm test
 * and review the diff. Never regenerate it to make a change pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANON_REGISTER, CANON_VERSION, STUDIES, canonSnapshot, checkGenomeRecord, checkTriadicUnit, framesPerBar,
  framesPerBeat, GUILD_NAVIGATION_EXAMPLE, stableStringify, triadicAngles, vocab,
} from "../lib/canon";
import { renderRegisterMarkdown } from "../lib/canon/report";

const ROOT = join(__dirname, "..");

test("canon: entry ids are unique and well-formed", () => {
  const ids = CANON_REGISTER.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate canon id");
  for (const id of ids) assert.match(id, /^[A-Z0-9]{2,4}-\d{2}$/, id);
});

test("canon: every source cites a known study and a page inside it", () => {
  const pages = new Map(STUDIES.map((s) => [s.id, s.pages]));
  for (const e of CANON_REGISTER) {
    assert.ok(e.sources.length > 0, `${e.id} has no source`);
    for (const src of e.sources) {
      const n = pages.get(src.study);
      assert.ok(n, `${e.id}: unknown study ${src.study}`);
      assert.ok(Number.isInteger(src.page) && src.page >= 1 && src.page <= (n as number), `${e.id}: page ${src.page} outside ${src.study}`);
    }
  }
});

test("canon: all twenty studies are integrated (at least three entries each)", () => {
  assert.equal(STUDIES.length, 20);
  assert.equal(new Set(STUDIES.map((s) => s.fileKey)).size, 20, "duplicate study file key");
  for (const s of STUDIES) {
    const n = CANON_REGISTER.filter((e) => e.sources.some((x) => x.study === s.id)).length;
    assert.ok(n >= 3, `${s.id} has only ${n} canon entries`);
  }
});

test("canon: conflicts and open questions say what the owner must decide", () => {
  for (const e of CANON_REGISTER.filter((x) => x.status === "CONFLICT")) {
    assert.ok(e.note && e.note.length > 10, `${e.id} needs a note naming the decision`);
  }
  // A conflict or open question is never marked as built.
  for (const e of CANON_REGISTER.filter((x) => x.status === "CONFLICT" || x.status === "OPEN")) {
    assert.equal(e.impl, "n/a", `${e.id}`);
  }
});

test("canon: every repo path an entry points to exists", () => {
  for (const e of CANON_REGISTER) {
    for (const w of e.where ?? []) {
      const path = w.split(/[ #]/)[0];
      if (!path.includes("/") && !/\.\w+$/.test(path)) continue; // "PR #13", "commit 58e4f95"
      assert.ok(existsSync(join(ROOT, path)), `${e.id}: ${path} does not exist`);
    }
  }
});

test("canon vocab: counts the studies define", () => {
  assert.equal(vocab.EDO_GENES.length, 6);
  assert.equal(vocab.EDO_FAMILIES.length, 8);
  assert.equal(vocab.EDO_SCALES.length, 5);
  assert.equal(vocab.EDO_LOCKED_GENES.length, 6);
  assert.equal(vocab.B5R_LIFECYCLE.length, 9);
  assert.equal(vocab.DESIGN_STACK.length, 9);
  assert.equal(vocab.INFRA_SYSTEMS.length, 10);
  assert.equal(vocab.INFRA_ENVIRONMENTS.length, 4);
  assert.equal(vocab.INFRA_PHASES.length, 6);
  assert.equal(vocab.PLATE8_INSTRUMENTS.length, 6);
  assert.equal(vocab.LET_NODES.length, 3);
  assert.equal(vocab.KIRTLED_C_MAJOR.length, 6);
  assert.deepEqual(vocab.EDO_KERNEL_FIRST_FAMILIES.filter((f) => !vocab.EDO_FAMILIES.some((x) => x.id === f)), []);
});

test("canon vocab: expression densities are ordered and do not overlap; surface mix sums to 1", () => {
  const d = vocab.EDO_EXPRESSION_LEVELS.map((l) => l.density);
  for (const [lo, hi] of d) assert.ok(lo < hi);
  for (let i = 1; i < d.length; i++) assert.ok(d[i - 1][1] < d[i][0], "density bands overlap");
  const m = vocab.EDO_DEFAULT_SURFACE_MIX;
  assert.ok(Math.abs(m.quiet + m.pattern + m.signal - 1) < 1e-9);
});

test("canon vocab: colours are hex, semantic states are distinct, undefined hexes stay null", () => {
  for (const hex of Object.values(vocab.CANON_COLORS)) assert.match(hex, /^#[0-9A-F]{6}$/);
  const colours = vocab.SEMANTIC_STATES.map((s) => s.color);
  assert.equal(new Set(colours).size, colours.length);
  for (const s of vocab.SEMANTIC_STATES) {
    if (s.color === "amber" || s.color === "green") assert.equal(s.hex, null, `${s.color} hex is an open decision`);
    else assert.match(s.hex as string, /^#[0-9A-F]{6}$/);
  }
});

test("canon vocab: namespaces never share a key", () => {
  const keys = [...vocab.EDO_MEANINGS.map((m) => m.key), ...vocab.TRIADIC_MEANINGS.map((m) => m.key)];
  assert.equal(new Set(keys).size, keys.length);
  for (const t of vocab.TRIADIC_MEANINGS) assert.equal(t.roles.length, 3);
});

test("canon D8-09: the MIDI export is five music tracks plus light cues on the D8-08 channels; DASH names FREEZE", () => {
  const ch = vocab.KIRTLED_MIDI_CHANNELS;
  assert.deepEqual(vocab.KIRTLED_MIDI_EXPORT.tracks.map((t) => t.channel), [ch.piano, ch.bass, ch.pads, ch.lead, ch.drums, ch.lightCues]);
  assert.equal(vocab.KIRTLED_MIDI_EXPORT.tracks.filter((t) => t.kind === "music").length, 5);
  assert.equal(vocab.KIRTLED_MOVES.find((m) => m.move === "FREEZE")!.word, "DASH");
  assert.equal(vocab.KIRTLED_MOVES.find((m) => m.move === "JUMP")!.word, "TI", "JUMP keeps TI; DASH is not its alias");
});

test("canon vocab: Kirtled canonical sequence is internally consistent", () => {
  const q = vocab.KIRTLED_CANONICAL_SEQUENCE;
  assert.equal(q.words.length, q.chords.length - 1);
  assert.equal(q.cues.length, q.chords.length - 1);
  const cueValues: string[] = Object.values(vocab.KIRTLED_SIDE_CUES);
  for (const c of q.cues) assert.ok(cueValues.includes(c));
  const notes: string[] = vocab.KIRTLED_C_MAJOR.map((c) => c.notes);
  assert.ok(!notes.includes("BDF"), "diminished triad is omitted by design");
});

test("canon rules: triadic seed angles and the source-lock check", () => {
  assert.deepEqual(triadicAngles(0), [0, 120, 240]);
  assert.deepEqual(triadicAngles(90), [90, 210, 330]);
  assert.deepEqual(checkTriadicUnit({ memberAnglesDeg: triadicAngles(17), originCount: 1 }), []);
  assert.deepEqual(checkTriadicUnit({ memberAnglesDeg: [0, 90, 180, 270], originCount: 1 }), ["member_count"]);
  assert.deepEqual(checkTriadicUnit({ memberAnglesDeg: [0, 120, 240], originCount: 2 }), ["origin"]);
  assert.deepEqual(checkTriadicUnit({ memberAnglesDeg: [0, 100, 240], originCount: 1 }), ["spacing"]);
});

test("canon rules: the reference genome record is well-formed; bad records are caught", () => {
  assert.deepEqual(checkGenomeRecord(GUILD_NAVIGATION_EXAMPLE), []);
  const bad = { ...GUILD_NAVIGATION_EXAMPLE, id: "EDO-14", family: "EDO_HEX_GRID", seed: 1.5, status: "live", signal: { color: "gold", intensity: 2 } };
  const issues = checkGenomeRecord(bad);
  assert.equal(issues.length, 6, issues.join("; "));
});

test("canon rules: sync grid (120 BPM at 24 fps = 12 frames per beat, 48 per 4/4 bar)", () => {
  const r = vocab.SYNC_REFERENCE;
  assert.equal(framesPerBeat(r.bpm, r.fps), 12);
  assert.equal(framesPerBar(r.bpm, r.fps, r.beatsPerBar), 48);
  assert.throws(() => framesPerBeat(0, 24));
});

test("canon doc: docs/canon/REGISTER.md matches the register", () => {
  const path = join(ROOT, "docs", "canon", "REGISTER.md");
  const expected = renderRegisterMarkdown();
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(path, expected);
  assert.ok(existsSync(path), "run: npx tsx scripts/canon/report.ts");
  assert.equal(readFileSync(path, "utf8"), expected, "REGISTER.md is stale: run npx tsx scripts/canon/report.ts");
});

test("canon lock: content hash matches tests/fixtures/canon_lock.json", () => {
  const hash = createHash("sha256").update(stableStringify(canonSnapshot())).digest("hex");
  const counts: Record<string, number> = {};
  for (const e of CANON_REGISTER) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const actual = { version: CANON_VERSION, sha256: hash, entries: CANON_REGISTER.length, byStatus: counts };
  const path = join(__dirname, "fixtures", "canon_lock.json");
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(path)) {
    writeFileSync(path, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  const locked = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(actual.version, locked.version, "CANON_VERSION changed: regenerate the lock deliberately");
  assert.deepEqual(actual, locked, "Canon changed without a version bump and a regenerated lock (see lib/canon/index.ts)");
});
