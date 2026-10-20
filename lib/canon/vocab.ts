// lib/canon/vocab.ts
//
// Canonical vocabularies taken from the AIM-B5R studies (see studies.ts). These
// are names and fixed values only; nothing here computes a business result.
// Where a study left a value undefined (for example the amber hex), it stays
// null here rather than being invented. The register (register.ts) says which
// study each list comes from and whether it is locked.

// ---------------------------------------------------------------------------
// Namespaces. One acronym, several meanings: keep them apart in code and data.
// ---------------------------------------------------------------------------

/** What "EDO" can mean. Code and data contracts must use the full key. */
export const EDO_MEANINGS = [
  { key: "EDO.PATTERN", meaning: "Edo-derived visual and spatial pattern genome (cultural lineage, AIM-authored grammar)" },
  { key: "EDO.ROBOTICS", meaning: "Robot family and capability genome (EDO-M0, EDO-DX, ...)" },
  { key: "EDO.DECISION", meaning: "Decision protocol: EXECUTE / DEFER / ESCALATE / KILL" },
  { key: "WORK.ROUTING", meaning: "Work routing: execute / delegate / outsource. Named in full, never 'EDO'" },
] as const;

/** What "Triadic" can mean. Same three-part idea, different namespaces. */
export const TRIADIC_MEANINGS = [
  { key: "TRIADIC.FORM", roles: ["Structure", "Signal", "Adaptation"], note: "X1 / X2 / X3 design roles; geometry and environmental response" },
  { key: "TRIADIC.SYSTEMS", roles: ["Body", "Mind", "Habitat"], note: "Robotics: embodiment, intelligence, building interface" },
  { key: "DANCE8.TRIAD", roles: ["Signal", "Movement", "Environment"], note: "Entertainment translation only; never replaces TRIADIC.SYSTEMS" },
] as const;

// ---------------------------------------------------------------------------
// Triadic geometry seed (TRIADIC.FORM). The identity every transformation must trace back to.
// ---------------------------------------------------------------------------

export const TRIADIC_SEED = {
  members: 3,
  planSpacingDeg: 120,
  commonOrigin: true,
  topBendDeg: 90,
  terminalSegment: "straight vertical leg",
  referenceColors: ["black", "white", "brown"],
  excluded: ["handle", "fourth primary member", "severed junction"],
  /** Accent colours for information and music video; not obligatory material colours. */
  roleAccents: { Structure: "cyan", Signal: "gold", Adaptation: "magenta" },
} as const;

// ---------------------------------------------------------------------------
// EDO Pattern Genome (EDO.PATTERN). "The rules that generate the pattern are the identity."
// ---------------------------------------------------------------------------

export const EDO_GENES = [
  { id: "G1", name: "Recursion", rule: "One generation's output becomes the next generation's input" },
  { id: "G2", name: "Self-similarity", rule: "The same grammar works at pixel, tag, wall, facade and district scale" },
  { id: "G3", name: "Center + satellites", rule: "Primary and secondary centers joined by arteries: landmarks, hubs, route emphasis" },
  { id: "G4", name: "Autonomous cells", rule: "Local fields with their own rules inside one coherent family" },
  { id: "G5", name: "Interdependence", rule: "Networks, bridges, loops and service dependencies" },
  { id: "G6", name: "Boundary intelligence", rule: "Edges, zones, portals, hazard bands, access classes, wayfinding transitions" },
] as const;

