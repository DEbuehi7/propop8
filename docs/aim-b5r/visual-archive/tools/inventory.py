"""AIM-B5R visual archive inventory. Data only + register writers.

Every description below says only what the image visibly shows. Flags record
things that must be fixed or labelled before external use.
"""
import csv, hashlib, json, os, struct, sys

UPLOADS = sys.argv[1]
OUT = sys.argv[2]

# (upload id, received, concept, cross tags, title, what it shows, evidence/tech state, flags)
IMAGES = [
    # 2026-10-09 19:14 batch
    ("2d232e80", "2026-10-09", "ACQ-01", "", "Fresno County GIS portal screenshot A",
     "Phone screenshot (12:35) of gisportal.co.fresno.ca.us web map: aerial basemap, red road lines, pink zones.",
     "EVIDENCE_SCREENSHOT", "No parcel selected; layer names and legend not visible; capture date not on image"),
    ("5f9fba37", "2026-10-09", "ACQ-01", "", "Fresno County GIS portal screenshot B",
     "Phone screenshot (12:34) of the same portal at a different extent: pink zones along a road corridor.",
     "EVIDENCE_SCREENSHOT", "No parcel selected; layer names and legend not visible; capture date not on image"),
    ("85aedaee", "2026-10-09", "ACQ-01", "", "Fresno County GIS portal screenshot C",
     "Phone screenshot (12:34) of the portal with purple and green boundary lines (likely city limit / sphere of influence) and pink zones.",
     "EVIDENCE_SCREENSHOT", "Boundary meaning not labelled on image; confirm layer names before use"),
    ("5c9e4c2a", "2026-10-09", "DES-03", "EDO-01", "EDO triadic pavilion - kit of assembly",
     "White board: pavilion plan, exploded parts legend, connection details and assembly sequence.",
     "CONCEPT", "Dimensions and loads illustrative; structural review required"),
    ("f4a833f9", "2026-10-09", "DES-03", "", "EDO triadic pavilion - desert render",
     "Tensile perforated canopy on triadic masts over seating in a Joshua-tree desert.",
     "CONCEPT", ""),
    ("83549df9", "2026-10-09", "DES-03", "", "EDO triadic pavilion - open/closed states board",
     "Day (open) and night (closed) states, plan, sections, assembly icons and performance callouts.",
     "CONCEPT", "Performance callouts (shade %, cooling, wind retraction) are design goals, not tested"),
    ("30a87a8e", "2026-10-09", "EDO-01", "", "AIM EDO triadic genome - pattern families board A",
     "Dark board: triadic primitive, 2D geometric variations, 3D structures, pattern families, applications strip.",
     "CONCEPT", ""),
    ("d94eb305", "2026-10-09", "EDO-01", "", "AIM EDO triadic genome - pattern library board B",
     "Dark board: geometric library, dimensional exploration, pattern system, colour system, applications strip.",
     "CONCEPT", ""),
    ("950b24ed", "2026-10-09", "EDO-01", "BRD-01", "AIM EDO triadic genome - master board",
     "Dark board: the primitive, 2D geometries, 3D structures, 4D adaptive systems, pattern families, colour palettes, applications.",
     "CONCEPT", ""),
    # 2026-10-09 19:16 batch
    ("ad70a5f9", "2026-10-09", "BRD-01", "EDO-02", "AIM triadic plaza sculpture",
     "Large white/black/brown triadic sculpture in a plaza with AIM signage and a glass building.",
     "CONCEPT", ""),
    ("1cb08ab0", "2026-10-09", "EDO-01", "", "Triadic furniture - side table and lamp",
     "Side table and globe lamp on three-leg triadic bases (white, black, walnut).",
     "CONCEPT", ""),
    ("7a297e2b", "2026-10-09", "SYS-01", "WEAR-01", "Humanoid robot with triadic harness",
     "White/black humanoid robot with a triadic shoulder harness; 120-degree detail views.",
     "CONCEPT", "Robotics concept, not an installed system"),
    ("60ceabce", "2026-10-09", "WEAR-01", "", "Seamless Threads - triadic harness apparel",
     "Man and woman in white athletic wear with triadic harness straps; geometry-to-fashion detail panel.",
     "CONCEPT", ""),
    ("a2c546a8", "2026-10-09", "SYS-01", "", "AIM drone dock - land, charge, deploy",
     "Tripod triadic drone dock with quadcopter in desert; detail panels.",
     "CONCEPT", "Belongs to EDO Droid / drone track; not in Phase 1 scope"),
    ("c4e144dc", "2026-10-09", "SYS-01", "", "AIM Robotics tripod rover - inspect, move, maintain",
     "Three-leg rover with sensor head; 120-degree plan and detail panels.",
     "CONCEPT", "Belongs to EDO Droid track; not in Phase 1 scope"),
    ("5a5281c9", "2026-10-09", "EDO-02", "BRD-01", "AIM-B5R lobby wayfinding kiosk",
     "Triadic kiosk with screens in a lobby; AIM-B5R mark on the mast.",
     "CONCEPT", "Media surface concept; egress/accessibility review before use"),
    ("a3c1e801", "2026-10-09", "DES-03", "", "Triadic canopy lounge - desert",
     "Large triadic arch with fabric canopy over lounge seating at sunset.",
     "CONCEPT", ""),
    ("15a1ad15", "2026-10-09", "BRD-01", "EDO-01", "Triadic primitive - plan and perspective (MASTER)",
     "White background: three arms at 120 degrees in plan and perspective (white, black, brown).",
     "CONCEPT", "Master reference for generated visuals"),
    ("8a8eca4e", "2026-10-09", "EDO-01", "BRD-01", "Triadic primitive - rope (flat)",
     "Three ropes (white, black, brown) joined at 120 degrees, lying flat.",
     "CONCEPT", ""),
    ("8e6a61e0", "2026-10-09", "EDO-01", "BRD-01", "Triadic primitive - rope (standing)",
     "Three ropes joined in a standing tripod arch.",
     "CONCEPT", ""),
    ("caeeb4fd", "2026-10-09", "WEAR-01", "", "Seamless Threads - pets, inclusive fits, custom bodies",
     "Poster: dog vests, inclusive body types, wheelchair user, surface tech, closures, service/medical uses.",
     "CONCEPT", "Medical/health claims (vital signs, post-surgery, therapeutic) need regulatory review before publishing"),
    ("6ad172ce", "2026-10-09", "WEAR-01", "SYS-01", "Seamless Threads - cybernetic droid augmentation",
     "Poster: droid/human platform views, surface layers, functional zones, modular components, repair cycle.",
     "CONCEPT", ""),
    ("072854c1", "2026-10-09", "WEAR-01", "MED-01", "Stuttr - Seamless Threads performance system",
     "Poster: Stuttr lead in lit coat with two performers; performance, travel and studio modes.",
     "CONCEPT", "Also a Dance8 wardrobe reference"),
    ("5c931e2c", "2026-10-09", "WEAR-01", "", "Seamless Threads - women's adaptive line",
     "Poster: desert, urban, mountain, performance modes; close-ups, accessories, body mapping.",
     "CONCEPT", ""),
    ("661ef240", "2026-10-09", "WEAR-01", "", "Seamless Threads - men's adaptive line",
     "Poster: desert, urban executive, mountain, performance modes; material intelligence, inclusive fit.",
     "CONCEPT", ""),
    ("f4d2c3d2", "2026-10-09", "WEAR-01", "", "Seamless Threads - fabrication engine",
     "Poster: multi-material printing cell, process steps, lattice, repairable modules, cross-section.",
     "CONCEPT", "Materials (aerogel, phase-change gel, graphene) are aspirational, not specified"),
    ("d19e172c", "2026-10-09", "WEAR-01", "", "Body-to-surface workflow",
     "Poster: scan, mesh, pressure/thermal maps, genome interpretation, final suit; climate-tuned fits.",
     "CONCEPT", "Shows example heights/weights; body data needs consent and privacy rules if ever real"),
    ("503e32c1", "2026-10-09", "WEAR-01", "", "Seamless Threads - platform overview",
     "Poster: body capture, genome engine, materials, fabrication, climate modes, applications, strategic value.",
     "CONCEPT", ""),
    ("55e29b4e", "2026-10-09", "FUT-01", "EDO-01", "EDO 3's album screenshot (species / habitat / benefits)",
     "Phone screenshot of a 13-item photo album scrolled through EDO 3's posters.",
     "CONCEPT", "Derivative: screenshot of posters indexed separately"),
    # 2026-10-09 19:17 batch
    ("debc82ae", "2026-10-09", "FUT-01", "EDO-01", "EDO 3's album screenshot (genome / typologies / species)",
     "Phone screenshot of the same album scrolled through the genome, typologies and species posters.",
     "CONCEPT", "Derivative: screenshot of posters indexed separately"),
    ("9a9846f5", "2026-10-09", "LET-01", "OPS-01", "L.E.T. Airbnb + operations workflow",
     "Poster: 9-step operations cycle, guest journey, turnover, maintenance, portfolio dashboard, site filters, checklist.",
     "CONCEPT", "ILLUSTRATIVE NUMBERS (12 properties, 94% occupancy, $48K/mo, 2.4x CoC, +18%, ADR table); Airbnb trademark shown"),
    ("f675e301", "2026-10-09", "LET-01", "SYS-01", "Mobile Field Node - Kern County / Transect",
     "Truck, expandable trailer with sleep/kitchen/bath/command modules, drone pad, Kern route map.",
     "CONCEPT", "Step bar has two '4' steps and repeated text under Analyze/Operate"),
    ("17889625", "2026-10-09", "LET-01", "", "Valley Live-Work Node - Fresno",
     "Single-family pool home with outdoor kitchen; 13 room vignettes; system icons.",
     "CONCEPT", "Single-family STR concept, not the 10+ unit pilot; STR rules need checking per city"),
    ("7df10d8f", "2026-10-09", "LET-01", "", "Lumen Snow Node - Crestline",
     "Two-storey mountain home cutaway in snow; room vignettes; envelope callouts.",
     "CONCEPT", "Envelope specs (aerogel, triple glazing) are design intent"),
    ("538f966f", "2026-10-09", "LET-01", "DES-03", "Eon Desert Node - Twentynine Palms",
     "Desert home at dusk with rooftop triadic canopy, Stuttr media wall, self check-in, drone pad, EV charger.",
     "CONCEPT", ""),
    ("59c935b0", "2026-10-09", "LET-01", "OPS-01;BRD-01", "L.E.T. homes + workflow system",
     "Poster: brand DNA legend, four site contexts, home types, workflow stack, systems, accessibility, wayfinding.",
     "CONCEPT", "ILLUSTRATIVE NUMBERS on dashboard (12 properties, 94%, $48K, 2.4x)"),
    ("e1fd6298", "2026-10-09", "FUT-01", "EDO-01", "EDO 3's - from molecule to world",
     "Poster: six scales from molecular scaffold to district ecology; structure/signal/adaptation per scale.",
     "CONCEPT", "Speculative science framing; keep labelled conceptual"),
    ("13ce037f", "2026-10-09", "EDO-01", "FUT-01", "EDO 3's - benefits matrix",
     "Poster: eight claimed benefit areas of a three-symbol genome, with conceptual note.",
     "CONCEPT", "Typo 'intulligence'; benefits are conceptual, not demonstrated (poster says so)"),
    ("1c08bc52", "2026-10-09", "FUT-01", "EDO-02", "EDO 3's - habitat and civilization",
     "Poster: lattice city with towers and waterfalls; interior, civic, facade and material panels.",
     "CONCEPT", ""),
    ("d3cda707", "2026-10-09", "FUT-01", "", "EDO 3's - species atlas",
     "Poster: six speculative organisms (glider, grazer, sentinel, reef weaver, swarm pearl, builder).",
     "CONCEPT", "Header and footer read 'AIM-BSR' (typo for AIM-B5R)"),
    ("257a31d8", "2026-10-09", "FUT-01", "DES-03", "EDO 3's - structural typologies",
     "Poster: tower, porous shell, root column forest, bridge, canopy pavilion, reef megastructure.",
     "CONCEPT", "Header and footer read 'AIM-BSR' (typo for AIM-B5R)"),
    ("43cd7ec0", "2026-10-09", "EDO-01", "FUT-01", "EDO 3's - triadic genome system",
     "Poster: 4-base DNA vs three-strand genome, scaffold, pattern grammar, expressions across scales.",
     "CONCEPT", "Poster itself states 'not a literal scientific claim'; keep that label"),
    # 2026-10-07 (each uploaded twice)
    ("e15dfca3", "2026-10-07", "MED-01", "", "Stuttr crew - market street (wide)",
     "Crew in camo walking through a crowded wet market street at sunset, bridge and skyline behind.",
     "CONCEPT", "Dance8 / Stuttr scene reference, not AIM-B5R"),
    ("7501fcb1", "2026-10-07", "MED-01", "", "Stuttr crew - from a bus window",
     "Over-the-shoulder view from a yellow bus window onto the crew in the market street.",
     "CONCEPT", "Dance8 / Stuttr scene reference, not AIM-B5R"),
    ("fa812b4d", "2026-10-07", "MED-01", "", "Stuttr crew - food stall foreground",
     "Crew framed behind a vendor handing food across a grill.",
     "CONCEPT", "Dance8 / Stuttr scene reference, not AIM-B5R"),
    ("97527fb0", "2026-10-07", "MED-01", "", "Stuttr crew - reflection walk",
     "Crew walking toward camera over a wet reflective street.",
     "CONCEPT", "Dance8 / Stuttr scene reference, not AIM-B5R"),
]
DUPLICATES = {  # duplicate upload -> original upload (byte-identical)
    "19f1f85a": "e15dfca3", "5cc46aa3": "7501fcb1", "db7e7968": "fa812b4d", "0bac1954": "97527fb0",
}
EXCLUDED = {  # uploads that are not generated imagery
    "e120a759": "Screenshot of the Tally intake form (product QA), not concept imagery",
    "87490963": "Screenshot of the Tally intake form (product QA), not concept imagery",
    "08f1d91d": "Screenshot of a test CSV (product QA), not concept imagery",
}
DERIVATIVES = {"55e29b4e": "album screenshot of FUT-01/EDO-01 posters", "debc82ae": "album screenshot of FUT-01/EDO-01 posters"}

