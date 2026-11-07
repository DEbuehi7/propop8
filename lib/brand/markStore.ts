/**
 * lib/brand/markStore.ts
 * ----------------------------------------------------------------------------
 * Where the living 8's state lives while a visitor moves around the site.
 *
 * It is held in memory only. The calculators promise "Nothing is sent to a
 * server or stored", so there is no localStorage, sessionStorage or cookie
 * here: the root layout (and the header in it) stays mounted across
 * navigations, so a module variable is enough, and a reload starts the 8
 * fresh. /audit gets the result the same way it always has, in the query
 * string a calculator's audit link carries (lib/calculatorHandoff.ts); when
 * the visitor reaches /audit from the header instead, the audit page reads
 * that same query from here.
 */

import { useEffect, useSyncExternalStore } from "react";
import { IDLE, sameMark, type MarkState } from "./markState";

/** How long the inputs must sit still before the 8 changes, so typing doesn't flicker it. */
export const SETTLE_MS = 600;

export interface MarkRecord {
  mark: MarkState;
  /** The query string the calculator's audit link carries ("" when there is none). */
  auditQuery: string;
}

const EMPTY: MarkRecord = { mark: IDLE, auditQuery: "" };

let current: MarkRecord = EMPTY;
const listeners = new Set<() => void>();

/** Set the 8. A record equal to the current one changes nothing and notifies no one. */
export function publishMark(mark: MarkState, auditQuery = ""): void {
  if (sameMark(mark, current.mark) && auditQuery === current.auditQuery) return;
  current = { mark, auditQuery };
  for (const l of listeners) l();
}

export function getMarkRecord(): MarkRecord {
  return current;
}

export function subscribeMark(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Back to the plain 8. Tests use it; the site never needs to. */
export function resetMark(): void {
  publishMark(IDLE, "");
}

/** The current record in a component. The server always renders the plain 8. */
export function useMarkRecord(): MarkRecord {
  return useSyncExternalStore(subscribeMark, getMarkRecord, () => EMPTY);
}

/** The query part of an href ("" when it has none). */
export const queryOf = (href: string): string => href.split("?")[1] ?? "";

/**
 * A calculator's side: set the 8 from its result once the inputs settle.
 * `enabled` stays false until the visitor has entered something (or arrived
 * with their numbers in the link), so a calculator's sample values never
 * light the 8.
 */
export function usePublishMark(mark: MarkState, auditQuery: string, enabled: boolean): void {
  const { kind, figure, source } = mark;
  useEffect(() => {
    if (!enabled) return;
    const next: MarkState = { kind, ...(figure !== undefined && { figure }), ...(source !== undefined && { source }) };
    const t = setTimeout(() => publishMark(next, auditQuery), SETTLE_MS);
    return () => clearTimeout(t);
  }, [enabled, kind, figure, source, auditQuery]);
}