export const EDO_FAMILIES = [
  { id: "EDO_PALACE_NODE", name: "Palace Node", code: "Radial hierarchy", use: "Primary entrances, landmarks, major UI states" },
  { id: "EDO_UZAMA_NETWORK", name: "Uzama Network", code: "Center + secondary centers", use: "Circulation, system topology, multi-node dashboards" },
  { id: "EDO_GUILD_MESH", name: "Guild Mesh", code: "Decentralized interdependence", use: "Robot/navigation surfaces, systems, operational maps" },
  { id: "EDO_EARTHWORK_BOUNDARY", name: "Earthwork Boundary", code: "Nested territories", use: "Thresholds, restricted/service zones, zoning and access" },
  { id: "EDO_RECURSIVE_TREE", name: "Recursive Tree", code: "Branching self-similarity", use: "Utilities, infrastructure, sensor networks" },
  { id: "EDO_BRAIDED_EXCHANGE", name: "Braided Exchange", code: "Intertwined flows", use: "Logistics, mobility, people/material/data flows" },
  { id: "EDO_CELLULAR_FIELD", name: "Cellular Field", code: "Autonomous adaptive cells", use: "Wall/facade textures, panels, responsive surfaces" },
  { id: "EDO_LIVING_FRACTAL", name: "Living Fractal", code: "Continuous recursion", use: "Animated/digital surfaces, media, live digital-twin states" },
] as const;

export type EdoFamilyId = (typeof EDO_FAMILIES)[number]["id"];

/** The three families the first renderer ships with (PropOps8 visual kernel). */
export const EDO_KERNEL_FIRST_FAMILIES: readonly EdoFamilyId[] = ["EDO_GUILD_MESH", "EDO_UZAMA_NETWORK", "EDO_EARTHWORK_BOUNDARY"];

export const EDO_SCALES = [
  { id: "S0", name: "Micro", meaning: "Engraving / pixel / perforation" },
  { id: "S1", name: "Component", meaning: "Tile / panel / tag" },
  { id: "S2", name: "Room", meaning: "Wall / floor / ceiling / portal" },
  { id: "S3", name: "Building", meaning: "Facade / circulation / courtyard" },
  { id: "S4", name: "Urban", meaning: "Parcel / block / district" },
] as const;

/** Visible-pattern density per expression level, as fractions of the surface. */
export const EDO_EXPRESSION_LEVELS = [
  { level: "SIGNAL", density: [0.01, 0.08], use: "Icons, state edges, route cues, robot tags, wayfinding, asset markers" },
  { level: "FIELD", density: [0.1, 0.3], use: "Dashboard panels, maps, report bands, walls, equipment housings" },
  { level: "CEREMONIAL", density: [0.35, 1.0], use: "Landmark moments only: hero screens, portals, covers" },
] as const;

/** Default for ordinary interface and architecture. Ceremonial moments may invert it. */
export const EDO_DEFAULT_SURFACE_MIX = { quiet: 0.8, pattern: 0.15, signal: 0.05 } as const;

export const EDO_LOCKED_GENES = ["recursion", "self_similarity", "node_hierarchy", "guild_autonomy", "interdependence", "boundary_logic"] as const;
export const EDO_VARIABLE_GENES = ["palette", "material", "density", "rotation", "branch_factor", "recursion_depth", "cell_size", "symmetry", "noise", "signal_color"] as const;

/** One surface, several readers. */
export const EDO_SURFACE_LAYERS = ["human", "robot", "camera", "ar", "digital_twin"] as const;

export const EDO_GENOME_STATUSES = ["prototype", "approved", "deprecated"] as const;

// ---------------------------------------------------------------------------
// Colour. Semantic state first, identity second.
// ---------------------------------------------------------------------------

/** AIM Intelligence OS v3.2 operational palette (canonical for PropOps8 diagnostic work). */
export const CANON_COLORS = {
  navy: "#1B243D",
  slate: "#5C6478",
  coolGray: "#E9EBEF",
  cyan: "#3DDCE8",
  magenta: "#E92AD6",
  magentaLight: "#C21FB0",
} as const;

export const CANON_COLOR_ROLES = {
  navy: "Ground",
  slate: "Neutral / inactive",
  coolGray: "Foreground rules and labels",
  cyan: "Growth / on-plan",
  magenta: "Exposure / loss",
  magentaLight: "Risk accent on light grounds",
} as const;

/**
 * Semantic state colours. An instrument's identity accent never overrides these.
 * Colour is a secondary signal: label, icon and geometry must say the same thing.
 * Amber and green have no canonical hex yet (open decision); they stay null.
 */
