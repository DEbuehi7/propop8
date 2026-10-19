// lib/canon/index.ts
//
// AIM canon: the locked doctrine from the AIM-B5R studies, as typed data.
// tests/canon.test.ts pins a hash of everything below. To change canon:
//   1. edit the entry, vocabulary or study record;
//   2. bump CANON_VERSION and add a line to docs/canon/README.md (change log);
//   3. run UPDATE_GOLDEN=1 npm test and commit the new lock with the change.
// A LOCKED entry changes only with the owner's approval.

import { CANON_REGISTER } from "./register";
import { STUDIES } from "./studies";
import * as vocab from "./vocab";

export const CANON_VERSION = "1.2.0";

export { CANON_REGISTER, STUDIES, vocab };
export type { CanonEntry, CanonStatus, CanonDomain, CanonSource, Impl } from "./register";
export type { Study, StudyId } from "./studies";
export * from "./rules";

/** Everything the lock covers, in a stable shape. */
export function canonSnapshot() {
  return { version: CANON_VERSION, studies: STUDIES, register: CANON_REGISTER, vocab };
}

/** JSON with object keys sorted, so the hash depends on content, not key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
