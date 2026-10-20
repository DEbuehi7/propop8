// lib/helpers/registry.ts
//
// Every helper clip on the site, in one list. To add or re-cut a clip, edit
// its entry here and run `npm run helpers` (see docs/MEDIA_WORKFLOW.md). The
// script renders public/helpers/<id>.mp4, <id>.jpg (poster) and <id>.vtt
// (captions) from the recording named in `source`; the page that lists the
// clip's route shows it. tests/helpers.test.ts checks the files, the routes
// and the captions.
//
// Canon: a helper shows a real recording of a feature that exists (GOV-01,
// GOV-17). Recordings use synthetic example data and are labelled as such.
// Concept clips (AI video) carry a Concept badge and never sit on a PropOps8
// tool or paid flow.

export type HelperKind = "task" | "concept";

export interface Caption {
  /** Seconds into the finished clip. */
  from: number;
  to: number;
  text: string;
}

export interface Helper {
  /** File stem in public/helpers/. Lowercase, hyphens. */
  id: string;
  /** Page the clip appears on. A tool slug resolves through app/tools/[slug]. */
  route: string;
  title: string;
  kind: HelperKind;
  /** The footage shows example numbers, not a real household or property. */
  exampleData: boolean;
  /** Recording file name (kept out of git) and the date it was captured. */
  source: string;
  recorded: string;
  /** [start, end] seconds in the recording, joined in order. */
  segments: readonly (readonly [number, number])[];
  /** The recording's width, and the pixel rows kept (drops the status bar and browser bars). */
  crop: { width: number; y: number; height: number };
  /** Seconds into the finished clip for the poster frame. */
  posterAt: number;
  captions: readonly Caption[];
}

/** Rows 150-2230 of an iPhone 1290x2796 screen recording: the page, without browser chrome. */
const IPHONE_PAGE = { width: 1290, y: 150, height: 2080 } as const;

/** Width of every rendered clip, in pixels. */
export const HELPER_WIDTH = 540;

export const HELPERS: readonly Helper[] = [
  {
    id: "recert-enter-data",
    route: "/tools/recert",
    title: "Enter the household",
    kind: "task",
    exampleData: true,
    source: "ScreenRecording_10-04-2026_12-42-59_1_3.mp4",
    recorded: "2026-10-04",
    segments: [[10.5, 12.3], [16.3, 25.5]],
    crop: IPHONE_PAGE,
    posterAt: 1.0,
    captions: [
      { from: 0, to: 3.2, text: "Load a data file, or start blank and type the numbers." },
      { from: 3.2, to: 5.8, text: "Add each income source: who earns it, the type, the gross amount and how often." },
      { from: 5.8, to: 9.3, text: "Then the household members, student status and rent." },
      { from: 9.3, to: 11, text: "Assets and the certification dates finish the data." },
    ],
  },
  {
    id: "recert-clear-flags",
    route: "/tools/recert",
    title: "See what's missing",
    kind: "task",
    exampleData: true,
    source: "ScreenRecording_10-04-2026_12-42-59_1_3.mp4",
    recorded: "2026-10-04",
    segments: [[4.0, 10.0]],
    crop: IPHONE_PAGE,
    posterAt: 3.2,
    captions: [
      { from: 0, to: 3, text: "Packet readiness counts pending signatures, missing data and math conflicts." },
      { from: 3, to: 4.8, text: "Each missing item links to the field that fixes it." },
      { from: 4.8, to: 6, text: "The TIC math shows how the household income total was reached." },
    ],
  },
  {
    id: "recert-export-packet",
    route: "/tools/recert",
    title: "Export the packet",
    kind: "task",
    exampleData: true,
    source: "ScreenRecording_10-04-2026_12-42-59_1_3.mp4",
    recorded: "2026-10-04",
    // Ends before Safari's download banner covers the page (42.25 s).
    segments: [[27.3, 31.0], [38.6, 42.2]],
    crop: IPHONE_PAGE,
    posterAt: 1.0,
    captions: [
      { from: 0, to: 1.8, text: "The final packet lists every form the rules routed for this household." },
      { from: 1.8, to: 4.4, text: "Each form shows its version and why it was chosen." },
      { from: 4.4, to: 7.3, text: "Export packet data saves the file the official CTCAC PDFs are filled from." },
    ],
  },
  {
    id: "vacancy-calculator",
    route: "/tools/vacancy-calculator",
    title: "Split operations from demand",
    kind: "task",
    exampleData: true,
    source: "ScreenRecording_10-04-2026_12-44-10_1_3.mp4",
    recorded: "2026-10-04",
    segments: [[2.8, 11.0]],
    crop: IPHONE_PAGE,
    posterAt: 5.0,
    captions: [
      { from: 0, to: 2.4, text: "Enter the monthly rent, then the move-out, rent-ready and lease-signed dates." },
      { from: 2.4, to: 5, text: "Move-out to rent-ready is make-ready time: 27 days at $117 a day is $3,150." },
      { from: 5, to: 8.2, text: "The bar splits the 31 vacant days: 27 of operations, 4 of leasing." },
    ],
  },
  {
    id: "operations-chaos-index",
    route: "/tools/operations-chaos-index",
    title: "Add up the small issues",
    kind: "task",
    exampleData: true,
    source: "ScreenRecording_10-04-2026_12-46-51_1_3.mp4",
    recorded: "2026-10-04",
    segments: [[55.5, 56.9], [59.4, 62.9]],
    crop: IPHONE_PAGE,
    posterAt: 3.6,
    captions: [
      { from: 0, to: 2.8, text: "Enter how many small issues were logged this quarter." },
      { from: 2.8, to: 4.9, text: "21 issues at about $150 each add up to $3,150." },
    ],
  },
];

export function helperById(id: string): Helper | undefined {
  return HELPERS.find((h) => h.id === id);
}

export function helpersFor(route: string): Helper[] {
  return HELPERS.filter((h) => h.route === route);
}

/** Length of the finished clip in seconds. */
export function helperDuration(h: Pick<Helper, "segments">): number {
  return h.segments.reduce((t, [a, b]) => t + (b - a), 0);
}

/** Pixel size of the rendered clip (the height is rounded down to an even number, as ffmpeg does). */
export function helperSize(h: Pick<Helper, "crop">): { width: number; height: number } {
  return { width: HELPER_WIDTH, height: Math.floor((HELPER_WIDTH * h.crop.height) / h.crop.width / 2) * 2 };
}

/** Public URLs of the rendered files. */
export function helperFiles(id: string) {
  return { video: `/helpers/${id}.mp4`, poster: `/helpers/${id}.jpg`, captions: `/helpers/${id}.vtt` };
}
