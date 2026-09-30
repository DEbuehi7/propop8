import type { Metadata } from "next";
import LabDetail from "@/components/admin/LabDetail";
import ConceptPoster from "@/components/admin/ConceptPoster";
import HubSpokeDiagram from "@/components/admin/HubSpokeDiagram";

export const metadata: Metadata = { title: "Eon Lab · LVN Network · Admin · PropOps8", robots: { index: false } };

export default function EonLab() {
  return (
    <LabDetail
      kicker="PropOps8 · Admin · LVN Network · LVN-01"
      name="Eon Lab"
      subtitle="29! V2 — current authoritative board"
      location="Twentynine Palms, CA · 0.26-acre city lot (APN 0590192170000)"
      seasonRole="Spring · experimentation · build"
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
      source="Source: AIM / PropOps8 Canonical Design Manifesto v3.2 (27 Sep 2026), Canon 12."
    >
      <ConceptPoster
        label="Concept poster — vision precedent, not current board"
        title="29 Palms Eon Labs"
        tagline="A desert-sensitive field station for a more resilient tomorrow — the long-horizon version of this node. The current board above (a single-level house + lab on the real 0.26-acre lot) is what's actually gated; this is the direction it could grow toward if Earn-It revenue and the zoning/septic gates ever clear."
        image={{
          src: "/lvn/eon-labs-poster.webp",
          alt: "29 Palms Eon Labs concept poster: desert research field station overview, construction and wall-section details, the six-part AI-Driven Resilience Node diagram, program fit, and scale-up path.",
          width: 1024,
          height: 1536,
        }}
        blocks={[
          {
            kind: "list",
            title: "What the node is meant to provide, eventually",
            items: [
              "Backup computing, sized to the roof and the panel — not the other way around",
              "Thermal-efficiency research: passive cooling and thermal mass, tested in place",
              "Environmental sensing — climate and site data collected over seasons",
              "Water capture, appropriate to a desert lot",
              "A remote creative retreat function alongside the field-station work",
              "Seasonal data feeding back into the wider AIM / SENTINEL stack",
            ],
          },
          {
            kind: "custom",
            title: "AI-Driven Resilience Node — six functions around one hub",
            render: (
              <HubSpokeDiagram
                hubLabel="EON LABS"
                ariaLabel="Eon Labs AI-Driven Resilience Node: six functions connected to one central hub"
                items={[
                  { id: "sensor", label: ["Sensor", "Network"], body: "Environment · energy · structural · security." },
                  { id: "renewable", label: ["Renewable", "Energy"], body: "Solar · battery · microgrid." },
                  { id: "climate", label: ["Climate", "Management"], body: "Passive + active systems." },
                  { id: "field", label: ["Field", "Operations"], body: "Drones · robotics · remote monitoring." },
                  { id: "data", label: ["Data +", "Compute"], body: "On-site AI processing, model training and storage — field-station scale, per the rule below." },
                  { id: "rei", label: ["Real Estate", "Intelligence"], body: "Site analysis, digital twins, BRRRR support." },
                ]}
              />
            ),
          },
          {
            kind: "cards",
            title: "Design language carried over from the poster",
            items: [
              { label: "Site design simplicity", body: "One clear circulation spine; distinct access and gathering zones." },
              { label: "Plan modularity", body: "A repeatable unit, not a one-off, so the pattern can scale if the gates clear." },
              { label: "Brand-to-plan continuity", body: "Same chevron/lattice language already set for Eon's shade and privacy performance." },
            ],
          },
          {
            kind: "steps",
            title: "Scale-up path, if it's ever warranted",
            items: [
              "Stage 1 — pilot / field station: the current single-lot board, gated on zoning, septic and Earn-It revenue.",
              "Stage 2 — expanded node: additional field-station capacity and compute, only once Stage 1 is operating and cleared.",
              "Stage 3 — a future multi-building regional hub in Kern/Fresno, separate from this lot — the same geography Transect's circuit already scouts for BRRRR / AIM-B5R, if the program ever justifies it.",
            ],
          },
        ]}
        caveat="Drawn from the revised AIM 29 Palms Eon Labs concept poster (Sep 2026), which fixed the earlier version's illegible captions and duplicated diagram labels. Its site metrics are now far closer to reality — 11,236 sq ft / 0.28 ac and real Twentynine Palms coordinates, versus the current board's 0.26-acre APN figure above — but still don't match exactly, so they're described here rather than asserted as this lot's survey data. Compute capacity stays governed by the rule already set for this node: bounded by real roof, energy and site conditions, not by a poster image. Two small copy-editing glitches remain on the poster art itself (the Program Fit list renumbers 1-2-3 then 2-5-6, and one caption reads 'a distinctly identity' instead of 'a distinct identity') — cosmetic, worth a touch-up whenever it's next regenerated, not blocking anything here."
      />
    </LabDetail>
  );
}