NEW_CONCEPTS = [
    # same columns as the owner's register
    dict(concept_id="LET-01", concept_title="L.E.T. Homes & Operations", collection="Concept",
         visual_subjects="Desert/snow/valley/mobile nodes, Airbnb operations cycle, guest journey, turnover, portfolio dashboard",
         documentation_requirement="Site context, STR rules per jurisdiction, actual vs illustrative metrics, owner approval",
         verification_warning="Dashboard numbers are illustrative, not track record", priority="Priority 2"),
    dict(concept_id="WEAR-01", concept_title="AIM Seamless Threads (wearables)", collection="Concept",
         visual_subjects="Adaptive apparel lines, pets, droid augmentation, fabrication engine, body-to-surface workflow",
         documentation_requirement="Material reality vs aspiration; medical/health claims; body-data privacy",
         verification_warning="Outside AIM-B5R scope; no medical or performance claim is validated", priority="Archive"),
    dict(concept_id="MED-01", concept_title="Stuttr / Dance8 Media References", collection="Brand",
         visual_subjects="Stuttr crew scenes, performance wardrobe",
         documentation_requirement="Fictional characters only; AI disclosure; reference-set IDs for Dance8",
         verification_warning="Outside AIM-B5R scope; media reference only", priority="Archive"),
]


