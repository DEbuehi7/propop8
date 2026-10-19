/*
 * Rebuilds the Plate dictionary in public/plate/index.html for the owner's
 * original rules (docs/PLATE8_SPEC.md section 8c).
 *
 *   npm i --no-save wordlist-english@1.2.1 badwords-list@2.0.1-4 leo-profanity@1.9.0
 *   node scripts/plate8/build-dict.cjs
 *
 * Accepted words (DICT): the existing 3-6 letter list, unchanged; "a" and
 * "i"; the common two-letter words below; and 7-letter words from SCOWL
 * sizes 10-50. Dealt words (DEAL7, Levels 1 and 3): 7-letter words from SCOWL
 * sizes 10-35 only, so a dealt plate is a word people know. Every added word
 * passes the rig's hashed block list (scripts/plate8/regress3.cjs) and two
 * open profanity lists. SCOWL is Copyright Kevin Atkinson; its notice is in
 * docs/licenses/SCOWL.txt. Deterministic: same inputs, same strings.
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..", "..");
const HTML = path.join(ROOT, "public", "plate", "index.html");
const src = fs.readFileSync(HTML, "utf8");

const decode = (enc) => { const out = []; let prev = "", i = 0;
  while (i < enc.length) { const n = +enc[i]; i++; let t = "";
    while (i < enc.length && (enc[i] < "0" || enc[i] > "9")) { t += enc[i]; i++ }
    const w = prev.slice(0, n) + t; out.push(w); prev = w } return out };
const encode = (words) => { let prev = "", out = "";
  for (const w of [...new Set(words)].sort()) { let n = 0; while (n < 9 && n < prev.length && n < w.length && prev[n] === w[n]) n++;
    if (n === w.length) n--; out += n + w.slice(n); prev = w } return out };

const m = src.match(/const DICT=\(\(\)=>\{const enc="([^"]+)"/) || src.match(/const DICT=unpack\("([^"]+)"\)/);
const old = decode(m[1]).filter((w) => w.length >= 3 && w.length <= 6);

const req = (f) => require(require.resolve("wordlist-english/" + f, { paths: [ROOT] }));
const tier = (max) => { const S = new Set();
  for (const v of ["english", "american"]) for (const n of [10, 20, 35, 40, 50].filter((n) => n <= max))
    for (const w of req(`${v}-words-${n}.json`)) if (/^[a-z]+$/.test(w)) S.add(w);
  return S };
const t50 = tier(50), t35 = tier(35);

const r3 = fs.readFileSync(path.join(__dirname, "regress3.cjs"), "utf8");
const BLOCK = new Set(JSON.parse(r3.match(/const BLOCK = new Set\((\[[^\]]+\])\)/)[1]));
const bad = new Set([
  ...require(require.resolve("badwords-list", { paths: [ROOT] })).array,
  ...require(require.resolve("leo-profanity", { paths: [ROOT] })).list(),
].map((w) => String(w).toLowerCase()));
const clean = (w) => !BLOCK.has(crypto.createHash("sha256").update(w).digest("hex").slice(0, 12)) && !bad.has(w);

const ONE = ["a", "i"];
const TWO = ["ad", "ah", "am", "an", "as", "at", "ax", "be", "by", "do", "eh", "ex", "go", "ha", "he", "hi", "id", "if", "in", "is", "it",
  "lo", "ma", "me", "my", "no", "of", "oh", "ok", "on", "or", "ow", "ox", "pa", "pi", "so", "to", "uh", "um", "up", "us", "we", "ye", "yo"];
const SEVEN = [...t50].filter((w) => w.length === 7);
const OWNER = ["seedpod"]; // from the owner's notes; a real word SCOWL's common tiers lack
const added = [...ONE, ...TWO, ...SEVEN, ...OWNER].filter(clean);
const deal = [...t35].filter((w) => w.length === 7 && clean(w));
const dict = [...new Set([...old, ...added])];

const DICT_LINE = /const DICT=\(\(\)=>\{const enc="[^"]+",s=new Set\(\);let prev="",i=0;\n  while\(i<enc\.length\)\{const n=\+enc\[i\];i\+\+;let t="";\n    while\(i<enc\.length&&\(enc\[i\]<'0'\|\|enc\[i\]>'9'\)\)\{t\+=enc\[i\];i\+\+\}\n    const w=prev\.slice\(0,n\)\+t;s\.add\(w\);prev=w\} return s\}\)\(\);|const DICT=unpack\("[^"]+"\);\nconst DEAL7=\[\.\.\.unpack\("[^"]+"\)\];/;
if (!DICT_LINE.test(src)) throw new Error("dictionary line not found in index.html");
const out = src.replace(DICT_LINE, () =>
  `const DICT=unpack("${encode(dict)}");\nconst DEAL7=[...unpack("${encode(deal)}")];`);
fs.writeFileSync(HTML, out);
const by = {}; for (const w of dict) by[w.length] = (by[w.length] || 0) + 1;
console.log(`dictionary: ${dict.length} words ${JSON.stringify(by)}; dealt 7-letter words: ${deal.length}; filtered out: ${[...ONE, ...TWO, ...SEVEN, ...OWNER].length - added.length + [...t35].filter((w) => w.length === 7).length - deal.length}`);
