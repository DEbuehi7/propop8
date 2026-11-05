# Infographics Page

New route: /infographics — verified rendering correctly in an actual
browser before delivery (screenshots checked, both the wide 16:9-ish
ones and the tall portrait ones).

## Placement

    app/infographics/page.tsx
    public/infographics/*.webp   (all 5, already optimized)

## Sizes

| File | Before | After |
|---|---|---|
| infographic-ugly8-propops8-flow.webp | 1.6MB | 173KB |
| infographic-spatial-intelligence.webp | 1.7MB | 204KB |
| infographic-building-performance.webp | 2.2MB | 298KB |
| infographic-performance-index.webp | 2.4MB | 439KB |
| infographic-noi-bleed.webp | 2.2MB | 360KB |

~10MB total -> ~1.5MB, text legibility checked at this compression
(the densest one, the building-performance scorecard, was the real
test -- small numbers still read cleanly).

## Not done yet, needs a decision

No link to this page exists anywhere on the site yet -- neither in the
homepage nor the nav. Two ways to do that, pick one:

1. Add "Infographics" to the main nav (next to Calculator/Ingest/Audit)
   -- but that nav lives in app/layout.tsx, which I still don't have.
2. A single teaser card near the homepage's close section, linking here
   -- I can add this to page.tsx directly once you confirm you want it.

Homepage is deliberately untouched by this delivery either way -- five
dense infographics dropped inline would compete with the founder strip
and segment cards rather than add to them.
