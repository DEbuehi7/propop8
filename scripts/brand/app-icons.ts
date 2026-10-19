/**
 * iPhone home-screen icons (apple-touch-icon) for PropOps8 and Dance8.
 *
 *   npx --yes tsx scripts/brand/app-icons.ts
 *
 * Writes the SVG sources and 1024 px masters to brand/icons/, and the 180 px
 * icons the site serves: app/apple-icon.png (the public site) and
 * public/po8-admin-icon.png (the admin back end; it lives outside /admin
 * because everything under /admin needs a login, and an iPhone fetches the
 * icon without one). Dance8 deploys on its own
 * account (canon D8-13), so its icon stays in brand/icons/ until then.
 * Colours are canon (lib/canon/vocab.ts CANON_COLORS); the 8 is Inter Bold's
 * outline (SIL Open Font License), so nothing depends on an installed font.
 * iOS rounds the corners itself, so every icon is a full, opaque square.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { CANON_COLORS } from "../../lib/canon/vocab";

const ROOT = join(__dirname, "..", "..");
const OUT = join(ROOT, "brand", "icons");
const INK = "#070B14"; // the site's theme colour (app/layout.tsx)
const { cyan, magenta, navy, coolGray } = CANON_COLORS;

/** Inter Bold "8" (font units, y up; bounds 94..1239 x -20..1510). */
const EIGHT = "M666 -20Q499 -20 370.0 35.0Q241 90 167.5 185.0Q94 280 94 400Q94 493 136.5 571.5Q179 650 251.5 702.5Q324 755 415 770V779Q296 804 222.0 896.0Q148 988 148 1110Q148 1225 215.0 1315.5Q282 1406 399.0 1458.0Q516 1510 666 1510Q815 1510 932.5 1458.0Q1050 1406 1117.5 1315.5Q1185 1225 1185 1110Q1185 988 1110.0 896.0Q1035 804 919 779V770Q1008 755 1080.5 702.5Q1153 650 1196.0 571.5Q1239 493 1239 400Q1239 280 1165.5 185.0Q1092 90 962.5 35.0Q833 -20 666 -20ZM666 206Q743 206 800.0 233.5Q857 261 889.0 310.5Q921 360 921 424Q921 490 888.0 540.5Q855 591 797.5 620.5Q740 650 666 650Q592 650 534.5 621.0Q477 592 444.0 541.5Q411 491 411 424Q411 360 442.5 311.0Q474 262 532.0 234.0Q590 206 666 206ZM666 874Q730 874 779.5 900.0Q829 926 857.5 972.0Q886 1018 886 1077Q886 1137 858.0 1182.0Q830 1227 780.5 1252.0Q731 1277 666 1277Q601 1277 551.5 1252.0Q502 1227 474.0 1182.0Q446 1137 446 1077Q446 1018 474.0 972.0Q502 926 552.0 900.0Q602 874 666 874Z";
/** The 8 centred at (cx, cy), `height` px tall. */
const eight = (cx: number, cy: number, height: number, fill: string) => {
  const s = height / 1530;
  return `<path fill="${fill}" transform="translate(${cx} ${cy}) scale(${s} ${-s}) translate(-666.5 -745)" d="${EIGHT}"/>`;
};
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

/** A gear (n teeth) centred at (cx, cy), as one path with a hole. */
function gear(cx: number, cy: number, r: number, fill: string, hole: string): string {
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * 2 * Math.PI - Math.PI / 2;
    const rr = i % 4 === 0 || i % 4 === 1 ? r : r * 0.78;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.36).toFixed(1)}" fill="${hole}"/>`;
}

/** Six triangles around a centre, alternating magenta and cyan outlines, one filled. */
function hexFloor(cx: number, cy: number, r: number): string {
  const v = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  const tri = (i: number) => `${cx},${cy} ${v[i][0].toFixed(1)},${v[i][1].toFixed(1)} ${v[(i + 1) % 6][0].toFixed(1)},${v[(i + 1) % 6][1].toFixed(1)}`;
  let out = "";
  for (let i = 0; i < 6; i++) {
    const col = i % 2 === 0 ? magenta : cyan;
    out += i === 0
      ? `<polygon points="${tri(i)}" fill="${col}"/>`
      : `<polygon points="${tri(i)}" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="14" stroke-linejoin="round"/>`;
  }
  return out + `<circle cx="${cx}" cy="${cy}" r="44" fill="#FFFFFF"/>`;
}

const ICONS: Record<string, string> = {
  // The public site: the PropOps8 mark, cyan on the site's ink.
  "propops8-frontend": svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${navy}"/><stop offset="1" stop-color="${INK}"/></linearGradient></defs>` +
      `<rect width="1024" height="1024" fill="url(#g)"/>` +
      `<rect x="232" y="232" width="560" height="560" rx="128" fill="none" stroke="${cyan}" stroke-width="44"/>` +
      eight(512, 512, 330, cyan),
  ),
  // The admin back end: the same mark inverted, with a gear.
  "propops8-admin": svg(
    `<rect width="1024" height="1024" fill="${cyan}"/>` +
      `<rect x="232" y="232" width="560" height="560" rx="128" fill="none" stroke="${INK}" stroke-width="44"/>` +
      eight(512, 512, 330, INK) +
      `<circle cx="760" cy="760" r="122" fill="${cyan}"/>` +
      gear(760, 760, 104, INK, cyan),
  ),
  // Dance8 (option B): a Kirtled floor hexagon of six triads around the
  // dancer; one triad lit, as on the floor when a chord sounds.
  "dance8-floor": svg(
    `<defs><radialGradient id="g" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="${navy}"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>` +
      `<rect width="1024" height="1024" fill="url(#g)"/>` +
      hexFloor(512, 512, 330),
  ),
  // Dance8 (option A): the 8 as two Kirtled triangles meeting at one point, the dancer.
  dance8: svg(
    `<defs><radialGradient id="g" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="${navy}"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>` +
      `<rect width="1024" height="1024" fill="url(#g)"/>` +
      `<polygon points="296,236 728,236 512,512" fill="${magenta}"/>` +
      `<polygon points="512,512 296,788 728,788" fill="${cyan}"/>` +
      `<polygon points="296,236 728,236 512,512 728,788 296,788 512,512" fill="none" stroke="${coolGray}" stroke-opacity="0.35" stroke-width="10" stroke-linejoin="round"/>` +
      `<circle cx="512" cy="512" r="46" fill="#FFFFFF"/>`,
  ),
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const [name, body] of Object.entries(ICONS)) {
    writeFileSync(join(OUT, `${name}.svg`), body + "\n");
    const png = (size: number) => sharp(Buffer.from(body)).resize(size, size).flatten({ background: INK }).png({ compressionLevel: 9 });
    await png(1024).toFile(join(OUT, `${name}-1024.png`));
    await png(180).toFile(join(OUT, `${name}-180.png`));
  }
  await sharp(join(OUT, "propops8-frontend-180.png")).toFile(join(ROOT, "app", "apple-icon.png"));
  await sharp(join(OUT, "propops8-admin-180.png")).toFile(join(ROOT, "public", "po8-admin-icon.png"));
  console.log("icons written to brand/icons/, app/apple-icon.png and public/po8-admin-icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
