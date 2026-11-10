// lib/stuttr/desk/zip.ts
//
// A careful ZIP reader for the Album Desk intake. A Suno "Download All" ZIP
// (or any album ZIP the owner drops in) is read in place: the file is opened
// read-only, never changed or moved. Every entry is checked before a byte is
// written anywhere:
//   - names: no absolute paths, drive letters, backslashes, ".." or empty
//     parts (Zip Slip); names are compared after Unicode NFC and case folding,
//     so "Café.wav" twice (NFC and NFD) or "SONG.wav" and "song.wav" is a
//     collision, not an overwrite;
//   - kinds: symlinks, encrypted entries, ZIP64 archives and methods other
//     than stored or deflate are refused with a reason;
//   - size: a cap on entries, on the total unpacked size and on each entry's
//     unpack ratio (decompression bombs), checked from the central directory
//     before inflating and again while inflating;
//   - content: every entry's CRC-32 is checked after reading it.
// File side: reads with a file handle, entry by entry, so a large ZIP is never
// loaded whole. No dependency beyond node:zlib.

import { closeSync, openSync, readSync, fstatSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { crc32 } from "../../dance8/authoring/zipStore";

export interface ZipLimits {
  maxEntries: number;
  /** Sum of every entry's unpacked size. */
  maxTotalBytes: number;
  /** Unpacked size over packed size, per entry (audio barely compresses; text can, a little). */
  maxRatio: number;
}

/** An album is a few dozen files of up to a few hundred MB; these leave room and stop a bomb. */
export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 2000, maxTotalBytes: 20 * 1024 ** 3, maxRatio: 200 };

export interface ZipEntryInfo {
  /** The name as stored (UTF-8 when flagged, else CP437 read as Latin-1). */
  name: string;
  /** NFC, forward slashes, no leading "./": the name the desk uses. */
  path: string;
  method: number;
  packedBytes: number;
  bytes: number;
  crc: number;
  localOffset: number;
  isDir: boolean;
}

export interface ZipProblem {
  code: "ZIP_UNREADABLE" | "ZIP64_UNSUPPORTED" | "UNSAFE_PATH" | "SYMLINK" | "ENCRYPTED" | "UNSUPPORTED_METHOD" | "NAME_COLLISION" | "TOO_MANY_ENTRIES" | "TOO_LARGE" | "RATIO" | "CRC_MISMATCH";
  entry?: string;
  detail: string;
}

export interface ZipListing {
  entries: ZipEntryInfo[];
  /** Refusals: an archive with any of these is not unpacked at all. */
  problems: ZipProblem[];
}

const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50, SIG_ZIP64_LOC = 0x07064b50;

function readAt(fd: number, pos: number, len: number): Buffer {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, b, got, len - got, pos + got);
    if (n === 0) break;
    got += n;
  }
  return got === len ? b : b.subarray(0, got);
}

/** The checked form of a stored name, or a reason it is unsafe. */
export function safeEntryPath(name: string): { path: string } | { unsafe: string } {
  if (name.length === 0) return { unsafe: "empty name" };
  if (name.includes("\\")) return { unsafe: "backslash in the name" };
  if (name.includes("\0")) return { unsafe: "NUL in the name" };
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return { unsafe: "absolute path" };
  const parts = name.replace(/^(\.\/)+/, "").split("/");
  const isDir = name.endsWith("/");
  const body = isDir ? parts.slice(0, -1) : parts;
  if (body.some((p) => p === "" || p === "." || p === "..")) return { unsafe: "'..', '.' or an empty part in the path" };
  return { path: body.join("/").normalize("NFC") + (isDir ? "/" : "") };
}

/** The key two names collide on: NFC, then case-folded (macOS and Windows disks ignore case). */
export const collisionKey = (path: string) => path.normalize("NFC").toLowerCase();