def dims(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for n, (uid, received, concept, cross, title, shows, tech, flags) in enumerate(IMAGES, start=1):
        src = os.path.join(UPLOADS, f"{uid}-image.png")
        sha = hashlib.sha256(open(src, "rb").read()).hexdigest()
        w, h = dims(src)
        aid = f"AIMV-{n:03d}"
        rows.append(dict(
            image_id=aid, concept_id=concept, cross_tags=cross, title=title, visible_content=shows,
            technical_status="REQUIRES_VALIDATION" if tech == "EVIDENCE_SCREENSHOT" else "CONCEPT",
            evidence_maturity="provisional (official portal screenshot)" if tech == "EVIDENCE_SCREENSHOT" else "concept",
            release_state="TAGGED", flags=flags,
            derivative_of=("FUT-01 posters: " + ", ".join(r for r in []) ) if False else (DERIVATIVES.get(uid, "")),
            duplicates=";".join(f"{d}-image.png" for d, o in DUPLICATES.items() if o == uid),
            archive_filename=f"{aid}_{concept}.png",
            upload_filename=f"{uid}-image.png", sha256=sha, width=w, height=h,
            bytes=os.path.getsize(src), received_date=received,
            owner="Daniel Ebuehi", reviewer="", approval_date="",
        ))
    fields = list(rows[0].keys())
    with open(os.path.join(OUT, "image_register.csv"), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=fields)
        wr.writeheader()
        wr.writerows(rows)
    with open(os.path.join(OUT, "excluded_uploads.csv"), "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["upload_filename", "reason"])
        for uid, why in EXCLUDED.items():
            wr.writerow([f"{uid}-image.png", why])
        for d, o in DUPLICATES.items():
            wr.writerow([f"{d}-image.png", f"byte-identical duplicate of {o}-image.png"])
    json.dump(dict(images=rows, new_concepts=NEW_CONCEPTS), open(os.path.join(OUT, "inventory.json"), "w"), indent=2)
    print(len(rows), "images indexed")


if __name__ == "__main__":
    main()
