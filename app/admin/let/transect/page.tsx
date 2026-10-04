import type { Metadata } from "next";
import LetNode from "@/components/admin/LetNode";

export const metadata: Metadata = { title: "Transect · LET Network · Admin · PropOps8", robots: { index: false } };

/* LET-03. A circuit, not a site. Name confirmed 28 Sep 2026. */
export default function TransectNode() {
  return (
    <LetNode
      theme="circuit"
      kicker="PropOps8 · Admin · LET Network · LET-03"
      name="Transect"
      subtitle="AIM live-work node // digital nomad"
      tagline="Work anywhere. Inspect anything. Manage everything. Build a brighter tomorrow — a California circuit for real estate exploration, operations and freedom."
      location="No fixed address — a seasonal circuit across Crestline, Twentynine Palms, and Kern / Fresno Counties"
      seasonRole="Year-round · scouting · in transit"
      stats={[["Stops", "3"], ["Summer base", "Crestline"], ["Winter base", "Twentynine Palms"], ["Scouting", "Kern / Fresno"]]}
      summary="The third leg of the network isn't a building, it's a rotation: summers based at Crestline, winters at Twentynine Palms, and Airbnb stretches in between spent scouting BRRRR / AIM-B5R land across Kern and Fresno Counties. A transect is a real land-surveying term — a path sampled at intervals to read a gradient of conditions across terrain. That's what this circuit is: the line the network walks to read land between the two fixed nodes."
      rows={[
        { role: "Circuit = the node itself", lesson: "No standalone structure to design or permit. The \"site\" is Eon and Lumen's existing footprint, plus wherever the current Airbnb is." },
        { role: "Kern / Fresno land scouting", lesson: "Matches the primary target markets already set for the BRRRR / AIM-B5R track (secondary: San Bernardino County, Twentynine Palms)." },
        { role: "Gate discipline applies here too", lesson: "No design or acquisition commitment before the site and business gates clear — the same Canon 12 rule that governs Eon and Lumen." },
      ]}
      gates={[["Circuit defined", "open"], ["BRRRR / AIM-B5R site (Kern/Fresno)", "pending"]]}
      sections={[
        { kind: "cards", title: "The Transect lifestyle", sub: "Freedom with a purpose.", items: [
          { label: "Travel", body: "Light, smart, efficient — the kit fits in one bag." },
          { label: "Work", body: "Anywhere, productively — Crestline in summer, Twentynine Palms in winter, Airbnb in between." },
          { label: "Explore", body: "New places, new opportunities — Kern and Fresno land scouting." },
          { label: "Belong", body: "A focused community with a shared mission." },
        ] },
        { kind: "cards", title: "The spine — nine verbs", sub: "What the circuit does, in order.", items: [
          { label: "Travel · Connect", body: "Move light; stay on more than one network." },
          { label: "Collaborate · Create", body: "Work with people and ideas wherever the circuit stops." },
          { label: "Research · Manage", body: "Read the land; keep operations running remotely." },
          { label: "Acquire · Operate", body: "Evaluate and, only once gates clear, act on opportunities." },
          { label: "Sell · Explore", body: "Position and dispose of assets; then keep exploring." },
        ] },
        { kind: "matrix", title: "Destination gear matrix", sub: "Right gear, greater impact.", columns: ["Desert (Eon Labs)", "Mountain (Lumen Labs)", "Kern-Fresno (Scouting)"], rows: [ { label: "Laptop / tablet", marks: [true, true, true] }, { label: "Mobile hotspot", marks: [true, true, true] }, { label: "Camera / drone", marks: [true, true, true] }, { label: "Solar power / power bank", marks: [true, true, true] }, { label: "Field tools (meas / inspect)", marks: [true, true, true] }, { label: "Weather gear", marks: [true, true, false] }, { label: "Cold climate gear", marks: [false, true, false] }, { label: "Heat / sun protection", marks: [true, false, true] }, { label: "Footwear (hiking / field)", marks: [true, true, true] }, { label: "Clothing layers", marks: [true, true, true] }, { label: "Water system", marks: [true, true, true] }, { label: "Backpack / case", marks: [true, true, true] }, { label: "First aid / health", marks: [true, true, true] }, { label: "Travel documents / IDs", marks: [true, true, true] }, { label: "Local SIM / eSIM", marks: [true, true, true] }, { label: "Vehicle / 4x4 ready", marks: [true, true, true] }, { label: "Rope / safety gear", marks: [true, true, false] }, { label: "Snow chains / ice gear", marks: [false, true, false] },] },
        { kind: "cards", title: "Essential gear — the operator kit", items: [
          { label: "Laptop + tablet", body: "Work. Analyze. Communicate." },
          { label: "Drone + camera", body: "Inspect. Document. Map. Monitor." },
          { label: "Field kit", body: "Measure. Assess. Verify." },
          { label: "Travel pack", body: "Carry your office. Stay ready." },
        ] },
        { kind: "cards", title: "Use cases", sub: "One system, many possibilities.", items: [
          { label: "Acquisition", body: "Find and evaluate opportunities. Meet brokers and owners." },
          { label: "Inspections", body: "Document conditions, verify scope, create project data." },
          { label: "Maintenance", body: "Oversee repairs, coordinate vendors, track progress." },
          { label: "Management", body: "Monitor operations, tenant communication, performance tracking." },
          { label: "Sales & disposition", body: "Position assets, coordinate showings, close remotely." },
        ] },
        { kind: "list", title: "Smart travel principles", sub: "Lighter gear, higher performance.", items: [
          "Travel light — essentials only.", "Durable gear, built for the field.", "Always connected — multiple options.", "Independent power — solar + battery.",
          "Local intelligence — data-driven.", "Health & safety — be prepared.", "Protect data — back up everything.", "Leave no trace — respect every place.",
        ] },
        { kind: "route", title: "The California Circuit", sub: "Eon ↔ Lumen + Kern / Fresno scouting.", stops: [
          { name: "Crestline · Lumen Labs", tag: "Summer base", role: "Mountain research and retreat." },
          { name: "Kern / Fresno", tag: "Between stops", role: "Land scouting — BRRRR opportunities." },
          { name: "Twentynine Palms · Eon Labs", tag: "Winter base", role: "Desert inspections, scan and analyze." },
        ] },
      ]}
      poster={{ src: "/let/transect-poster.webp", label: "Original concept poster — AIM Transect", alt: "AIM Transect digital nomad node concept poster: lifestyle, destination gear matrix, essential gear, use cases, smart travel principles, and the California Circuit map.", width: 1024, height: 1536 }}
      caveat="Drawn from the revised AIM Transect concept poster (Sep 2026). The poster tags Lumen Labs 'Compute · Research · Optimize' in its banner and map; that conflicts with the current board (Lumen is not a compute node), so this page uses the board's wording. This is a lifestyle and field-kit reference, not a procurement list or a Canon 12 commitment — nothing here creates a site, a structure, or a gate."
      source="Circuit as described 27–28 Sep 2026; target markets per the BRRRR/SENTINEL track. Name confirmed 28 Sep 2026."
    />
  );
}
