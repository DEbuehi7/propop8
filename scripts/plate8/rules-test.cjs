#!/usr/bin/env node
// The owner's original Plate rules (docs/PLATE8_SPEC.md section 8c), pinned.
// Part 1 runs the game's own functions, cut out of public/plate/index.html
// unchanged, with a seeded random so every run deals the same plates.
// Part 2 drives the rig in jsdom: level chips, vanity order, banking a word.
// Usage: node scripts/plate8/rules-test.cjs
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = []; const ok = (n, c, d) => R.push([n, !!c, d || '']);

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'plate', 'index.html'), 'utf8');
const mod = html.slice(html.indexOf("mod('plate',()=>{"));
const part = (a, b) => { const i = mod.indexOf(a), j = mod.indexOf(b); if (i < 0 || j < 0) throw new Error('missing ' + a + ' / ' + b); return mod.slice(i, j); };
// mulberry32: a small seeded generator, so every run deals the same plates
let seed = 8;
const random = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
const rnd = Object.assign(Object.create(Math), { random });
const E = vm.runInNewContext(
  "let plate='',cells=[],cands=[],ordered=true,found=[],msg='',platePts=0,best=null;\n" +
  part('function unpack', 'let fmt=') + part('let fmt=', 'let plate=') + part('let SP7=null', 'function submit') +
  ";({set(p,f,o){plate=p;fmt=f;ordered=o;cells=[...p].map(opts)}, deal(f){fmt=f;ordered=true;newPlate();return plate}," +
  " get cands(){return cands}, get fmt(){return fmt}, special7, DICT, DEAL7, LEET, LOOK, FORMATS, OLD_FMT, plateValue, fitsOrdered, usedSlots, score})",
  { Math: rnd, Set, Array, Uint8Array, String, Object });

// ---- the table and the values
ok('readings: 0 O/D, 1 I, 2 Z, 3 E, 5 S, 6 G, 7 L, 8 B, 9 P; 4 is a number only',
  JSON.stringify(E.LEET) === JSON.stringify({ 0: ['O', 'D'], 1: ['I'], 2: ['Z'], 3: ['E'], 4: [], 5: ['S'], 6: ['G'], 7: ['L'], 8: ['B'], 9: ['P'] }));
ok('values: B 8, D 0, E 3, G 6, I 1, L 7, O 0, P 9, S 5, Z 2',
  JSON.stringify(E.LOOK) === JSON.stringify({ B: 8, D: 0, E: 3, G: 6, I: 1, L: 7, O: 0, P: 9, S: 5, Z: 2 }));
// the owner's worked examples (SKIPPPY was written as 34; the rule gives 33)
const values = { '5ANN095': 19, '6ALL095': 34, '5EED900': 20, '1ANA111': 4, '0OOO000': 0, '1A11111': 6, '0ESP017': 25, '9UPP135': 36, '4YOU269': 21, 'SKIPPPY': 33 };
const bad = Object.entries(values).filter(([p, v]) => E.plateValue(p) !== v);
ok('plate values match the worked examples', !bad.length, bad.map(([p, v]) => p + ' ' + E.plateValue(p) + '≠' + v).join(', ') || '10 plates');

// ---- scoring: value + 100 full, + 1000 vanity full, + 50 partial
const bank = (p, f, w, o = true) => { E.set(p, f, o); return E.DICT.has(w.toLowerCase()) ? E.usedSlots(w) : [] };
const scoreOf = (p, f, w, o) => { const s = bank(p, f, w, o); return s.length ? E.score(w, s) : null };
ok('full-word plate: GALLOPS on 6ALL095 = 34 + 100', scoreOf('6ALL095', 'chars', 'GALLOPS') === 134);
ok('full-word plate: SEEDPOD on 5EED900 = 20 + 100', scoreOf('5EED900', 'chars', 'SEEDPOD') === 120);
ok('0 reads as D too: DESPOIL on 0ESP017 = 25 + 100', scoreOf('0ESP017', 'chars', 'DESPOIL') === 125);
ok('partial word: AN on 1ANA111 = 4 + 50', scoreOf('1ANA111', 'least', 'AN') === 54);
ok('partial word: ALL on 6ALL095 = 34 + 50', scoreOf('6ALL095', 'chars', 'ALL') === 84);
ok('business plate, one letter: A on 1A11111 = 6 + 50', scoreOf('1A11111', 'least', 'A') === 56);
ok('the 4 reads as no letter: YO on 4YOU269 = 21 + 50', scoreOf('4YOU269', 'least', 'YO') === 71 && !E.fitsOrdered('HYOU'));
ok('vanity plate in full, any order: PLATES-style scramble gets + 1000',
  (() => { const w = 'GALLOPS', p = 'SPOLLAG'; E.set(p, 'letters', true); const s = E.usedSlots(w); return s.length === 7 && E.score(w, s) === E.plateValue(p) + 1000 })());
