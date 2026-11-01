import React from 'react';

/**
 * Labels for placeholder values on the Plate8 pages (canon GOV-17: concept
 * data is never presented as live; mock values carry MOCK, SYNTHETIC or
 * ILLUSTRATIVE). The word comes from the canon's data-status vocabulary.
 */
export const MOCK_LABEL = 'MOCK' as const;

/** A small inline tag beside a placeholder value or heading. */
export function MockTag() {
  return (
    <span
      className="ml-2 inline-block align-middle rounded border border-amber-400/60 px-1.5 py-px text-[10px] font-semibold tracking-wider text-amber-300"
      title="Placeholder value, not live data"
    >
      {MOCK_LABEL}
    </span>
  );
}

/** A banner for a page whose content is all placeholder. */
export function MockNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="rounded-md border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      <span className="mr-2 font-semibold tracking-wider text-amber-300">{MOCK_LABEL} DATA</span>
      {children}
    </div>
  );
}
