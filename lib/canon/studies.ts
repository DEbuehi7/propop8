// lib/canon/studies.ts
//
// The twenty AIM-B5R session studies the owner uploaded on 18 Oct 2026, as
// source documents for the canon register. `fileKey` is the first eight
// characters of the uploaded file name, so a study can be traced back to its
// PDF. Page counts are the PDFs' own; register entries cite pages inside them.
//
// Every study describes itself as a session synthesis: concept and proposal
// unless it says otherwise. The register decides what is locked.

export interface Study {
  id: StudyId;
  fileKey: string;
  title: string;
  /** When the conversation happened (as stated in the study). */
  discussed: string;
  /** When the study PDF was compiled. */
  compiled: string;
  pages: number;
  /** The study's own status line, quoted or closely paraphrased. */
  selfStatus: string;
}

export type StudyId =
  | "suno-stems"
  | "rosslyn-eon-lumen"
  | "edo-surface"
  | "triadic-pavilion"
  | "mural-transit"
  | "bloomwing"
  | "system-architecture"
  | "propops8-reliability"
  | "let-homes-threads"
  | "kern-fresno-phase1"
  | "chronolayer"
  | "design-engine"
  | "fast-slow-portfolio"
  | "five-market-vault"
  | "sears-la"
  | "plate8-suite"
  | "ca-infrastructure"
  | "robotic-ecology"
  | "triadic-dance8"
  | "kirtled";

export const STUDIES: readonly Study[] = [
  { id: "suno-stems", fileKey: "1f816758", title: "Suno Stems, Stuttr, State8 and Dance8 Integration", discussed: "2026-10-17", compiled: "2026-10-17", pages: 5, selfStatus: "Design / workflow summary; no verified cost, performance, regulatory or implementation claims" },
  { id: "rosslyn-eon-lumen", fileKey: "246c5b4f", title: "Rosslyn Adaptive Reuse, Robotic Ecology, EON + LUMEN Labs", discussed: "2026-10-17", compiled: "2026-10-17", pages: 13, selfStatus: "Concept / research record; no engineering sign-off" },
  { id: "edo-surface", fileKey: "4f9dfb28", title: "EDO Genome, Intelligent Surface System & Applications", discussed: "2026-10", compiled: "2026-10-17", pages: 13, selfStatus: "Session-derived design-development outputs" },
  { id: "triadic-pavilion", fileKey: "50549a6f", title: "Triadic Geometry, EDO Genome and Adaptive Pavilion", discussed: "2026-10-09", compiled: "2026-10-17", pages: 12, selfStatus: "Concept study; not for construction" },
  { id: "mural-transit", fileKey: "5996497e", title: "Adaptive Reuse, EDO-Triadic Urbanism, Stuttr Murals & Walkable Transit", discussed: "2026-10-17", compiled: "2026-10-17", pages: 10, selfStatus: "Concept study; not a survey, permit set or performance validation" },
  { id: "bloomwing", fileKey: "5e70b0a2", title: "Eon Labs BloomWing: Autonomous Mobility and Engineering Feasibility", discussed: "2026-10-17", compiled: "2026-10-17", pages: 16, selfStatus: "Concept study; not airworthiness evidence" },
  { id: "system-architecture", fileKey: "5fb005b7", title: "System Architecture, Autonomy, EDO Design and Integration", discussed: "2026-10", compiled: "2026-10-17", pages: 11, selfStatus: "Working study / development reference; not a code audit or verified pro forma" },
  { id: "propops8-reliability", fileKey: "805bb03f", title: "PropOps8 Reliability, EDO Visual System, Security & Compliance", discussed: "2026-10-18", compiled: "2026-10-18", pages: 10, selfStatus: "Session synthesis of design, engineering, security and compliance strategy; not legal advice" },
  { id: "let-homes-threads", fileKey: "98b5b03a", title: "EDO Triadic Genome, L.E.T. Homes, Seamless Threads and Research", discussed: "2026-10-09/11", compiled: "2026-10-17", pages: 13, selfStatus: "Study and design-research summary; not a specification, clinical claim or validation" },
  { id: "kern-fresno-phase1", fileKey: "9ee156f8", title: "Kern/Fresno Property Intelligence, Claude Handoff and Visual QA", discussed: "2026-10-09", compiled: "2026-10-17", pages: 4, selfStatus: "Internal research and design governance reference; no official parcel verification" },
  { id: "chronolayer", fileKey: "a2b98a0a", title: "ChronoLayer, EDO-Triadic Visual System, Digital Twins, Dance8-STUTTR", discussed: "2026-10-11/12", compiled: "2026-10-17", pages: 16, selfStatus: "Illustrative system study; not construction or investment advice" },
  { id: "design-engine", fileKey: "b3e496aa", title: "Design Identity, Development Engine, Stage 1 MVP, Digital Twin and UI System", discussed: "2026-10", compiled: "2026-10-17", pages: 12, selfStatus: "Design and product strategy summary" },
  { id: "fast-slow-portfolio", fileKey: "b77973ab", title: "Seamless Threads, Equipment, AI Fast / RE Slow & Portfolio Feedback", discussed: "2026-10-17", compiled: "2026-10-17", pages: 15, selfStatus: "Concept + synthetic scenarios; financial model hypothetical" },
  { id: "five-market-vault", fileKey: "c22ea897", title: "Five-Market Intelligence, Resilience, Vault Governance & Camera-First Robotics", discussed: "2026-10-11", compiled: "2026-10-17", pages: 15, selfStatus: "RESEARCH_ONLY" },
  { id: "sears-la", fileKey: "c7843add", title: "Sears Los Angeles Adaptive Reuse and Intelligent Building Systems", discussed: "2026-10-10", compiled: "2026-10-10", pages: 15, selfStatus: "Concept study; not a pro forma; not for construction" },
  { id: "plate8-suite", fileKey: "dad40a17", title: "Plate8 Entertainment Suite, Claude Integration & Responsive UI", discussed: "2026-10-04", compiled: "2026-10-18", pages: 8, selfStatus: "Ecosystem / interface study; does not change the B5R underwriting model" },
  { id: "ca-infrastructure", fileKey: "e1cd2318", title: "California Multifamily Infrastructure, Adaptive Reuse and Phased Development", discussed: "2026-10-17", compiled: "2026-10-17", pages: 10, selfStatus: "Working study; not a permit set or investment approval" },
  { id: "robotic-ecology", fileKey: "e1ed3f99", title: "Robotic Ecology, Triadic Genome & Systems Integration", discussed: "2026-10-10", compiled: "2026-10-17", pages: 17, selfStatus: "Session synthesis; visuals conceptual, not engineering approval" },
  { id: "triadic-dance8", fileKey: "f9af927e", title: "Triadic Genome & Responsive Architecture: Dance8 + Skate-Dance Fusion", discussed: "2026-10-10", compiled: "2026-10-17", pages: 14, selfStatus: "Design concept; not engineering validation" },
  { id: "kirtled", fileKey: "fece7f38", title: "Kirtled and Dance8 Spatial Music Integration", discussed: "2026-10-17", compiled: "2026-10-17", pages: 6, selfStatus: "Synthetic concept; architectural use is a proposed translation" },
];

export const studyById = (id: StudyId): Study => {
  const s = STUDIES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown study: ${id}`);
  return s;
};