export const SEMANTIC_STATES = [
  { state: "focus", color: "cyan", hex: CANON_COLORS.cyan, meaning: "Focus, current route, selected, on-plan" },
  { state: "critical", color: "magenta", hex: CANON_COLORS.magenta, meaning: "Exposure, critical risk, high-priority alert, boundary emphasis" },
  { state: "maintenance", color: "amber", hex: null, meaning: "Maintenance, attention required, intervention needed" },
  { state: "verified", color: "green", hex: null, meaning: "Verified / complete" },
  { state: "unknown", color: "slate", hex: CANON_COLORS.slate, meaning: "Neutral, inactive, unknown, not yet observed" },
] as const;

/** How a pattern changes with state: structurally, not only in colour. */
export const PATTERN_STATE_RESPONSE = [
  { state: "focused", response: "Cyan edge, node or route activates" },
  { state: "high_confidence", response: "Complete, crisp, connected pattern" },
  { state: "uncertain", response: "Fragmented or visibly pending field, same family" },
  { state: "maintenance", response: "Amber branch or node emphasis" },
  { state: "critical", response: "Magenta/red signal plus stronger boundary, topology unchanged" },
  { state: "resolved", response: "Return to the neutral baseline field" },
] as const;

/** Per-node material triads (anchor / structure / emphasis). Not a 120-degree hue wheel. */
export const NODE_COLOR_TRIADS = [
  { node: "Origin", triad: ["black", "white", "brown"] },
  { node: "Edo Earth", triad: ["charcoal", "bronze", "terracotta"] },
  { node: "Eon Desert", triad: ["basalt", "sand", "clay"] },
  { node: "Lumen Alpine", triad: ["slate", "snow", "blue"] },
  { node: "Transect", triad: ["forest", "canvas", "copper"] },
  { node: "AIM OS", triad: ["dark", "cyan", "frost"] },
  { node: "Pulse8", triad: ["midnight", "magenta", "cyan"] },
  { node: "Stuttr Spies", triad: ["night", "violet", "gold"] },
] as const;

export const PRESENTATION_MODES = [
  { mode: "LOUD", use: "Establishing imagery, concept and cinematic scenes" },
  { mode: "QUIET", use: "Fact-centred engineering and data; restrained semantic colour" },
] as const;

// ---------------------------------------------------------------------------
// Evidence. Several axes; each answers a different question. Do not merge them.
// ---------------------------------------------------------------------------

export const EVIDENCE_AXES = {
  /** Is this property fact settled? (Phase 1 kit, dataset contract property_evidence.fact_state) */
  propertyFactState: ["verified", "provisional", "conflicting", "missing", "stale"],
  /** Outcome of an evidence gate. Missing blocking evidence is HOLD, never FAIL. */
  gateOutcome: ["PASS", "CONDITIONAL", "HOLD", "FAIL"],
  /** Decision protocol (EDO.DECISION). */
  decisionCall: ["EXECUTE", "DEFER", "ESCALATE", "KILL"],
  /** Property buy decision. */
  buyDecision: ["BUY", "CONDITIONAL", "NO_BUY"],
  /** What kind of knowledge a value is (design-engine objects). */
  knowledgeState: ["OBSERVED", "CALCULATED", "ASSUMED", "GENERATED", "VERIFIED"],
  /** Authority order for geometry and material claims in twins and views. */
  truthHierarchy: ["OBSERVED", "INFERRED", "VERIFIED", "REGULATED"],
  /** What a design or research claim may say. */
  proofTag: ["CONCEPTUAL", "SIMULATED", "EXPERIMENTALLY_TESTED", "INDEPENDENTLY_VALIDATED"],
  /** Is the number on screen real? */
  dataStatus: ["LIVE", "HISTORICAL", "SYNTHETIC", "MOCK", "ILLUSTRATIVE"],
  /** Asset registry classes; never mixed. */
  assetClass: ["PORTFOLIO_EVIDENCE", "OPERATIONAL_UI", "CONCEPT", "REFERENCE", "BRAND"],
  /** Professional maturity of a drawing. */
  drawingStatus: ["AI_CONCEPT", "ARCHITECT_REVIEWED", "PERMIT_SET", "AS_BUILT"],
} as const;