/** Lists and checks a ZIP's central directory without inflating anything. */
export function listZip(file: string, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipListing {
  const problems: ZipProblem[] = [];
  const entries: ZipEntryInfo[] = [];
  let fd: number;
  try { fd = openSync(file, "r"); } catch (e) { return { entries, problems: [{ code: "ZIP_UNREADABLE", detail: (e as Error).message }] }; }
  try {
    const size = fstatSync(fd).size;
    const tailLen = Math.min(size, 22 + 0xffff);
    const tail = readAt(fd, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
    if (eocd < 0) return { entries, problems: [{ code: "ZIP_UNREADABLE", detail: "no end-of-archive record: not a ZIP, or cut short" }] };
    if (eocd >= 20 && tail.readUInt32LE(eocd - 20) === SIG_ZIP64_LOC) {
      return { entries, problems: [{ code: "ZIP64_UNSUPPORTED", detail: "a ZIP64 archive (over 4 GB or 65,535 files); unzip it yourself and import the folder" }] };
    }
    const count = tail.readUInt16LE(eocd + 10);
    const cenSize = tail.readUInt32LE(eocd + 12);
    const cenOff = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cenOff === 0xffffffff) return { entries, problems: [{ code: "ZIP64_UNSUPPORTED", detail: "ZIP64 fields; unzip it yourself and import the folder" }] };
    if (count > limits.maxEntries) return { entries, problems: [{ code: "TOO_MANY_ENTRIES", detail: `${count} entries; the limit is ${limits.maxEntries}` }] };
    if (cenOff + cenSize > size) return { entries, problems: [{ code: "ZIP_UNREADABLE", detail: "the file list points past the end of the file" }] };
    const cen = readAt(fd, cenOff, cenSize);
    let p = 0;
    let total = 0;
    const seen = new Map<string, string>();
    for (let k = 0; k < count; k++) {
      if (p + 46 > cen.length || cen.readUInt32LE(p) !== SIG_CEN) { problems.push({ code: "ZIP_UNREADABLE", detail: `file list entry ${k + 1} is damaged` }); break; }
      const flags = cen.readUInt16LE(p + 8);
      const method = cen.readUInt16LE(p + 10);
      const crc = cen.readUInt32LE(p + 16);
      const packed = cen.readUInt32LE(p + 20);
      const bytes = cen.readUInt32LE(p + 24);
      const nameLen = cen.readUInt16LE(p + 28), extraLen = cen.readUInt16LE(p + 30), commentLen = cen.readUInt16LE(p + 32);
      const madeBy = cen.readUInt16LE(p + 4) >> 8;
      const extAttr = cen.readUInt32LE(p + 38);
      const localOffset = cen.readUInt32LE(p + 42);
      const raw = cen.subarray(p + 46, p + 46 + nameLen);
      const name = flags & 0x800 ? raw.toString("utf8") : raw.toString("latin1");
      p += 46 + nameLen + extraLen + commentLen;
      if (packed === 0xffffffff || bytes === 0xffffffff || localOffset === 0xffffffff) { problems.push({ code: "ZIP64_UNSUPPORTED", entry: name, detail: "ZIP64 sizes" }); continue; }
      const safe = safeEntryPath(name);
      if ("unsafe" in safe) { problems.push({ code: "UNSAFE_PATH", entry: name, detail: safe.unsafe }); continue; }
      const isDir = safe.path.endsWith("/");
      // Unix mode in the high 16 bits when made on Unix (3) or macOS (19): 0o120000 is a symlink.
      if ((madeBy === 3 || madeBy === 19) && ((extAttr >>> 16) & 0o170000) === 0o120000) { problems.push({ code: "SYMLINK", entry: name, detail: "a symbolic link" }); continue; }
      if (flags & 0x1) { problems.push({ code: "ENCRYPTED", entry: name, detail: "encrypted" }); continue; }
      if (!isDir && method !== 0 && method !== 8) { problems.push({ code: "UNSUPPORTED_METHOD", entry: name, detail: `compression method ${method}` }); continue; }
      if (!isDir && bytes > 0 && packed > 0 && bytes / packed > limits.maxRatio) { problems.push({ code: "RATIO", entry: name, detail: `unpacks ${Math.round(bytes / packed)} times its packed size` }); continue; }
      if (!isDir) {
        const key = collisionKey(safe.path);
        const other = seen.get(key);
        if (other !== undefined) { problems.push({ code: "NAME_COLLISION", entry: name, detail: `same name as ${other} once Unicode and case are ignored` }); continue; }
        seen.set(key, name);
      }
      total += bytes;
      entries.push({ name, path: safe.path, method, packedBytes: packed, bytes, crc, localOffset, isDir });
    }
    if (total > limits.maxTotalBytes) problems.push({ code: "TOO_LARGE", detail: `${(total / 1024 ** 3).toFixed(1)} GB unpacked; the limit is ${(limits.maxTotalBytes / 1024 ** 3).toFixed(0)} GB` });
  } finally {
    closeSync(fd);
  }
  return { entries, problems };
}

/**
 * Reads one entry's bytes and checks its CRC. Throws a ZipProblem-shaped
 * error when the data is damaged or bigger than the directory said.
 */
export function readEntry(file: string, e: ZipEntryInfo): Buffer {
  const fd = openSync(file, "r");
  try {
    const head = readAt(fd, e.localOffset, 30);
    if (head.length < 30 || head.readUInt32LE(0) !== SIG_LOC) throw zipError("ZIP_UNREADABLE", e.name, "local header missing");
    const start = e.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const packed = readAt(fd, start, e.packedBytes);
    if (packed.length !== e.packedBytes) throw zipError("ZIP_UNREADABLE", e.name, "cut short");
    let data: Buffer;
    if (e.method === 0) data = packed;
    else {
      try { data = inflateRawSync(packed, { maxOutputLength: Math.max(e.bytes, 1) }); }
      catch (err) { throw zipError("ZIP_UNREADABLE", e.name, `does not inflate (${(err as Error).message})`); }
    }
    if (data.length !== e.bytes) throw zipError("TOO_LARGE", e.name, `unpacked to ${data.length} bytes, the file list says ${e.bytes}`);
    if (crc32(data) !== e.crc) throw zipError("CRC_MISMATCH", e.name, "the data does not match its checksum (damaged download)");
    return data;
  } finally {
    closeSync(fd);
  }
}

export class ZipEntryError extends Error {
  constructor(public problem: ZipProblem) { super(`${problem.entry ?? "zip"}: ${problem.detail}`); }
}
const zipError = (code: ZipProblem["code"], entry: string, detail: string) => new ZipEntryError({ code, entry, detail });
