// lib/security/retention.ts
//
// The privacy policy promises that uploaded source files are deleted 30 days
// after upload, and immediately on a refund (lib/legal-content.ts,
// RETENTION_DAYS on /legal). This module decides which stored objects are past
// that window. scripts/security/purgeUploads.ts does the listing and deleting.
// Pure functions only, so the rule is tested without a database.

/** Must equal the window the privacy policy states. */
export const UPLOAD_RETENTION_DAYS = 30;

export interface StoredObject {
  path: string;
  /** ISO timestamp from storage, or null when storage did not report one. */
  createdAt: string | null;
}

export interface PurgePlan {
  expired: StoredObject[];
  /** Objects with no usable timestamp: never deleted automatically, listed for a person to check. */
  undated: StoredObject[];
  kept: number;
}

/** Objects created before `now - days` are expired. Undated objects are never auto-deleted. */
export function planPurge(objects: StoredObject[], now: Date, days = UPLOAD_RETENTION_DAYS): PurgePlan {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const plan: PurgePlan = { expired: [], undated: [], kept: 0 };
  for (const o of objects) {
    const t = o.createdAt ? Date.parse(o.createdAt) : NaN;
    if (Number.isNaN(t)) plan.undated.push(o);
    else if (t < cutoff) plan.expired.push(o);
    else plan.kept++;
  }
  return plan;
}

/** Every object under one intake's folder, for an immediate refund deletion. */
export function intakeObjects(objects: StoredObject[], intakeId: string): StoredObject[] {
  if (!/^[0-9a-f-]{36}$/i.test(intakeId)) throw new Error("intake id must be a UUID");
  return objects.filter((o) => o.path.startsWith(`${intakeId}/`));
}

/** Split into batches for the Storage API's remove call. */
export function batches<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