/** Every material assertion carries these (evidence envelope). */
export const EVIDENCE_ENVELOPE_FIELDS = [
  "source", "source_edition", "observed_at", "retrieved_at", "jurisdiction", "method", "confidence", "model_version", "reviewer",
] as const;

/** A consequential output must be able to answer all of these. */
export const DEFENSIBILITY_QUESTIONS = [
  "What data?", "From where?", "Which version?", "What rule?", "What was computed?", "What was inferred?",
  "What was unknown?", "Who acted?", "Who reviewed?", "What was delivered?",
] as const;

// ---------------------------------------------------------------------------
// Software architecture (PropOps8 and AIM-B5R).
// ---------------------------------------------------------------------------

/** Dependencies point one way: a lower layer never reads a higher one. */
export const ARCHITECTURE_LAYERS = [
  { n: 1, name: "Source / Input", holds: "Raw files, CSVs, forms, APIs, telemetry, user values, authoritative references" },
  { n: 2, name: "Contract + Validation", holds: "Schemas, units, enums, file-type detection, required fields, privacy class, source/version checks" },
  { n: 3, name: "Deterministic Domain Core", holds: "Calculations, state transitions, compliance mappings, underwriting, workflow rules, simulations" },
  { n: 4, name: "View Model / State", holds: "Known, unknown, verified, uncertain, risk, maintenance, selected, completed" },
  { n: 5, name: "UI + EDO Expression", holds: "Cards, maps, tables, reports, diagrams and pattern accents that show the established state" },
] as const;

export const SOFTWARE_SEQUENCE = ["SOURCE", "CLASSIFY", "NORMALIZE", "VALIDATE", "COMPUTE", "PRESENT", "VERIFY", "LOG", "CALIBRATE"] as const;

export const WORKFLOW_LOOP = ["Observe", "Classify", "Validate", "Plan", "Mutate", "Verify"] as const;

/** Revised build sequence (inserts the Phase 0D defensibility gate and the Phase 5 AIM-B5R gate). */
export const BUILD_PHASES = [
  { id: "0A", focus: "Housekeeping: clean branch, route/migration commits, env examples, credential rotation", gate: "Clean tree; new key live; session save/get passes" },
  { id: "0D", focus: "Defensibility: secret scanning, auth roles, data classes, source/version registry, incident runbook, vendor register, restore test", gate: "No tracked secrets; authorization negative tests pass; governance records exist" },
  { id: "1", focus: "Revenue path: calculators, shared audit math, Audit Review, awaited writes/sends", gate: "One synthetic intake travels Tally -> engine -> reviewer -> delivered PDF with status and evidence" },
  { id: "2", focus: "Recert on PropOps8: five income profiles, client-side fill, paid download, no tenant data in server logs", gate: "Five synthetic packets correct and timed against the manual baseline" },
  { id: "3", focus: "Visual kernel + admin: EDO renderer, semantic tokens, responsive shell, LET and Plate8 redesign", gate: "Pages render from typed data; mobile works; colour/pattern semantics accessible" },
  { id: "4", focus: "Plate8 / Dance8: keep deterministic engines; add UI, trace/media surfaces, verified playback", gate: "Fixture fingerprints match; monitoring semantics stable; media provenance resolved" },
  { id: "5", focus: "AIM-B5R gate: decide build/defer for map, underwriting, simulation and living-building depth", gate: "No speculative expansion without a decision-critical use case and evidence contract" },
] as const;

/** Security layers that sit below every UI. */
export const DEFENSIBILITY_STACK = [
  "Legal / policy authority", "Source + version registry", "Privacy + data classification", "Identity + authorization",
  "Deterministic business rules", "Evidence + decision trace", "Human approval gate", "Delivery / real-world verification",
  "Audit / retention / incident loop",
] as const;

