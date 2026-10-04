import type { Metadata } from "next";
import LetNode from "@/components/admin/LetNode";

export const metadata: Metadata = { title: "Eon Lab · LET Network · Admin · PropOps8", robots: { index: false } };

export default function EonLab() {
  return (
    <LetNode
      theme="desert"
      kicker="PropOps8 · Admin · LET Network · LET-01"
      name="Eon Lab"
      subtitle="29! V2 — 29 Palms Eon Labs"
      tagline="Research + field station: an AI node for a hotter tomorrow. Renewable energy, passive design and field-scale compute on a smaller footprint."
      location="Twentynine Palms, CA · 0.26-acre city lot (APN 0590192170000)"
      seasonRole="Spring · experimentation · build"
      stats={[["Elevation", "≈ 2,000 ft"], ["Summer avg high", "103°F"], ["Winter avg low", "40°F"], ["Wind", "10–20 mph"]]}
      summary="A constrained field-station test-fit on a real residential lot, not the earlier campus-scale render: a single-level desert house + lab concept. Campus-scale functions move to a future site."
      supersedes="The earlier ~22,000 SF Desert Brutalist Afrofuturism compound concept is superseded. Its poster imagery remains a visual-language precedent, not a technical substitute for this current board."
      rows={[
        { role: "29! = spring / experimentation / build", lesson: "Desert expression comes from shade, courtyard, solar discipline, thermal mass, night-flush opportunity, water restraint and measured environmental performance." },
        { role: "Gates: zoning, septic, Earn-It", lesson: "No design commitment before the site and business gates clear." },
        { role: "Compute constrained to field-station scale", lesson: "Tech capacity is bounded by real roof/energy/site conditions rather than by a poster image." },
        { role: "Pattern translation", lesson: "Edo/family reference → chevron/diamond → lattice → variable perforation → shade/privacy/dust performance." },
        { role: "AIM field station", lesson: "Local-first, human-gated, no in-unit cameras, manual overrides, measurable environmental and energy variables." },
      ]}
      gates={[["Zoning", "unknown"], ["Septic", "unknown"], ["Earn-It (revenue)", "pending"]]}
      sections={[
        { kind: "facts", title: "Site & building overview", sub: "Poster figures — not survey data for the current lot.", items: [
          ["Location", "Twentynine Palms, CA"], ["Lot size (poster)", "11,236 sq ft (0.28 ac)"], ["Lat / long (poster)", "34.139° N, 116.054° W"],
          ["Elevation", "≈ 2,000 ft"], ["Zoning", "Rural residential (verify)"], ["Program", "AI research + field station"],
          ["Utilities", "Solar + battery (off-grid) · well (if available) · wastewater (OWTS)"], ["Building size", "≈ 3,200 sq ft (modular)"], ["Occupancy", "Research / office / lab"],
        ] },
        { kind: "cards", title: "Construction details", items: [
          { label: "Exterior", body: "Steel + wood canopy · PV shade structure · passive cooling · low-maintenance materials." },
          { label: "Walls", body: "Insulated metal panel · thermal break · airtight assembly · high R-value · durable desert finish." },
          { label: "Interior", body: "Exposed structure · natural light · views to landscape · modular systems · flexible lab / office space." },
        ] },
        { kind: "layers", title: "Wall section detail", groups: [
          { name: "Roof & canopy", layers: ["PV canopy", "Steel beam", "Wood slat shade", "Insulated roof panel", "Air gap"] },
          { name: "Wall & base", layers: ["CLT / steel frame", "Insulation (R-30+)", "Concrete slab", "Thermal break", "Foundation", "Desert grade"] },
        ] },
        { kind: "hub", title: "AI-Driven Resilience Node — six functions around one hub", hub: {
          hubLabel: "EON LABS", ariaLabel: "Eon Labs AI-Driven Resilience Node: six functions connected to one central hub",
          items: [
            { id: "sensor", label: ["Sensor", "Network"], body: "Environment · energy · structural · security." },
            { id: "renewable", label: ["Renewable", "Energy"], body: "Solar · battery · microgrid." },
            { id: "climate", label: ["Climate", "Management"], body: "Passive + active systems." },
            { id: "field", label: ["Field", "Operations"], body: "Drones · robotics · remote monitoring." },
            { id: "data", label: ["Data +", "Compute"], body: "On-site AI processing, model training and storage — field-station scale, per the rule above." },
            { id: "rei", label: ["Real Estate", "Intelligence"], body: "Site analysis, digital twins, BRRRR support." },
          ] } },
        { kind: "cards", title: "The integral design influence of the letter E", items: [
          { label: "E as environment", body: "The east–west oriented E maximizes shade, captures prevailing breezes and creates outdoor rooms that respond to the desert climate." },
          { label: "E as experience", body: "The stepped form creates terraces for work, research and rest — connecting people to the landscape and encouraging collaboration." },
          { label: "E as expansion", body: "The E allows phased growth, with each bar functioning as a modular wing — adaptability and efficiency, with a distinct identity rooted in place." },
        ] },
        { kind: "list", title: "Program fit", items: [
          "1. Research + development — AI, climate and real estate technology",
          "2. Field operations — drone, sensor and robotics testing",
          "3. Data infrastructure — edge compute and secure data storage",
          "4. Renewable energy — solar PV + battery microgrid",
          "5. Water + waste — well (if available) + OWTS",
          "6. Extreme climate design — passive cooling, high thermal mass",
        ] },
        { kind: "cards", title: "Performance features", items: [
          { label: "Solar power", body: "Off-grid capable with battery storage." },
          { label: "Passive cooling", body: "Shading + natural ventilation." },
          { label: "Modular construction", body: "Fast assembly, low impact." },
          { label: "On-site compute", body: "Edge AI processing, secure and resilient." },
        ] },
        { kind: "stages", title: "Scale-up path, if it is ever warranted", items: [
          { stage: "Stage 1", name: "Pilot station", size: "3,200 sq ft", body: "Research + testing. The current single-lot board, gated on zoning, septic and Earn-It revenue." },
          { stage: "Stage 2", name: "Expanded node", size: "10,000+ sq ft", body: "Additional compute + labs, only once Stage 1 is operating and cleared." },
          { stage: "Stage 3", name: "Compute campus", size: "Multi-building", body: "Regional hub (Kern / Fresno) separate from this lot — the geography Transect already scouts." },
        ] },
        { kind: "cards", title: "Interior views", items: [
          { label: "Lab / workspace", body: "AI research and modeling." },
          { label: "Compute room", body: "Edge compute + secure storage." },
          { label: "Collaboration space", body: "Work, meet and create." },
          { label: "Living / rest", body: "Sustainable and comfortable." },
        ] },
      ]}
      poster={{ src: "/let/eon-labs-poster.webp", label: "Original concept poster — 29 Palms Eon Labs", alt: "29 Palms Eon Labs concept poster: desert research field station overview, construction and wall-section details, AI-Driven Resilience Node diagram, program fit, and scale-up path.", width: 1024, height: 1536 }}
      caveat="Drawn from the revised AIM 29 Palms Eon Labs concept poster (Sep 2026). Its site metrics (11,236 sq ft / 0.28 ac) are close to but do not match the current board's 0.26-acre APN figure, so they are shown as poster figures, not survey data. Compute capacity stays governed by the rule already set for this node: bounded by real roof, energy and site conditions. The poster's Program Fit list renumbers oddly (1-2-3 then 2-5-6); the list above uses a clean 1–6."
      source="Source: AIM / PropOps8 Canonical Design Manifesto v3.2 (27 Sep 2026), Canon 12."
    />
  );
}
