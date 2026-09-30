import type { Metadata } from "next";
import LabDetail from "@/components/admin/LabDetail";
import ConceptPoster from "@/components/admin/ConceptPoster";
import HubSpokeDiagram from "@/components/admin/HubSpokeDiagram";

export const metadata: Metadata = { title: "Lumen Lab · LVN Network · Admin · PropOps8", robots: { index: false } };

export default function LumenLab() {
  return (
    <LabDetail
      kicker="PropOps8 · Admin · LVN Network · LVN-02"
      name="Lumen Lab"
      subtitle="CL V2 — current authoritative board"
      location="Crestline, CA · two steep lots (Crestline / Cedarpines Park, APNs 034205403 & 034205405)"
      seasonRole="Winter · intimacy · depth"
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
      source="Source: AIM / PropOps8 Canonical Design Manifesto v3.2 (27 Sep 2026), Canon 12."
    >
      <HubSpokeDiagram
        heading="The AIM Intelligent Cabin — four systems, one calm wall"
        hubLabel="THE CABIN"
        ariaLabel="Lumen's AIM intelligent cabin: four systems connected to one control wall"
        items={[
          { id: "sensing", label: ["Local-First", "Sensing"], body: "Environmental and structural awareness, processed on-site." },
          { id: "water", label: ["Water, Leak &", "Freeze Awareness"], body: "Continuous monitoring for the failure modes that actually threaten a mountain cabin through winter." },
          { id: "power", label: ["Power &", "Outage State"], body: "Grid and backup status, visible at a glance — the cabin's own posture during a mountain outage." },
          { id: "wall", label: ["The AIM", "Wall"], body: "One calm display for the cabin's systems. Manual override always available — nothing automated without a physical way to step in." },
        ]}
      />
      <ConceptPoster
        label="Concept poster — technique precedent only, not current program"
        title="Snowline Crestline Lumen Labs"
        tagline="The original 'Lumen compute-lab' poster: a cold-climate AI/compute node built around snow-cooling and a below-grade compute chamber. Per the current board above, Lumen is not a compute node — this stays on file for two things only: composition technique, and construction direction. Both still hold."
        image={{
          src: "/lvn/lumen-labs-poster.webp",
          alt: "Snowline Crestline Lumen Labs concept poster: cold-climate research retreat overview, tree-diagram of natural advantages, site plan, building section, and wall/roof/eave/window construction details.",
          width: 1055,
          height: 1491,
        }}
        blocks={[
          {
            kind: "cards",
            title: "What still carries over to the current cabin program",
            items: [
              { label: "Wall assembly", body: "Wood siding · air gap · weather barrier · high-R insulation · vapor control layer · CLT or stud wall · interior finish." },
              { label: "Roof assembly", body: "Standing-seam metal · ice-and-water shield · insulation · CLT roof deck on wood beams." },
              { label: "Window / sill", body: "Triple glazing, low-E · thermal break · wood sill · air seal · insulation to a concrete foundation with drainage." },
              { label: "Site elements", body: "Main house, a deck/overlook, a solar array, a defined entry path, snow storage, native landscaping." },
            ],
          },
          {
            kind: "list",
            title: "What does NOT carry over — superseded by the current board",
            items: [
              "The AI / compute-lab program and the below-grade \"cognition engine\" compute chamber",
              "Snow-cooling engineered for server thermal loads, rather than for the cabin itself",
              "Any framing of Lumen as a SENTINEL / AIM compute node",
            ],
          },
        ]}
        caveat="Drawn from the revised AIM Lumen Labs compute-node concept poster (Sep 2026), kept per the note above: canonical for concept-to-composition technique and WUI material direction, not for program. The revision actually reinforces that separation — the below-grade room in the building section is now labeled 'MEP / Storage' rather than a compute chamber, and the brand lockup correctly reads 'Smiling Bubbles Inc. (SBI).' Lumen's current program is the modest two-level seasonal cabin described above — not a compute node."
      />
    </LabDetail>
  );
}