export const PRIVACY_CLASSES = ["public", "internal", "confidential", "pii", "sensitive", "regulated"] as const;

/** Vendors and subprocessors the register must list. */
export const VENDOR_REGISTER_SEED = ["Supabase", "Stripe", "Tally", "Resend", "Netlify (hosting/CDN)", "Cloudflare", "AI services"] as const;

// ---------------------------------------------------------------------------
// AIM-B5R real-estate cycle.
// ---------------------------------------------------------------------------

export const B5R_LIFECYCLE = ["ASSESS", "INSTRUMENT", "MODEL", "BUY", "REHAB", "RENT", "RECALIBRATE", "REFINANCE", "REPEAT"] as const;

/** What every buy decision must state. */
export const B5R_DECISION_CONTRACT = [
  "Buy / conditional / no-buy",
  "Maximum supportable acquisition price",
  "Planned intervention",
  "P10/P50/P90 all-in basis",
  "Exposure duration",
  "Stabilized NOI distribution",
  "DSCR",
  "Refinance probability and amount",
  "Unrecovered equity (cash left in)",
  "Mandatory no-refinance downside",
  "Top risks",
  "Next highest-value diligence",
] as const;

/** Software gates for AIM-B5R depth (Intelligence OS v3.2). A date reached without its evidence gate is not permission to build. */
export const B5R_SOFTWARE_GATES = [
  { phase: 0, unlocks: "Single-property screen" },
  { phase: 1, unlocks: "Calibration, after 20 screens or the gate date" },
  { phase: 2, unlocks: "Offer-ready scope, after a qualifying property and lender review" },
  { phase: 3, unlocks: "Ownership ledger, at close" },
  { phase: 4, unlocks: "Refinancing, after seasoning and stable NOI" },
  { phase: 5, unlocks: "Portfolio view, when a second property is under contract" },
  { phase: 6, unlocks: "Variance bridge, only when closed loops exist" },
] as const;

/** Adaptive reuse first: the least intervention that meets the decision contract. */
export const INTERVENTION_LADDER = [
  "Digital backbone", "Sensors + metering", "Lighting / media retrofit", "Robot infrastructure", "Envelope improvements",
  "Unit reconfiguration", "ADU / expansion", "Structural intervention", "Complete redevelopment",
] as const;

export const DESIGN_STACK = [
  "Place", "Constraints", "Program", "Structural chassis / Kit of Parts", "Environmental", "Digital spatial",
  "Robot Building Interface", "Documentation", "Digital twin",
] as const;

export const DIGITAL_SURFACE_TIERS = [
  { tier: 0, tech: "Conventional surface", use: "Fail-safe architecture; normal state" },
  { tier: 1, tech: "Integrated lighting / LED edges", use: "Pathways, status, ambient modes" },
  { tier: 2, tech: "Projection / e-ink / low-power display", use: "Cabinet status, signage, art, temporary graphics" },
  { tier: 3, tech: "Architectural display", use: "Media walls, lobby, amenity and event zones" },
  { tier: 4, tech: "High-performance interactive display", use: "Selected immersive spaces where cost and upkeep are justified" },
] as const;

// ---------------------------------------------------------------------------
// Infrastructure (California multifamily study).
// ---------------------------------------------------------------------------

export const INFRA_PRIORITY = ["Safety + compliance", "Passive durability", "Monitoring", "Automation"] as const;

export const INFRA_SYSTEMS = [
  "Walkability", "Local materials", "Water + soil", "Energy", "Human access", "Last-mile", "Wayfinding", "Lighting", "Mobility", "Ecology",
] as const;

export const INFRA_ENVIRONMENTS = ["DTLA / Pershing Square", "Kern / Fresno", "Crestline / Lumen Labs", "Twentynine Palms / Eon Labs"] as const;

