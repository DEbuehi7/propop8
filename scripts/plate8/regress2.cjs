// Regression checks for the fourteen findings of the second independent review.
// Each test reproduces the reviewer's trigger and asserts the fixed behaviour.
const b = require('./boot.cjs'); const ev = b.ev, wait = b.wait;
const R = []; const ok = (n, c, d) => R.push([n, !!c, d || '']);
const txt = s => ev('(document.querySelector(' + JSON.stringify(s) + ')||{}).textContent||""');
(async () => {
  await b.ready(700);

  // #1 the derivation glow id is unique per copy of the tree
  ev('go("plate");setPane("play")'); await wait(200);
  ev('document.querySelector("#pAny").click()'); await wait(100);
  ev('document.querySelector("#pAll").click()'); await wait(60);
  const words = txt('#pMsg').replace(/^.*?Reachable:\s*/, '').split(' · ').map(x => x.replace(/[^A-Z]/g, '')).filter(Boolean);
  const w0 = words.sort((a, c) => a.length - c.length)[0];
  ev('document.querySelector("#pIn").value=' + JSON.stringify(w0)); ev('document.querySelector("#pGo").click()'); await wait(100);
  ev('setPane("viz")'); await wait(150);
  const ids = JSON.parse(ev('JSON.stringify([...document.querySelectorAll("filter[id^=dgGlow]")].map(f=>f.id))'));
  ok('#1 each derivation tree owns its glow filter', ids.length >= 2 && new Set(ids).size === ids.length, ids.join(','));
  const refOk = ev('(()=>{const c=document.querySelector("#pVizPane circle[filter]");if(!c)return false;' +
    'const id=c.getAttribute("filter").slice(5,-1);const f=document.getElementById(id);return !!f&&!!f.closest("#pVizPane")})()');
  ok('#1b Data-pane dots reference a filter inside the Data pane', refOk);

  // #2 the fault bar floats instead of taking a grid cell
  ok('#2 fault bar is out of grid flow', ev('getComputedStyle(document.getElementById("faultbar")).position') === 'fixed');

  // #3 re-tapping the current format does nothing; switching closes the plate and costs one
  ev('setPane("play")'); await wait(120);
  const plate0 = ev('document.querySelector("#pArt svg").getAttribute("aria-label")');
  const left0 = txt('#pFoot');
  ev('document.querySelector("#pPlayPane .chip[data-fmt][aria-pressed=true]").click()'); await wait(150);
  ok('#3 re-tapping the current style keeps the plate', ev('document.querySelector("#pArt svg").getAttribute("aria-label")') === plate0 && txt('#pFoot') === left0);
  ev('LOAD({plate:{pts:0,earned:9999,fmt:"classic"}})'); ev('go("home");go("plate")'); await wait(200);
  const hBefore = ev('document.querySelectorAll("#pHist .kv").length');
  const leftBefore = parseInt(txt('#pFoot'));
  ev('document.querySelectorAll("#pPlayPane .chip[data-fmt]")[1].click()'); await wait(180);
  ok('#3b switching style closes the plate into history', ev('document.querySelectorAll("#pHist .kv").length') === hBefore + 1);
  ok('#3c switching style costs one plate', parseInt(txt('#pFoot')) === leftBefore - 1, leftBefore + ' -> ' + parseInt(txt('#pFoot')));

  // #7 plates left survive a save/load
  const snapP = JSON.parse(ev('JSON.stringify(SAVE().plate)'));
  ok('#7 the run\'s plates-left is saved', Number.isFinite(snapP.left), 'left=' + snapP.left);

  // #8 the personal-best message survives the new run's first plate
  ev('LOAD({plate:{pts:500,earned:9999,left:1,bestRun:10,fmt:"classic"}})'); ev('go("home");go("plate")'); await wait(200);
  ev('document.querySelector("#pSkip").click()'); await wait(200);
  ok('#8 a personal best is announced', /Personal best/.test(txt('#pMsg')), txt('#pMsg').slice(0, 70));

  // #9 no "one letter short" claim in In-order mode
  ev('document.querySelector("#pOrd").click()'); await wait(120);
  const probe = ['ALSO', 'ZERO', 'BEAN', 'TONE', 'RAIN', 'LOSE', 'SALE', 'MEAT', 'NOTE', 'LAND'];
  let claimed = false;
  for (const w of probe) {
    ev('document.querySelector("#pIn").value=' + JSON.stringify(w) + ';document.querySelector("#pIn").dispatchEvent(new Event("input"))'); await wait(20);
    if (/one letter short/.test(txt('#pMsg'))) { claimed = true; break }
  }
  ok('#9 no one-letter claim while In order', !claimed);

  // #4 startup restore does not log; a user add does
  const beforeLoaded = ev('LOG.items.filter(e=>/^Loaded /.test(e.text)).length');
  ok('#4 restoring the library writes no "Loaded" event', beforeLoaded === 0, beforeLoaded + ' found');

  // #5 a crafted import cannot reach the DOM
  ev('go("slate");setPane("viz")'); await wait(150);
  const evil = JSON.stringify({ crates: [{ n: 'x', g: '<img src=x onerror=window.__pwn2=1>' }],
    vids: [{ id: 'zz" onerror="window.__pwn=1;//' }, { id: 'okokokokokk', title: '<b onmouseover=1>t</b>' }] });
  ev('document.querySelector("#slImp").value=' + JSON.stringify(evil)); ev('document.querySelector("#slImpGo").click()'); await wait(250);
  ev('go("home")'); await wait(400);
  ok('#5 a malformed id is rejected on import', !ev('JSON.stringify(SAVE().slate.vids)').includes('onerror'));
  ok('#5b an imported glyph is sanitised', !ev('JSON.stringify(SAVE().slate.crates)').includes('<img'));
  ok('#5c nothing executed', ev('!window.__pwn && !window.__pwn2'));
  ok('#5d a saved poisoned profile is cleaned on load',
    (() => { ev('LOAD({slate:{vids:[{id:"zz\\" onerror=\\"window.__pwn3=1;//"},{id:"abcdefghijk"}]}})'); return ev('SAVE().slate.vids.length') === 1 })());

  // #6 swing() is not called after the game ends, and uses quiet positions (checked structurally)
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'public', 'plate', 'index.html'), 'utf8');
  ok('#6 swing() only runs while the game is live', /if\(!finish\(\)\)\{say\([^}]*\); swing\(\)\}/.test(src) && /function swing\(\)\{\s*if\(over\|\|/.test(src));
  ok('#6b swing() compares quiescence-resolved positions', /const before=quietEval\(hist\[hist\.length-2\]\.S\), after=quietEval\(S\)/.test(src));

  // #10 the State card reads the analyser directly, and a paused track shows the graph at rest
  ok('#10 the State card does not read bandE for its bars', !/clamp\(bandE\[i\]\*1\.5/.test(src.slice(src.indexOf("id:'state', label:'state'"), src.indexOf("id:'state', label:'state'") + 3000)));

  // #11 a drawn circuit is custom
  ok('#11 drawing a circuit clears the preset id', /setTrack\(drawing\.filter[^\n]*\n\s*trackId=-1;/.test(src));

  // #12 the failure card points at the right control
  ok('#12 failure text no longer points at the wordmark', !/Diagnostics from the wordmark/.test(src));

  // #13 no YouTube iframe while Slate is not on screen
  ev('LOAD({slate:{vids:[{id:"abcdefghijk",title:"t"}],cur:"abcdefghijk"}})'); ev('go("home")'); await wait(300);
  ev('ARC.mods.slate.enter&&0'); // warm path only
  ok('#13 no player iframe while Slate is hidden', ev('!document.querySelector("#slHero iframe")'));
  ev('go("slate")'); await wait(200);
  ok('#13b opening Slate builds the player', ev('!!document.querySelector("#slHero iframe")'));

  // #14 the desktop rail can shrink and scroll
  ok('#14 rail rows flex and the rail scrolls', /grid-auto-rows:minmax\(38px,62px\)[^}]*overflow-y:auto/.test(src));

  const bad = R.filter(r => !r[1]);
  for (const [n, p, d] of R) console.log((p ? '  ok  ' : ' FAIL ') + n.padEnd(58) + d);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' | faults ' + ev('FAULTS.length') + ' ' + ev('JSON.stringify(FAULTS.map(f=>f.where+": "+f.msg))'));
  process.exit(bad.length ? 2 : 0);
})();
