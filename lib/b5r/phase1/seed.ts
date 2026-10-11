/**
 * Turns the two input CSVs into properties and seed evidence. Pure.
 *
 * Nothing official is created here: listing APNs become tier-3 "provisional"
 * rows, the rejected K5 value is recorded as rejected, and every core fact
 * without evidence gets an explicit "missing" row so the register shows it.
 */
import { createHash } from "node:crypto";
import type { Evidence, Property } from "./contracts";

export const PHASE1_RULES_VERSION = "phase1-gate-1.0.0";
/** Fixed namespace for property UUIDs (UUIDv5). Never change it. */
export const PROPERTY_NAMESPACE = "6f1c2d4e-8b3a-5c7d-9e0f-a1b2c3d4e5f6";

export function uuidv5(name: string, namespace = PROPERTY_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

export type Row = Record<string, string>;

const LISTING_SOURCES: Record<string, { id: string; uri: string }> = {
  redfin: { id: "S20", uri: "https://www.redfin.com" },
  zillow: { id: "S21", uri: "https://www.zillow.com" },
  loopnet: { id: "S22", uri: "https://www.loopnet.com" },
  compass: { id: "S23", uri: "https://www.compass.com" },
};

/** "2207 River Blvd, Bakersfield, CA 93305" -> "2207 RIVER BLVD" */
export function streetPart(address: string): string {
  return address.split(",")[0].toUpperCase().replace(/\s+/g, " ").trim();
}

export function buildProperties(pilot: Row[], identity: Row[]): Property[] {
  const byStreet = new Map(pilot.map((p) => [streetPart(p.address), p]));
  if (byStreet.size !== pilot.length) throw new Error("pilot CSV has duplicate street addresses");
  return identity.map((r) => {
    const p = byStreet.get(streetPart(r.address));
    if (!p) throw new Error(`no pilot row for ${r.property_id} ${r.address}`);
    if (p.county !== r.county) throw new Error(`county mismatch for ${r.property_id}`);
    return {
      property_uuid: uuidv5(`aim-b5r-pilot-2026-10:${r.property_id}`),
      lead_id: r.property_id,
      pilot_id: p.pilot_id,
      county: r.county as Property["county"],
      lead_address: r.address,
      advertised_asking_price_usd: p.asking_price_usd,
      advertised_cap_rate_pct: p.broker_cap_rate_pct,
      listing_source_url: p.listing_source_url,
    };
  });
}

const APN_TOKEN = /\b\d[\d-]{6,}\d\b/g;

export function seedEvidence(props: Property[], identity: Row[]): Evidence[] {
  const out: Evidence[] = [];
  const byLead = new Map(identity.map((r) => [r.property_id, r]));
  for (const p of props) {
    const r = byLead.get(p.lead_id)!;
    let n = 0;
    const add = (e: Partial<Evidence> & Pick<Evidence, "field" | "state" | "reason">) =>
      out.push({
        evidence_id: `SEED-${p.lead_id}-${String(++n).padStart(2, "0")}`,
        property_uuid: p.property_uuid,
        lead_id: p.lead_id,
        value: "",
        source_id: "",
        source_uri: "",
        publisher: "",
        tier: 3,
        observed_date: "",
        retrieved_at: r.retrieval_date || "",
        coverage: "",
        snapshot_ref: "",
        reviewer: "",
        recorded_at: "2026-10-09",
        ...e,
      });

    // APN leads from listings: one row per source/value pair mentioned.
    const src = r.secondary_source || "";
    const candidate = (r.secondary_apn_candidate || "").trim();
    const mentioned = src.toLowerCase();
    const sources = Object.keys(LISTING_SOURCES).filter((k) => mentioned.includes(k));
    if (candidate) {
      // A source named next to a different number in the note (e.g. "Zillow shorter 01736010") gets its own row.
      const notes = src.split(";").map((s) => s.trim());
      const extra = notes.flatMap((s) => {
        const nums = s.match(APN_TOKEN) || [];
        const who = Object.keys(LISTING_SOURCES).find((k) => s.toLowerCase().includes(k));
        return nums.filter((v) => v !== candidate && who).map((v) => ({ who: who!, v, note: s }));
      });
      const primary = sources.filter((k) => !extra.some((x) => x.who === k));
      add({
        field: "apn", value: candidate, state: "provisional",
        source_id: primary.map((k) => LISTING_SOURCES[k].id).join(";"),
        source_uri: primary.map((k) => LISTING_SOURCES[k].uri).join(";"),
        publisher: primary.map((k) => k[0].toUpperCase() + k.slice(1)).join("; "),
        reason: `Listing value (${notes[0] || "listing"}); not official. Confirm on the county assessor.`,
      });
      for (const x of extra) {
        add({
          field: "apn", value: x.v, state: "provisional",
          source_id: LISTING_SOURCES[x.who].id, source_uri: LISTING_SOURCES[x.who].uri,
          publisher: x.who[0].toUpperCase() + x.who.slice(1),
          reason: `Listing value (${x.note}); shorter format of the same digits, settle on the assessor.`,
        });
      }
    } else if (/not accepted|suspicious/i.test(src)) {
      add({ field: "apn", state: "missing", source_id: "S20", source_uri: LISTING_SOURCES.redfin.uri, publisher: "Redfin",
        reason: `Listing value rejected and discarded per handoff (${src}).` });
    } else {
      add({ field: "apn", state: "missing", tier: 1, retrieved_at: "", reason: "No APN candidate from any source yet." });
    }

    // Zoning conflicts noted by listings (non-core for Phase 1).
    const zoning = src.match(/zoning\s+(.+)$/i);
    if (zoning) {
      add({ field: "zoning", value: zoning[1].replace(/\s*conflict\s*$/i, "").trim(), state: "conflicting",
        source_id: sources.map((k) => LISTING_SOURCES[k].id).join(";"), publisher: "listings",
        reason: "Listing sources disagree on zoning; Phase 2 must read the official zoning map." });
    }

    // Core facts nobody has evidenced yet.
    for (const field of ["situs_address", "jurisdiction", "geometry_match"] as const) {
      add({
        field, state: "missing", tier: 1, retrieved_at: "",
        reason: field === "jurisdiction"
          ? "Postal city is not jurisdiction evidence; needs an official city-limits / county boundary check."
          : field === "geometry_match"
            ? "Needs the official parcel map for the confirmed APN (screening level; GIS is not a survey)."
            : "Needs the official situs address from the assessor record.",
      });
    }
  }
  return out;
}