export const INFRA_PHASES = [
  { phase: 0, name: "Assess + screen", gate: "Buy / conditional / no-buy on verified evidence" },
  { phase: 1, name: "Build the baseline", gate: "Financed scope, engineering review, credible stabilization" },
  { phase: 2, name: "Pilot at Eon / Lumen", gate: "Safety, metered performance, maintenance results" },
  { phase: 3, name: "Replicate in portfolio", gate: "Observed savings, adequate reserves, reproducibility" },
  { phase: 4, name: "Partner on public realm", gate: "Jurisdictional authority, funding, service agreement" },
  { phase: 5, name: "Research regional systems", gate: "External validation and research funding, not rental speculation" },
] as const;

// ---------------------------------------------------------------------------
// L.E.T. nodes and robots.
// ---------------------------------------------------------------------------

export const LET_NODES = [
  { letter: "L", name: "Lumen Labs", place: "Crestline", role: "Lab / spatial UI / prototyping; cold-climate research" },
  { letter: "E", name: "Eon Labs", place: "Twentynine Palms", role: "Test site / physical deployment; desert research" },
  { letter: "T", name: "Transect", place: "Kern + Fresno", role: "Mobile field / research node" },
] as const;

/** Agreed robot IDs (five-market study). Older names stay as aliases. */
export const ROBOT_IDS = [
  { id: "EDO-M0", mission: "RC-derived, low-speed indoor rover research prototype; first bounded bench track" },
  { id: "EDO-MI", mission: "Indoor wheeled mobility / package delivery on private, authorized routes" },
  { id: "EDO-MO", mission: "Outdoor campus/site delivery" },
  { id: "EDO-X", mission: "Tracked/terrain inspection and maintenance" },
  { id: "EDO-DI", mission: "Indoor protected microdrone inspection; separate flight safety case" },
  { id: "EDO-DX", mission: "Exterior supervised inspection/mapping drone" },
  { id: "EDO-I", mission: "Integrated building robot: rails, gantries, docks and service nodes (added 2026-10-18)" },
] as const;

/** Older names that point at an agreed ID. */
export const ROBOT_ALIASES = [{ alias: "EDO-M", id: "EDO-MI" }] as const;

/** Research names from other studies, not agreed IDs (owner decision 2026-10-18). */
export const ROBOT_RESEARCH_CLASSES = [
  { id: "EDO-H", mission: "Home helper" },
  { id: "EDO-C", mission: "Facade / confined-surface crawler" },
  { id: "EDO-W", mission: "Water-surface inspection" },
  { id: "EDO-S", mission: "Submerged structures and piping" },
] as const;

// ---------------------------------------------------------------------------
// Plate8 suite.
// ---------------------------------------------------------------------------

export const PLATE8_INSTRUMENTS = [
  { id: "State8", identity: "Audio / rhythm / human signal" },
  { id: "Mate8", identity: "Strategy / analysis / position" },
  { id: "Skate8", identity: "Motion / autonomy / telemetry" },
  { id: "Plate8", identity: "Language / game constraint" },
  { id: "Slate8", identity: "Visual media / collections" },
  { id: "Late8", identity: "Information flow / dispatches" },
] as const;

/** Every instrument screen, in this order. */
export const PLATE8_SHELL = ["InstrumentHeader", "InstrumentStage", "PrimaryControls", "KeyMetrics", "SecondaryPanel", "Plate8Lens", "GlobalNav"] as const;

/** The one suite-level Claude entry point. */
export const PLATE8_LENS_INTENTS = ["Explain", "Explore", "Create", "Compare"] as const;

// ---------------------------------------------------------------------------
// Time, music and media (ChronoLayer, Dance8, State8, Stuttr).
// ---------------------------------------------------------------------------

/** Four clocks. They may share rendering code; they never share meaning. */
export const CLOCKS = [
  { id: "capture", basis: "Observed timestamp + timezone + sensor/camera source", use: "Inspections, drone and camera archives" },
  { id: "project", basis: "Milestones, scheduled/actual dates, phase status", use: "AIM-B5R scope, permit and rehab progress" },
  { id: "narrative", basis: "Episode/chapter position and fictional mission time", use: "State8 / STUTTR Spies" },
  { id: "musical", basis: "Sample, beat, bar, phrase, section, tempo", use: "Dance8 synchronization" },
] as const;

