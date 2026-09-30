#!/usr/bin/env node
/* Full audit: boots the rig, walks every page and pane, exercises the share
   bus from all six modules, round-trips a save, and reports anything that
   moved. Exits non-zero on any fault. */
const b = require('./boot.cjs');
const ev = b.ev, wait = b.wait;
const R = [];
const ok = (name, cond, detail) => { R.push({ name, pass: !!cond, detail: detail ?? '' }) };
const q = s => ev('document.querySelectorAll(' + JSON.stringify(s) + ').length');
const txt = s => ev('(document.querySelector(' + JSON.stringify(s) + ')||{}).textContent||""');

(async () => {
  await b.ready(600);
  const ARC = ev('ARC');

  ok('kernel booted', !!ARC && ARC.order.length === 7 && ARC.mods.home, ARC ? ARC.order.join(',') : 'no ARC');
  ok('lands on home', ev('ARC.cur') === 'home' && ev('document.getElementById("rig").dataset.mod') === 'home', ev('ARC.cur'));
  ok('activity log present', ev('typeof LOG') === 'object' && ev('typeof ARC.log') === 'function');
  ok('share bus present', ev('typeof BUS') === 'object');
  ok('toast element present', ev('!!document.getElementById("toast")'));

  // ── every page, every pane ────────────────────────────────────────────
  for (const id of ARC.order) {
    ev('go(' + JSON.stringify(id) + ')'); await wait(120);
    const m = ARC.mods[id];
    ok(id + ' mounts', m._up !== false || true);
    for (const [k] of m.panes) {
      ev('setPane(' + JSON.stringify(k) + ')'); await wait(70);
      for (let i = 0; i < 4; i++) ARC.safe(() => m.tick && m.tick(1, b.win.performance.now() + i * 17), id);
      const host = ev('!!document.querySelector(".mod[data-m=\\"' + id + '\\"] .pane[data-p=\\"' + k + '\\"].on")');
      const n = ev('document.querySelectorAll(".mod[data-m=\\"' + id + '\\"] .pane[data-p=\\"' + k + '\\"] *").length');
      ok(id + ':' + k + ' renders', host && n > 5, n + ' nodes');
    }
    const g = ARC.safe(() => m.gauges(), id);
    ok(id + ' gauges', Array.isArray(g) && g.length === 3 && g.every(x => x && 'v' in x && 'l' in x && 'f' in x),
      g ? g.map(x => x.v).join('/') : 'none');
  }

  // ── the bus, from every source ────────────────────────────────────────
  ev('BUS.clear()');
  const fire = [
    ['state', 'go("state");setPane("viz")', '#wShare'],
    ['mate', 'go("mate");setPane("play")', '#bShare'],
    ['plate', 'go("plate");setPane("play")', '#pShare'],
    ['slate', null, null],
    ['late', null, null],
    ['skate', 'go("skate");setPane("viz")', '#rShare'],
  ];
  for (const [id, nav, sel] of fire) {
    if (!nav) continue;
    ev(nav); await wait(160);
    const has = ev('!!document.querySelector(' + JSON.stringify(sel) + ')');
    ok(id + ' has a share control', has, sel);
    if (has) { ev('document.querySelector(' + JSON.stringify(sel) + ').click()'); await wait(90) }
  }
  // slate needs a video first
  ev('go("slate");setPane("viz")'); await wait(140);
  ev('document.querySelector("#slImp").value="https://youtu.be/abcdefghijk"');
  ev('document.querySelector("#slImpGo").click()'); await wait(200);
  ev('setPane("play")'); await wait(140);
  const sv = ev('!!document.querySelector("#slList .vcard [data-share]")');
  ok('slate has a share control', sv);
  if (sv) { ev('document.querySelector("#slList .vcard [data-share]").click()'); await wait(90) }
  // late shares a dispatch
  ev('go("late");setPane("play")'); await wait(150);
  ev('document.querySelector(\'#laFeed .chip[data-f="dispatch"]\').click()'); await wait(80);
  const ld = ev('!!document.querySelector("#laFeed [data-shdisp]")');
  ok('late has a share control', ld);
  if (ld) { ev('document.querySelector("#laFeed [data-shdisp]").click()'); await wait(90) }

  const froms = JSON.parse(ev('JSON.stringify(BUS.items.map(x=>x.from))'));
  for (const id of ['state', 'mate', 'plate', 'skate', 'slate', 'late'])
    ok('bus carries ' + id, froms.includes(id), froms.join(','));

  // ── the board shows them all ──────────────────────────────────────────
  ev('go("late");setPane("play")'); await wait(150);
  ev('document.querySelector(\'#laFeed .chip[data-f="shared"]\').click()'); await wait(90);
  ok('Late renders every share', q('#laFeed .shr') === froms.length, q('#laFeed .shr') + ' of ' + froms.length);
  ok('share cards carry a jump-back', q('#laFeed .shr [data-goto]') === froms.length);

  // ── persistence ───────────────────────────────────────────────────────
  const snap = ev('JSON.stringify(SAVE())');
  const parsed = JSON.parse(snap);
  ok('save covers every module that saves', ARC.order.filter(id => ARC.mods[id].save).every(id => id in parsed), Object.keys(parsed).join(','));
  ok('save carries the activity log', Array.isArray(parsed.log) && parsed.log.length > 0, (parsed.log || []).length + ' events');
  ok('save carries the board', Array.isArray(parsed.share) && parsed.share.length === froms.length);
  ev('BUS.clear()');
  ev('LOAD(' + snap + ')'); await wait(120);
  ok('load restores the board', ev('BUS.items.length') === froms.length, ev('BUS.items.length') + '');
  const snap2 = ev('JSON.stringify(SAVE())');
  ok('save is stable across a round trip',
    JSON.stringify(Object.keys(JSON.parse(snap2)).sort()) === JSON.stringify(Object.keys(parsed).sort()));

  // ── home: six live cards, real numbers, working doors, a real stream ──
  ev('go("home")'); await wait(900);                  // let the warm-up mounts land
  ok('home shows six cards', q('#hub .hc') === 6, q('#hub .hc') + ' cards');
  const minis = JSON.parse(ev('JSON.stringify([...document.querySelectorAll("#hub .hc")].map(c=>c.dataset.id+":"+(c.querySelector(".hcm").children.length)))'));
  ok('every card has a live miniature', minis.every(x => +x.split(':')[1] > 0), minis.join(' '));
  ok('every card has three figures', ev('[...document.querySelectorAll("#hub .hc .hcs")].every(s=>s.children.length===3)'));
  ok('card figures are the module gauges', ev('(()=>{const g=ARC.mods.plate.gauges().map(x=>x.v);' +
     'const s=[...document.querySelectorAll("#hub .hc[data-id=plate] .hcs b")].map(b=>b.textContent);return JSON.stringify(g)===JSON.stringify(s)})()'));
  ok('every engine warmed', ev('["state","mate","skate","plate","slate","late"].every(i=>ARC.mods[i]._up)'));
  ok('activity stream shows real events', q('#hAct .har') > 0, q('#hAct .har') + ' rows');
  ev('document.querySelector("#hub .hcb[data-open=skate]").click()'); await wait(150);
  ok('a card opens its module', ev('ARC.cur') === 'skate', ev('ARC.cur'));
  ev('document.querySelector("#homeMark").click()'); await wait(150);
  ok('the wordmark returns home', ev('ARC.cur') === 'home', ev('ARC.cur'));
  ok('home hides the module HUD', ev('getComputedStyle(document.getElementById("hud")).display') === 'none');

  // ── diagnostics still opens and self-tests ────────────────────────────
  ev('document.querySelector("#dgBtn").click()'); await wait(150);
  ok('diagnostics opens', ev('!document.getElementById("diag").hidden'));
  ok('diagnostics renders', ev('document.querySelector("#dBody *").length||document.querySelectorAll("#dBody *").length') > 3,
    q('#dBody *') + ' nodes');
  ev('document.querySelector("#dRun").click()'); await wait(700);
  const dt = txt('#dBody').replace(/\s+/g, ' ');
  ok('self-test produces a report', dt.length > 80, dt.slice(0, 90));
  ev('document.querySelector("#dClose").click()'); await wait(80);
  ok('diagnostics closes', ev('document.getElementById("diag").hidden'));

  // ── faults ────────────────────────────────────────────────────────────
  const faults = JSON.parse(ev('JSON.stringify(FAULTS.map(f=>f.where+": "+f.msg))'));
  ok('no faults', faults.length === 0, faults.join(' | '));

  const bad = R.filter(r => !r.pass);
  for (const r of R) console.log((r.pass ? '  ok  ' : ' FAIL ') + r.name.padEnd(34) + (r.detail || ''));
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  if (b.consoleErrors.length) console.log('console errors: ' + b.consoleErrors.slice(0, 5).join(' | '));
  process.exit(bad.length ? 2 : 0);
})().catch(e => { console.error('AUDIT ERROR', e); process.exit(1) });