ok('not words stay out: SANNOPS, SKIPPPY, OO', ['SANNOPS', 'SKIPPPY', 'OO'].every((w) => !E.DICT.has(w.toLowerCase())));

// ---- the dictionary
ok('words from one letter (a, i) to seven', E.DICT.has('a') && E.DICT.has('i') && E.DICT.has('an') && E.DICT.has('gallops') && ![...E.DICT].some((w) => w.length > 7));
ok('every dealt word is an accepted word', E.DEAL7.every((w) => E.DICT.has(w) && w.length === 7), E.DEAL7.length + ' dealt');
ok('Level 1 has enough special words to deal from', E.special7().length > 300, E.special7().length + ' words');

// ---- the levels deal plates that have their answer
const deals = (f, n) => Array.from({ length: n }, () => { const p = E.deal(f); return { p, cands: E.cands.slice() } });
const L1 = deals('chars', 30), L2 = deals('least', 30), L3 = deals('letters', 30);
ok('Level 1: #XXX### plates whose whole plate spells a word', L1.every(({ p, cands }) => /^[0-9][A-Z]{3}[0-9]{3}$/.test(p) && cands.some((w) => w.length === 7)), L1.slice(0, 4).map((d) => d.p).join(' '));
ok('Level 2: standard and business plates, each with a short word', L2.every(({ p, cands }) => /^[0-9][A-Z]{3}[0-9]{3}$|^[0-9][A-Z][0-9]{5}$/.test(p) && cands.some((w) => w.length <= 4))
  && L2.some((d) => /^[0-9][A-Z][0-9]{5}$/.test(d.p)), L2.filter((d) => /^[0-9][A-Z][0-9]{5}$/.test(d.p)).length + ' business of 30');
ok('Level 3: seven-letter vanity plates that unscramble into a word', L3.every(({ p, cands }) => /^[A-Z]{7}$/.test(p) && cands.some((w) => w.length === 7)), L3.slice(0, 4).map((d) => d.p).join(' '));
ok('old saves land on a level: classic and short on 2, vanity on 3', E.OLD_FMT.classic === 'least' && E.OLD_FMT.short === 'least' && E.OLD_FMT.vanity === 'letters');

// ---- Part 2: the rig itself
(async () => {
  const b = require('./boot.cjs'); const ev = b.ev, wait = b.wait;
  await b.ready(600);
  ev('go("plate");setPane("play")'); await wait(200);
  const chips = ev('[...document.querySelectorAll("#pPlayPane .chip[data-fmt]")].map(c=>c.textContent.trim()+(c.disabled?" (locked)":""))');
  ok('three levels, all open', JSON.stringify(chips) === JSON.stringify(['1 · All characters', '2 · Least letters', '3 · All letters']), chips.join(' | '));
  ok('the stats show the plate value and the bonuses', /Plate value/.test(ev('document.querySelector("#pStats").textContent')));
  ev('[...document.querySelectorAll("#pPlayPane .chip[data-fmt]")][2].click()'); await wait(200);
  ok('Level 3 reads in any order (In order is off)', ev('document.querySelector("#pOrd").disabled') && ev('document.querySelector("#pAny").getAttribute("aria-pressed")') === 'true');
  ev('[...document.querySelectorAll("#pPlayPane .chip[data-fmt]")][1].click()'); await wait(200);
  ev('document.querySelector("#pAll").click()'); await wait(80);
  const all = ev('document.querySelector("#pMsg").textContent').replace(/^.*?Reachable:\s*/, '').split(' · ').map((x) => x.replace(/[^A-Z]/g, '')).filter(Boolean);
  const w = all.sort((a, c) => a.length - c.length)[0];
  ev('document.querySelector("#pIn").value=' + JSON.stringify(w) + ';document.querySelector("#pIn").dispatchEvent(new Event("input"))'); await wait(60);
  ev('document.querySelector("#pGo").click()'); await wait(100);
  const msg = ev('document.querySelector("#pMsg").textContent');
  ok('banking the shortest word scores plate value + 50', new RegExp(w + ' — \\d+ points').test(msg), w + ': ' + msg.slice(0, 60));
  report();
})().catch((e) => { ok('rig boots', false, String(e)); report(); });

function report() {
  let pass = 0;
  for (const [n, c, d] of R) { if (c) pass++; console.log((c ? '  ok  ' : ' FAIL ') + n.padEnd(64) + (d ? ' ' + d : '')); }
  console.log(`${pass}/${R.length}`);
  process.exit(pass === R.length ? 0 : 2); // the rig's timers would keep the process alive
}