/** Reference sync grid for concept work: 120 BPM at 24 fps. */
export const SYNC_REFERENCE = { bpm: 120, fps: 24, beatsPerBar: 4 } as const;

/** Overlapping organisational scales of a music video (not fixed durations). */
export const MUSIC_SEGMENT_SCALES = ["onset", "beat", "bar", "phrase", "section", "scene", "chapter", "set"] as const;

/** Build the cheapest tier first. */
export const VIDEO_PRODUCTION_LADDER = [
  { tier: "budget_2d", implement: "Pre-rendered layers, procedural SVG/Canvas motifs, audio features, camera cuts, motion clip library" },
  { tier: "modular_3d", implement: "Reusable stages, rigged performers, authored camera paths, selective 3D effects" },
  { tier: "selective_ai", implement: "Short hero shots, transitions and background plates, reused between edits" },
] as const;

/** A creative taxonomy, not physical dimensions. */
export const DANCE8_TIERS = [
  { tier: "1D", control: "Line / pulse / amplitude" },
  { tier: "2D", control: "Pattern field / tile / grid" },
  { tier: "3D", control: "Geometry / spatial volume" },
  { tier: "4D", control: "3D + time / motion" },
  { tier: "5D", control: "Branching scenario / narrative" },
  { tier: "6D", control: "Multisensory coupling (audio, light, motion, camera)" },
  { tier: "7D", control: "World meaning / semantics" },
  { tier: "8D", control: "Adaptive orchestration of the tiers below" },
] as const;

/** Best stem-separation input first. A transcode never moves a file up this list. */
export const AUDIO_SOURCE_ORDER = [
  "Native Suno stems or original uncompressed WAV export",
  "Original M4A/AAC (when its encode is stronger)",
  "Original MP3 (a high-bitrate MP3 can beat a low-bitrate AAC)",
] as const;

export const STATE8_STUTTR_CATEGORIES = [
  "Missions + episodes", "Characters + voices", "Locations + vehicles/systems", "Sound cues + decision traces", "Timeline / evidence clips",
] as const;

// ---------------------------------------------------------------------------
// Kirtled (Dance8 harmony instrument).
// ---------------------------------------------------------------------------

/** The six triads of C major, diminished omitted by design. */
export const KIRTLED_C_MAJOR = [
  { chord: "Dm", numeral: "ii", notes: "DFA" },
  { chord: "F", numeral: "IV", notes: "FAC" },
  { chord: "Am", numeral: "vi", notes: "ACE" },
  { chord: "C", numeral: "I", notes: "CEG" },
  { chord: "Em", numeral: "iii", notes: "EGB" },
  { chord: "G", numeral: "V", notes: "GBD" },
] as const;

/**
 * Move vocabulary. A move word names navigation or harmonic intent; it never
 * names a drum. Song-following mode (built) uses RA, LA, KA and TI only.
 */
export const KIRTLED_MOVES = [
  { word: "DO", move: "STOMP", effect: "Stay on the current triangle and replay its chord", builtInSongFollowing: false },
  { word: "RA", move: "ROLL", effect: "Travel along connected triangles (melodic/harmonic run)", builtInSongFollowing: true },
  { word: "LA", move: "FLIP", effect: "Switch major/minor on the same root (G -> Gm is chromatic)", builtInSongFollowing: true },
  { word: "KA", move: "SPIN", effect: "Orbit a shared corner: around C, C -> Am -> F", builtInSongFollowing: true },
  { word: "TI", move: "JUMP", effect: "Change the selected key and triangle set; only TI changes key", builtInSongFollowing: true },
  { word: null, move: "FREEZE", effect: "Hold chord/pads and suppress drums until release", builtInSongFollowing: false },
] as const;

