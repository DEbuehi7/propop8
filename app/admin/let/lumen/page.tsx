import type { Metadata } from "next";
import LetNode from "@/components/admin/LetNode";

export const metadata: Metadata = { title: "Lumen Lab · LET Network · Admin · PropOps8", robots: { index: false } };

export default function LumenLab() {
  return (
    <LetNode
      theme="snow"
      kicker="PropOps8 · Admin · LET Network · LET-02"
      name="Lumen Lab"
      subtitle="CL V2 — Snowline Crestline"
      tagline="At Crestline, cold is an advantage. A mountain retreat for resilience, depth and calm — real places, real data, real impact."
      location="Crestline, CA · ~5,000 ft · two steep lots (Crestline / Cedarpines Park, APNs 034205403 & 034205405)"
      seasonRole="Winter · intimacy · depth"
      stats={[["Elevation", "~5,000 ft"], ["Levels", "Two"], ["Program", "Seasonal cabin"], ["Compute node", "No"]]}
      summary="A modest two-level seasonal cabin test-fit, explicitly repositioned away from the earlier 'Lumen compute-lab' program. Not a compute node under the current canon."
      supersedes="The earlier 'Lumen' compute-lab poster remains canonical for concept-to-composition technique, not for this site's current program."
      rows={[
        { role: "Crestline = winter / intimacy / depth", lesson: "Mountain expression comes from slope, compact thermal enclosure, WUI/fire resilience, snow, access, outage mode and protected interior warmth." },
        { role: "Gates: access, septic, lot merge", lesson: "Title/survey/OWTS feasibility precede design spend." },
        { role: "Not a compute node", lesson: "The project demonstrates that brand identity survives when program changes drastically." },
        { role: "AIM intelligent cabin", lesson: "Local-first sensing, water/leak/freeze awareness, power/outage state, one calm AIM wall, manual control." },
        { role: "Material direction", lesson: "WUI-compatible exterior: dark standing-seam metal, fiber cement, galvanized structure, ignition-resistant decks; warm wood/mineral plaster inside." },
      ]}
      gates={[["Access", "unknown"], ["Septic / OWTS", "unknown"], ["Lot merge", "unknown"]]}
      sections={[
        { kind: "tree", title: "The retreat, space by space", sub: "Natural advantages at work — the poster's tree of rooms and outlooks.", trunk: "Natural advantages at work", items: [
          { label: "Winter retreat", body: "The main living level, warm against the snow." },
          { label: "Forest outlook", body: "Long views through the trees from the upper level." },
          { label: "Intelligent living", body: "A calm, local-first AIM layer — one wall, manual control always." },
          { label: "Research & creative work", body: "A quiet work space with daylight and a mountain view." },
          { label: "Deck to the wild", body: "A fire-resistant deck and overlook toward the forest." },
          { label: "Rest & recovery", body: "Protected interior warmth, a quieter environment, deeper rest." },
          { label: "Mountain perspective", body: "Slope and elevation turned into a view." },
        ] },
        { kind: "cards", title: "Natural advantages", sub: "What the mountain gives the building.", items: [
          { label: "Solar gain & daylight", body: "Roof array and glazing oriented to winter sun." },
          { label: "Colder conditions", body: "Stable, cool conditions; thermal moderation through a compact enclosure." },
          { label: "Clean power & resilience", body: "Renewable energy with storage; outage mode as a design condition." },
          { label: "Quieter environment", body: "Low noise and deeper focus." },
          { label: "Resilient by design", body: "Built for seismic, weather and wildfire (WUI) uncertainty." },
          { label: "Backup power & storage", body: "Renewable plus storage, off-grid capable." },
        ] },
        { kind: "facts", title: "Site & building overview", items: [
          ["Location", "Crestline, California"], ["Elevation", "~5,000 ft"], ["Lots", "Two steep lots"],
          ["Site elements", "Main house · deck / overlook · solar array · entry path · snow storage · native landscaping"],
          ["Section idea", "Living above, intelligence within — roof with solar array, living / retreat, work / research space, deck, natural ventilation exhaust, heat exchanger, MEP / storage below"],
        ] },
        { kind: "layers", title: "Details rooted in place", sub: "Construction direction that still carries over to the cabin.", groups: [
          { name: "Wall section", layers: ["Wood siding", "Air gap", "Weather barrier", "Insulation (high R-value)", "Plywood sheathing", "Vapor control layer", "CLT / stud wall", "Interior finish"] },
          { name: "Roof section", layers: ["Solar panel", "Metal roof", "Ice & water shield", "Insulation", "CLT roof deck", "Wood beam", "Air gap", "Interior finish"] },
          { name: "Eave detail", layers: ["Metal flashing", "Ventilation gap", "Wood fascia", "Wood soffit", "Structural beam", "Insulation", "Interior finish"] },
          { name: "Window / sill detail", layers: ["Triple glazing (low-E)", "Thermal break", "Wood sill", "Air seal", "Insulation", "Concrete foundation", "Drainage layer"] },
        ] },
        { kind: "hub", title: "The AIM Intelligent Cabin — four systems, one calm wall", hub: {
          hubLabel: "THE CABIN", ariaLabel: "Lumen's AIM intelligent cabin: four systems connected to one control wall",
          items: [
            { id: "sensing", label: ["Local-First", "Sensing"], body: "Environmental and structural awareness, processed on-site." },
            { id: "water", label: ["Water, Leak &", "Freeze Awareness"], body: "Continuous monitoring for the failure modes that actually threaten a mountain cabin through winter." },
            { id: "power", label: ["Power &", "Outage State"], body: "Grid and backup status, visible at a glance — the cabin's own posture during a mountain outage." },
            { id: "wall", label: ["The AIM", "Wall"], body: "One calm display for the cabin's systems. Manual override always available — nothing automated without a physical way to step in." },
          ] } },
        { kind: "list", title: "Not carried over — superseded by the current board", items: [
          "The AI / compute-lab program and the below-grade compute chamber",
          "Snow-cooling engineered for server thermal loads rather than for the cabin",
          "Any framing of Lumen as a SENTINEL / AIM compute node",
        ] },
      ]}
      poster={{ src: "/let/lumen-labs-poster.webp", label: "Original concept poster — Snowline Crestline", alt: "Snowline Crestline Lumen Labs concept poster: overview, tree of natural advantages, site plan, building section, and wall/roof/eave/window construction details.", width: 1055, height: 1491 }}
      caveat="Drawn from the revised AIM Lumen Labs concept poster (Sep 2026), kept as canonical for concept-to-composition technique and WUI material direction, not for program. The poster's below-grade room is now labeled 'MEP / Storage' rather than a compute chamber, which reinforces the separation. Lumen's current program is the modest two-level seasonal cabin above — not a compute node."
      source="Source: AIM / PropOps8 Canonical Design Manifesto v3.2 (27 Sep 2026), Canon 12."
    />
  );
}
