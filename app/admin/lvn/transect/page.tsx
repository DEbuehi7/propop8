import type { Metadata } from "next";
import LabDetail from "@/components/admin/LabDetail";
import ConceptPoster from "@/components/admin/ConceptPoster";

export const metadata: Metadata = { title: "Transect · LVN Network · Admin · PropOps8", robots: { index: false } };

/* LVN-03. Name confirmed 28 Sep 2026 (was "Isotherm" in the first draft —
   see chat). Everything here is drawn from what's already stated about the
   BRRRR/AIM-B5R target markets and the seasonal circuit; nothing invented
   beyond that. Worth folding into the Canon 12 pack at the next canonical-
   lock revision (Canon 15). */
export default function TransectNode() {
  return (
    <LabDetail
      kicker="PropOps8 · Admin · LVN Network · LVN-03"
      name="Transect"
      subtitle="Digital Nomad node — a circuit, not a site"
      location="No fixed address — a seasonal circuit across Crestline, Twentynine Palms, and Kern / Fresno Counties"
      seasonRole="Year-round · scouting · in transit"
      summary="The third leg of the network isn't a building, it's a rotation: summers based at Crestline, winters at Twentynine Palms, and Airbnb stretches in between spent scouting BRRRR / AIM-B5R land across Kern and Fresno Counties. A transect is a real land-surveying term — a path sampled at intervals to read a gradient of conditions across terrain. That's what this circuit is: not a residence, but the line the network walks to read land, using the ground between the two fixed nodes as the sampling line."
      rows={[
        { role: "Circuit = the node itself", lesson: "No standalone structure to design or permit. The \"site\" is Eon and Lumen's existing footprint, plus wherever the current Airbnb is." },
        { role: "Kern / Fresno land scouting", lesson: "Matches the primary target markets already set for the BRRRR / AIM-B5R track (secondary: San Bernardino County, Twentynine Palms)." },
        { role: "Gate discipline applies here too", lesson: "No design or acquisition commitment before the site and business gates clear — the same Canon 12 rule that governs Eon and Lumen." },
      ]}
      gates={[["Circuit defined", "open"], ["BRRRR / AIM-B5R site (Kern/Fresno)", "pending"]]}
      source="Circuit as described 27–28 Sep 2026; target markets per the BRRRR/SENTINEL track. Name confirmed 28 Sep 2026 — worth folding into the Canon 12 pack at the next canonical-lock revision."
    >
      <ConceptPoster
        label="Field kit & operating principles — illustrative, not a procurement list"
        title="AIM Transect — Digital Nomad Node"
        tagline="Work anywhere. Inspect anything. Manage everything. The circuit isn't a building, but it does run on something: the lifestyle pillars, the gear, and the use cases behind the Crestline/Twentynine Palms rotation and the Kern/Fresno scouting work."
        image={{
          src: "/lvn/transect-poster.webp",
          alt: "AIM Transect digital nomad node concept poster: the Transect lifestyle, a destination gear matrix for Eon Labs, Lumen Labs and Kern/Fresno scouting, use cases, smart travel principles, and the California Circuit map.",
          width: 1024,
          height: 1536,
        }}
        blocks={[
          {
            kind: "cards",
            title: "The Transect lifestyle",
            items: [
              { label: "Travel", body: "Light and efficient — the circuit only works if the kit fits in one bag." },
              { label: "Work", body: "Anywhere, productively — Crestline in summer, Twentynine Palms in winter, Airbnb in between." },
              { label: "Explore", body: "New markets, new perspectives — Kern and Fresno land scouting for BRRRR / AIM-B5R." },
              { label: "Belong", body: "One mission across Eon, Lumen, and every stop the transect samples." },
            ],
          },
          {
            kind: "matrix",
            title: "Destination gear matrix",
            columns: ["Desert (Eon Labs)", "Mountain (Lumen Labs)", "Kern-Fresno (Scouting)"],
            rows: [
              { label: "Laptop / tablet", marks: [true, true, true] },
              { label: "Mobile hotspot", marks: [true, true, true] },
              { label: "Camera / drone", marks: [true, true, true] },
              { label: "Solar power / power bank", marks: [true, true, true] },
              { label: "Field tools (meas / inspect)", marks: [true, true, true] },
              { label: "Weather gear", marks: [true, true, false] },
              { label: "Cold climate gear", marks: [false, true, false] },
              { label: "Heat / sun protection", marks: [true, false, true] },
              { label: "Footwear (hiking / field)", marks: [true, true, true] },
              { label: "Clothing layers", marks: [true, true, true] },
              { label: "Water system", marks: [true, true, true] },
              { label: "Backpack / case", marks: [true, true, true] },
              { label: "First aid / health", marks: [true, true, true] },
              { label: "Travel documents / IDs", marks: [true, true, true] },
              { label: "Local SIM / eSIM", marks: [true, true, true] },
              { label: "Vehicle / 4x4 ready", marks: [true, true, true] },
              { label: "Rope / safety gear", marks: [true, true, false] },
              { label: "Snow chains / ice gear", marks: [false, true, false] },
            ],
          },
          {
            kind: "cards",
            title: "Essential gear — the operator kit",
            items: [
              { label: "Laptop + tablet", body: "Work. Analyze. Communicate." },
              { label: "Drone + camera", body: "Inspect. Document. Map. Monitor." },
              { label: "Field kit", body: "Measure. Assess. Verify." },
              { label: "Travel pack", body: "Carry your office. Stay ready." },
            ],
          },
          {
            kind: "cards",
            title: "Use cases the circuit exists to serve",
            items: [
              { label: "Acquisition", body: "Find and evaluate opportunities. Meet brokers and owners." },
              { label: "Inspections", body: "Document conditions, verify scope, create project data — how Eon and Lumen both started." },
              { label: "Maintenance", body: "Oversee repairs, coordinate vendors, track progress remotely." },
              { label: "Management", body: "Monitor operations, tenant communication, performance tracking." },
              { label: "Sales & disposition", body: "Position assets, coordinate showings, close remotely." },
            ],
          },
          {
            kind: "list",
            title: "Smart travel principles",
            items: [
              "Travel light — essentials only, one bag.",
              "Durable gear, built for the field.",
              "Always connected — more than one network option.",
              "Independent power — solar plus battery.",
              "Local intelligence — eSIM / local networks at each stop.",
              "Health & safety — be prepared, not just equipped.",
              "Protect data — back up before you move on.",
              "Leave no trace — respect every place the circuit passes through.",
            ],
          },
          {
            kind: "list",
            title: "The California Circuit — the map behind the rotation",
            items: [
              "Crestline · Lumen Labs — mountain research, cold-climate testing and retreat, worked in summer.",
              "Kern / Fresno — land scouting for BRRRR / AIM-B5R opportunities, worked year-round in the Airbnb stretches between the two fixed nodes.",
              "Twentynine Palms · Eon Labs — desert inspections, scan and analyze, worked in winter.",
            ],
          },
        ]}
        caveat="Drawn from the revised AIM Transect concept poster (Sep 2026), which replaced an earlier inaccurate global-reach world map with an accurate three-stop California map, and reworked the gear matrix around the network's three real places instead of generic destination archetypes — both reproduced above. One open issue on the poster art itself: its top banner and its California Circuit map both tag Lumen Labs 'Compute · Research · Optimize' / 'Compute & Optimize.' That conflicts with Lumen's own current-board framing (not a compute node) elsewhere in this network — likely a leftover from the earlier Lumen compute-lab concept, worth re-rendering with different wording next time. The California Circuit list above deliberately doesn't repeat that framing. Otherwise this is a lifestyle and field-kit reference, not a procurement list or a Canon 12 commitment — nothing here creates a site, a structure, or a gate; the circuit stays exactly what the board above says it is."
      />
    </LabDetail>
  );
}