/**
 * Skaters play Kirtled in song-following mode (D8-16, decided by the owner
 * 2026-10-18): one trick per chord change, landing on it. Tricks follow the
 * master recording; they never make sound (that is performance mode, D8-08).
 */
export const KIRTLED_SKATE_TRICKS = [
  { cue: "RA", trick: "floor_carve", label: "Floor carve to the next triangle" },
  { cue: "LA", trick: "kickflip_sweep", label: "Kickflip sweep" },
  { cue: "KA", trick: "handplant_roll", label: "Handplant roll or a 180/360 spin" },
  { cue: "TI", trick: "ollie_leap", label: "Big ollie leap (key change; also a leap too far for the tempo)" },
  { cue: "HOLD", trick: "board_freeze", label: "Board-assisted freeze (the chord is held)" },
] as const;

/**
 * The owner's own filmed dance, read as Kirtled move words (D8-17, decided by
 * the owner 2026-10-19). Read only after the take is synced to the song's beat
 * grid (D8-02); the thresholds live in lib/dance8/moves/words.ts. A beat the
 * camera cannot read is unknown, never guessed.
 */
export const KIRTLED_BODY_MOVES = [
  { body: "stomp", detectedWhen: "One foot hits down hard on a beat", word: "DO", move: "STOMP" },
  { body: "travel", detectedWhen: "The hips move at least half a body-width within a bar", word: "RA", move: "ROLL" },
  { body: "drop_or_rise", detectedWhen: "The hips change level without travelling", word: "LA", move: "FLIP" },
  { body: "turn", detectedWhen: "The body turns 180 degrees or more within a bar", word: "KA", move: "SPIN" },
  { body: "jump", detectedWhen: "Both feet leave the floor", word: "TI", move: "JUMP" },
  { body: "freeze", detectedWhen: "Holding still for a beat or more", word: "FREEZE", move: "FREEZE" },
] as const;

/**
 * How the owner's dance styles the skaters (D8-18, decided by the owner
 * 2026-10-19). Which trick lands on which chord change stays D8-16; these
 * pick the version, the size, how many skaters and which way they carve.
 */
export const KIRTLED_SKATE_FROM_DANCE = [
  { from: "turn", sets: "KA version", rule: "Under 180 degrees a handplant roll, 180 to 359 a 180 spin, 360 or more a 360 spin" },
  { from: "jump", sets: "TI ollie size", rule: "Low, mid or high by the jump height; standard when there was no jump" },
  { from: "freeze", sets: "HOLD freeze pose", rule: "Low when the freeze is low or on the floor, high when standing" },
  { from: "energy", sets: "Skaters doing the trick", rule: "Solo, half the crew or the whole crew, by thirds of the energy" },
  { from: "travel", sets: "Carve direction between tricks", rule: "The way the dancer travelled since the last trick, or in place" },
] as const;

export const KIRTLED_RESERVED = [
  { word: "BU", move: "BEAT" }, { word: "MU", move: "WATER" }, { word: "SI", move: "LIGHT" }, { word: "VE", move: "SKY" },
] as const;

/** Percussion comes from the crossed side, at the crossing timestamp. */
export const KIRTLED_SIDE_CUES = { R: "kick", L: "hihat", P: "snare", jump: "crash" } as const;

/** The study's canonical six crossings: C -> Em -> G -> Gm -> G -> Em -> C. */
export const KIRTLED_CANONICAL_SEQUENCE = {
  chords: ["C", "Em", "G", "Gm", "G", "Em", "C"],
  words: ["RA", "RA", "LA", "LA", "RA", "RA"],
  cues: ["hihat", "kick", "snare", "snare", "kick", "hihat"],
} as const;

export const KIRTLED_MIDI_CHANNELS = { piano: 1, bass: 2, pads: 3, lead: 4, drums: 10, lightCues: 16 } as const;

export const KIRTLED_WORDMARK = { K: "magenta", R: "magenta", L: "magenta", T: "gold", D: "teal", I: "white", E: "white" } as const;
