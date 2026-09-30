# Diagnostic Calculators — v2 (CTA fixes + Vendor Money Pit prototype)

Replaces the files from the previous delivery. Same placement as
before:

```
lib/diagnosticCalculators.ts          (modified)
components/DiagnosticCalculatorClient.tsx  (modified)
components/Gauge.tsx                  (new)
components/VendorMoneyPitVisual.tsx   (new)
```

`app/tools/[slug]/page.tsx` is included but **unchanged** from before —
only here so the folder is complete if you're replacing the whole set.

## What changed

1. **Every CTA now pulls from your real `lib/products.ts`** via
   `LINKS`, instead of one hardcoded `/audit` link for all 7. Vendor
   Money Pit → the $99 Vendor Ledger Kit, Automation Graveyard → the
   $49 Automation Kit (this replaces the Code8/Engine8 cross-sell —
   confirmed this was the fix you wanted). The other 5 → the $497
   audit, as the deliberate safe default where no narrower product
   exists yet.

2. **Vendor Money Pit gets the illustrated treatment** — a real SVG
   gauge (`components/Gauge.tsx`, reusable) plus a two-box vendor
   comparison, replacing the plain number for this one widget only.
   The other 6 are untouched, waiting on your read of this one.

## Actually verified this time, not just typed and tested in isolation

Unlike the previous delivery, I got a real browser working in this
session and rendered the actual bundled component — not a mockup, the
literal file you're getting, screenshotted at both desktop and mobile
width, then re-verified after typing real numbers into the actual
input fields (5580 / 5170, matching your test PDF) and confirming the
gauge, the math ($5,170 + $410 = $5,580), and the CTA all updated
correctly together.

One minor cosmetic note from that render: the longer CTA labels
("Get the Vendor Ledger & NOI Audit Kit →") wrap to two lines at
narrow mobile widths. Not broken, just not as clean as a one-liner —
worth a `fontSize` tweak at that breakpoint if it bothers you, not
urgent.

## Note on the reference images

Those 8 PNGs are AI-generated concept art — glossy 3D coins, photoreal
cracked-earth pits, an actual clock face. Gauge.tsx and
VendorMoneyPitVisual.tsx deliberately don't try to reproduce that
imagery pixel-for-pixel; they translate the *information* the mockup
communicates (concentration as an at-a-glance risk gauge, top vendor
vs. everyone else) into clean, real, on-brand UI built from your
actual design tokens. If you want literal illustrated backgrounds
behind these too, that's a different, bigger ask (real static art
assets, not component code) — say so if that's actually what you
want rather than data-driven charts.

## If this reads right

The natural next two, since they'd reuse `Gauge.tsx` directly with
almost no new code: Deadline Graveyard (aging % as a gauge) and Asset
Health Nightmare (health score as a gauge, probably counting down
rather than up). Callback Nightmare and Utility Energy Bleed would
want a different shape — closer to Callback's own "before/after"
work-order cards or Utility's bar-chart-across-buildings, if you want
to go that far rather than keep those two as plain numbers.
