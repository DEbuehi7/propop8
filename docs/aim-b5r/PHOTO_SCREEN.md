# AIM-B5R photo screen

A first look at a building or site from photos: what they show, what's worth
keeping, hazards to check, and residential ideas to investigate. It is the
start of ASSESS (canon B5R-01), not underwriting: it holds no prices, rents,
costs or returns, gives no score (B5R-05), and every gate stays HOLD until its
own evidence exists (dataset contract G0–G6).

```
npm run b5r -- screen ~/Desktop/site-photos --intent "Keep the brick; add homes" --name maple-court
npm run b5r -- screen a.jpg b.jpg --dry      # prepare and show the cost; send nothing
```

## What it does

1. Takes up to 20 photos (files or folders): JPEG, PNG, WebP or GIF, and HEIC
   on a Mac (converted with `sips`).
2. Stops if a name on your private list `~/AIMScenes/blocked-names.txt` (one
   per line) is in the intent or a photo's path. Put your employers' building
   names there (canon GOV-16). The list never goes in this repository.
3. Fingerprints each original (SHA-256) and makes a resized JPEG copy of about
   1.15 megapixels, upright, with its location and other metadata removed.
4. Prints the cost before sending: image tokens by the vision docs' formula
   (width × height / 750), text at about 3.5 characters a token, priced from
   the published rates (Sonnet 5.5: $2 in, $10 out per million tokens, checked
   2026-11-02). `--dry` stops here.
5. Sends the copies once to Claude (`claude-sonnet-5-5` unless `--model`),
   which must answer through one fixed tool (`lib/b5r/screen/contract.ts`).
   No retries: a failure costs nothing more.
6. Checks the answer by fixed rules and sets aside, with the reason shown in
   the report, anything that cites a photo it wasn't shown, uses an unknown
   code, names a money or return figure (GOV-17; the figure itself is blanked)
   or proposes a non-residential use (B5R-33).
7. Writes `~/AIMScenes/<date>-<name>/report.html` and `report.json` with the
   resized photos. It refuses to write inside this repository, which is public.

## The report

- **Gates G0–G6, all HOLD**, each with the next evidence it needs. A hazard
  the photos raise adds its fixed next step to its gate: seismic and
  structural items to G4, flood, slope and fire to G2 (B5R-11), overhead lines
  to G3, hazardous materials to lab sampling (ROB-08).
- **Worth keeping, condition, hazards**: each tied to its photo numbers and
  marked OBSERVED or INFERRED (canon truth hierarchy).
- **Ideas to investigate**, least intervention first: access and safety
  (INF-01), then the intervention ladder (B5R-18), then site, water and
  landscape. Each is CONCEPTUAL.
- What the photos can't show, and a note to blur people or plates if any were
  visible.

The model describes; the code decides every gate, label and order (GOV-14).

## Setup

`ANTHROPIC_API_KEY` in your shell (for example in `~/.zshrc`). It is read by
name, sent only in the API header, and never logged or saved.
