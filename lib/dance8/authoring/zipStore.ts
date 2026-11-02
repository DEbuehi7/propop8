// lib/dance8/authoring/zipStore.ts
//
// A plain ZIP writer (and a reader for checking one), so the Kling pack can be
// carried to a phone or another computer as one file without a new
// dependency. Entries are stored, not compressed: the pack is mostly PNG, WAV
// and MP4, which don't shrink. The same entries and date give the same bytes.
// Pure: no files.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path inside the zip, with forward slashes. */
  name: string;
  data: Buffer;
}

/** MS-DOS date and time (local fields of `d`, 2-second steps). */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const MAX32 = 0xffffffff;

/** One ZIP of the entries, stored. Names must be unique, relative and slash-separated. */
export function zipStore(entries: ZipEntry[], when: Date): Buffer {
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.name || e.name.startsWith("/") || e.name.includes("\\") || e.name.split("/").includes("..")) throw new Error(`bad zip path: ${e.name}`);
    if (seen.has(e.name)) throw new Error(`two zip entries named ${e.name}`);
    seen.add(e.name);
  }
  if (entries.length > 0xffff) throw new Error("more than 65,535 files in one zip");
  const { time, date } = dosTime(when);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    if (e.data.length > MAX32 || offset > MAX32) throw new Error("the zip would pass 4 GB; make it with fewer shots (--budget)");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, e.data);
    centrals.push(central, name);
    offset += 30 + name.length + e.data.length;
  }
  const dir = Buffer.concat(centrals);
  if (offset > MAX32) throw new Error("the zip would pass 4 GB; make it with fewer shots (--budget)");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** The entries of a stored ZIP, read from its central directory, with their CRCs checked. */
export function readZip(buf: Buffer): ZipEntry[] {
  const at = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (at < 0) throw new Error("not a zip: no end record");
  const count = buf.readUInt16LE(at + 10);
  let p = buf.readUInt32LE(at + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (method !== 0) throw new Error(`${name}: compressed entries are not read here`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC does not match`);
    out.push({ name, data: Buffer.from(data) });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
