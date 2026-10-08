// Checks for the visual parity sprint: tokens, the instrument shell, the engine,
// the six hero cards reading real state, and the in-app upgrades.
const b = require('./boot.cjs'); const ev = b.ev, wait = b.wait;
const R = []; const ok = (n, c, d) => R.push([n, !!c, d || '']);
const J = s => JSON.parse(ev(s));
(async () => {
  await b.ready(700);

  // ── tokens ────────────────────────────────────────────────────────────
  const T = J('JSON.stringify(TONE)');
  const hsl = h => { const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, bl = parseInt(h.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn; let H = 0;
    if (d) { if (mx === r) H = 60 * (((g - bl) / d) % 6); else if (mx === g) H = 60 * ((bl - r) / d + 2); else H = 60 * ((r - g) / d + 4) }
    return { H: (H + 360) % 360, L: (mx + mn) / 2 } };
  const ids = ['state', 'mate', 'skate', 'plate', 'slate', 'late'];
  ok('six instrument tokens are defined', ids.every(i => /^#[0-9A-F]{6}$/i.test(T[i].c)), ids.map(i => T[i].c).join(' '));
  ok('each hue token is the HSL hue of its accent', ids.every(i => { const d = Math.abs(hsl(T[i].c).H - T[i].h); return Math.min(d, 360 - d) < 3 }),
    ids.map(i => i + ' ' + T[i].h + '/' + hsl(T[i].c).H.toFixed(0)).join(' '));
  const brown = h => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), bl = parseInt(h.slice(5, 7), 16); return r > g && g > bl && hsl(h).L < .35 };
  ok('no pressed-state background reads brown', ids.every(i => !brown(T[i].bg)), ids.map(i => T[i].bg).join(' '));
  ok('the palette is the canonical one: pink, green, blue, vermilion, violet, cyan',
    T.state.c === '#F462A6' && T.mate.c === '#00BE5F' && T.skate.c === '#6496FF' &&
    T.plate.c === '#FE6651' && T.slate.c === '#B97BFD' && T.late.c === '#00BAE1', ids.map(i => T[i].c).join(' '));
  const hs = ids.map(i => hsl(T[i].c).H).sort((a, c) => a - c), gaps = hs.map((h, k) => (hs[(k + 1) % hs.length] - h + 360) % 360);
  ok('no two instruments are near-twins in hue', Math.min(...gaps) >= 25, 'smallest gap ' + Math.min(...gaps).toFixed(0) + '°');

  // ── the shell ─────────────────────────────────────────────────────────
  ev('go("home")'); await wait(900);
  ok('every card carries its instrument icon', ev('[...document.querySelectorAll("#hub .hc .hcg svg")].length') === 6);
  ok('every card has a status pulse', ev('document.querySelectorAll("#hub .hc .hcl .hpu").length') === 6);
  ok('card tabs are the module panes', ev('[...document.querySelectorAll("#hub .hc")].every(c=>c.querySelectorAll(".htb button").length===ARC.mods[c.dataset.id].panes.length)'));
  ev('document.querySelector("#hub .hc[data-id=plate] .htb button[data-pane=viz]").click()'); await wait(150);
  ok('a card tab deep-links to its pane', ev('ARC.cur') === 'plate' && ev('ARC.pane') === 'viz', ev('ARC.cur') + ':' + ev('ARC.pane'));
  ev('go("home")'); await wait(300);
  ok('the rail carries the same icons', ev('[...document.querySelectorAll("#rail .nd")].every(n=>n.querySelector(".ni svg"))'));
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  ok('the control room exists at desktop widths', /@media\(min-width:1360px\)\{[^]*?\.hroom\{display:grid/.test(src));
  // the rail says where you are in the instrument's own colour, and nowhere else
  ok('the current rail key is lit in its instrument colour', /\.nd\[aria-pressed="true"\]\{color:var\(--c2\)[^]*?box-shadow:[^}]*var\(--c\)/.test(src) &&
    /\.nd\[data-go="plate"\]\{--c:var\(--t-plate\)/.test(src));
  ok('five depth cues on the shell', /\.hc\{[^}]*radial-gradient[^}]*var\(--l1s\)[^}]*inset 0 1px 0[^}]*0 22px 44px[^}]*0 0 40px/.test(src) &&
    /\.hc::after\{[^}]*mask:[^}]*content-box/.test(src));
  ok('four depths: field, glass shell, recessed canvas, foreground', /--l0:#07080E[^;]*;[^]*--l1:rgba\(20,22,36,\.72\)[^]*--l2:#04050A/.test(src) &&
    /\.hcm\{[^}]*var\(--l2\)[^}]*inset 0 2px 8px rgba\(0,0,0,\.8\)/.test(src));

  // a live backdrop-filter over a canvas that repaints every frame cost 45fps
  ok('no live blur on the surfaces that hold a moving drawing',
    !/(#stage|\.hc|\.hact|\.gauge|\.hlg)\{[^}]*backdrop-filter:blur/.test(src.replace(/\/\*[^]*?\*\//g, '')),
    (src.match(/[^{}\n]+\{[^}]*backdrop-filter:blur[^}]*\}/g) || []).length + ' blurred surfaces left');

  // ── the engine ────────────────────────────────────────────────────────
  ok('the engine has six satellites and a core', ev('document.querySelectorAll("#hEmb .esat").length') === 6 && ev('!!document.getElementById("engCoreDot")'));
  ev('BUS.post({from:"mate",kind:"position",title:"regress3 packet"})'); await wait(500);
  ok('a share made in this session runs a packet', ev('document.querySelectorAll("#engPk circle").length') >= 1);
  ok('the packet route ends at Late', ev('(()=>{const a=document.querySelector("#engPk animateMotion");return !!a&&/L/.test(a.getAttribute("path"))})()'));

  // ── the six heroes read real state ────────────────────────────────────
  const st = J('JSON.stringify(ARC.mods.state.card())');
  ok('State with no audio says so and is not live', !st.live && /no audio/.test(st.status), st.status);
  const sk = J('JSON.stringify(ARC.mods.skate.card({w:330,h:196}))');
  ok('Skate before racing is on the grid', /on the grid|held/.test(sk.status), sk.status);
  ok('Skate card marks braking from the profile', sk.mini.includes(ev('SK.hazard')));
  ev('go("mate");setPane("play")'); await wait(150);
  ev('document.querySelector("#board .sq[data-i=\\"52\\"]").click()'); await wait(40);
  ev('document.querySelector("#board .sq[data-i=\\"36\\"]").click()'); await wait(2800);
  const mc = J('JSON.stringify(ARC.mods.mate.card({w:330,h:196}))');
  ok('Mate card names the last move in SAN', /LAST<\/text><text[^>]*>[a-hKQRBNO][^<]*</.test(mc.mini), (mc.mini.match(/LAST<\/text><text[^>]*>([^<]*)</) || [])[1]);
  ok('the geometry layer is drawn on the board', ev('document.querySelectorAll("#geomL line, #geomL path").length') > 4);
  ev('document.querySelector("#board .sq[data-i=\\"62\\"]").click()'); await wait(60);
  ok('selecting a piece reports its defenders and attackers', /defended by \d+, attacked by \d+/.test(ev('document.querySelector("#bGeo").textContent')), ev('document.querySelector("#bGeo").textContent'));
  ev('document.querySelector("#board .sq[data-i=\\"62\\"]").click()'); await wait(40);
  ev('document.querySelector("#bGeoT").click()'); await wait(40);
  ok('the Geometry chip turns the layer off', ev('document.querySelector("#geomL").innerHTML') === '');
  ev('document.querySelector("#bGeoT").click()'); await wait(40);
  ok('and the choice is saved', ev('SAVE().mate.geo') === true);

  // ── Plate: chain, lineage, birth ──────────────────────────────────────
  let chainOk = null, detail = '';
  ev('go("plate");setPane("play")'); await wait(80);
  ev('document.querySelector("#pAny").click()'); await wait(80);          // free order: a richer tree
  for (let t = 0; t < 30 && chainOk === null; t++) {
    ev('go("plate");setPane("play")'); await wait(60);
    ev('document.querySelector("#pAll").click()'); await wait(40);
    const all = ev('document.querySelector("#pMsg").textContent').replace(/^.*?Reachable:\s*/, '').split(' · ').map(x => x.replace(/[^A-Z]/g, '')).filter(Boolean);
    const sub0 = (a, c) => { const m = {}; for (const ch of c) m[ch] = (m[ch] || 0) + 1; for (const ch of a) { if (!m[ch]) return false; m[ch]-- } return true };
    // a word with a parent: some reachable word one letter shorter whose letters it contains
    const w = all.filter(x => x.length >= 4 && all.some(y => y.length === x.length - 1 && sub0(y, x))).sort((a, c) => c.length - a.length)[0];
    if (!w) { ev('document.querySelector("#pSkip").click()'); await wait(60); continue }
    ev('document.querySelector("#pIn").value=' + JSON.stringify(w) + ';document.querySelector("#pIn").dispatchEvent(new Event("input"))');
    ev('document.querySelector("#pGo").click()'); await wait(80);
    // what the render right after banking must show: the new node, born, and its lineage on hover
    ok('a banked word is born in the tree', ev("!!document.querySelector('#pDeriv .dn.born[data-w=\"" + w + "\"]')"));
    ev("(()=>{const n=document.querySelector('#pDeriv .dn[data-w=\"" + w + "\"]');n.dispatchEvent(new Event('pointerover',{bubbles:true}))})()"); await wait(30);
    ok('hovering a word lights its lineage', ev('!!document.querySelector("#pDeriv svg.dg.lin") && document.querySelectorAll("#pDeriv .dn.on").length>=2'));
    // spoiler-free: with the reveal off, the markup names found words and nothing else
    const banked = new Set((ev('document.querySelector("#pBank").textContent') || '').split(' · ').map(x => x.replace(/[^A-Z]/g, '')));
    const named = [...new Set((ev('document.querySelector("#pDeriv").innerHTML').match(/data-(?:w|a|b)="([A-Z]+)"/g) || []).map(m => m.replace(/.*="|"/g, '')))];
    ok('the tree markup never names a word you have not found', named.every(x => banked.has(x)),
      named.filter(x => !banked.has(x)).join(' ') || named.length + ' named, all banked');
    // the chain itself reads under an explicit reveal, which is the one place names are allowed
    ev('document.querySelector("[data-reveal]").click()'); await wait(80);
    const edges = J('JSON.stringify([...document.querySelectorAll("#pDeriv path[filter^=\\"url(#dgBloom\\"]")].map(p=>[p.dataset.a,p.dataset.b]))');
    ev('document.querySelector("[data-reveal]").click()'); await wait(80);
    const sub = (a, c) => { const m = {}; for (const ch of c) m[ch] = (m[ch] || 0) + 1; for (const ch of a) { if (!m[ch]) return false; m[ch]-- } return true };
    chainOk = edges.length > 0 && edges.every(([a, c]) => c.length === a.length + 1 && sub(a, c)) && edges.some(([, c]) => c === w);
    detail = w + ' ← ' + edges.map(e => e.join('>')).join(' ');
  }
  ok('the thick chain is a real derivation ending at the banked word', chainOk === true, detail);
  // a level link has a zero-height box; a box-sized filter would erase it (seen on the phone card)
  ok('the chain bloom is sized in user space, so a level link still draws',
    ev('[...document.querySelectorAll("filter[id^=dgBloom]")].every(f=>f.getAttribute("filterUnits")==="userSpaceOnUse")') && ev('document.querySelectorAll("filter[id^=dgBloom]").length') > 0);
  ok('the tree is drawn at the size it is shown', ev('(()=>{const s=document.querySelector("#pDeriv svg.dg");return !!s&&/max-width:\\d+px/.test(s.getAttribute("style"))})()'));

  // ── Late river, Slate progress ────────────────────────────────────────
  ev('go("late");setPane("play")'); await wait(200);
  ok('the Feed opens on the river', ev('!!document.querySelector("#laFeed .lrv svg")'));
  ev('document.querySelector("#laFeed .lrv [data-f=shared]").dispatchEvent(new Event("click",{bubbles:true}))'); await wait(80);
  ok('a tributary filters the river', ev('document.querySelector("#laFeed .chip[data-f=shared]").getAttribute("aria-pressed")') === 'true');
  ev('ARC.mods.slate.load({vids:[{id:"abcdefghijk",title:"t",crate:"Jazz",pos:0,dur:0}],cur:"abcdefghijk"})');
  ev('window.dispatchEvent(new MessageEvent("message",{origin:"https://evil.example",data:JSON.stringify({event:"infoDelivery",info:{currentTime:99,duration:100}})}))'); await wait(30);
  ok('a player message from anywhere else is ignored', ev('SAVE().slate.vids[0].pos') === 0);
  ok('State keeps measuring from the background hook', /o\._up&&o\.bg\)ARC\.safe\(\(\)=>o\.bg\(dt,now\),id\)/.test(src) && /bg\(dt,now\)\{ analyse\(now\) \}/.test(src));

  // ── the deck bar: live status, search ─────────────────────────────────
  ev('go("home")'); await wait(200); ev('deckPaint()');
  // the hub card draws the same tree: it must not name an unfound word either
  {
    const bank = new Set((ev('document.querySelector("#pBank").textContent') || '').split(' · ').map(x => x.replace(/[^A-Z]/g, '')));
    const named = [...new Set((ev('document.querySelector(".hc[data-id=plate] .hcm").innerHTML').match(/data-(?:w|a|b)="([A-Z]+)"/g) || []).map(m => m.replace(/.*="|"/g, '')))];
    ok('the hub card names no unfound word either', named.every(x => bank.has(x)), named.filter(x => !bank.has(x)).join(' ') || named.length + ' named');
  }
  ok('the live indicator is honest when nothing plays', /idle/.test(ev('document.querySelector("#liveInd").textContent')), ev('document.querySelector("#liveInd").textContent'));
  ok('the time-share mark has six instruments', ev('document.querySelectorAll("#tsEmb circle").length') === 7);
  ev('document.querySelector("#srchBtn").click()'); await wait(50);
  ok('search opens', ev('!document.getElementById("srch").hidden'));
  ev('ARC.mods.plate.search("",()=>true).length>=0') ;
  J('JSON.stringify(SAVE().plate)');
  const plateId = ev('(document.querySelector("#pArt svg")||{getAttribute:()=>""}).getAttribute("aria-label").replace(/^.* /,"")');
  ev('document.querySelector("#srIn").value=' + JSON.stringify(plateId.slice(0, 4)) + ';document.querySelector("#srIn").dispatchEvent(new Event("input"))'); await wait(40);
  ok('search finds the plate you are on', ev('[...document.querySelectorAll("#srRes .srr")].some(r=>r.textContent.includes(' + JSON.stringify(plateId) + '))'), plateId);
  // an unfound word must not be searchable
  ev('go("plate");setPane("play")'); await wait(60); ev('document.querySelector("#pAll").click()'); await wait(40);
  const allW = ev('document.querySelector("#pMsg").textContent').replace(/^.*?Reachable:\s*/, '').split(' · ').map(x => x.replace(/[^A-Z]/g, '')).filter(Boolean);
  // found = banked on this plate (the #pBank line) or on an earlier one (plHist)
  const bank = ev('document.querySelector("#pBank").textContent').split(' · ').map(x => x.replace(/[^A-Z]/g, ''));
  const unfound = allW.find(w => !bank.includes(w) && !ev('SAVE().plate.plHist.some(h=>h.words.includes(' + JSON.stringify(w) + '))') && w.length >= 3);
  ok('search never spoils an unfound word', !unfound || ev('!searchAll(' + JSON.stringify(unfound) + ').some(r=>r.from==="plate"&&r.title===' + JSON.stringify(unfound) + ')'), unfound || 'no candidate');
  ev('srClose()');
  ok('Slate\'s transport stays out of the way when Slate is closed', ev('document.getElementById("slTr").hidden'));
  // the word list came from web text: slurs, profanity and porn-spam tokens were taken out.
  // Stored as hashes so this file does not spell them.
  const BLOCK = new Set(["120f6e5b4ea3","8f5083e3e5c7","9915ba2d8222","17bde8b40646","f9d0d9b18ae9","98b52c4b6b7d","e7b98c6aa5b9","16ea09fc78ca","158869a97379","886d51e97ad7","70aafb426695","0be9b885f4a3","c1b4ed05397d","a40ccba874d2","1802d081455e","96c91fa84782","6ac3c336e409","522788b65f01","b690cdbe59f1","85fc17f7069a","45fb7c3b72b6","986c99004163","566f532d486c","517ae3f73216","dd92623b0a4b","796e43a5a8cd","94a2b576a9f5","ad505b0be8a4","99e367bcad7a","0f28c4960d96","13a465fc6616","1600725e92dc","594810adcbee","7bc671151cbf","b81d6dc25832","affc87570066","28f8258878dc","805c0cdff876","8fe1e9c2870c","6556c1a58444","066e6872d931","c2c3b68b4883","11cf8376a157","6dbe0f85a074","9ae315a94e42","937d56e49744","4140197ec795","e99d55248f67","7e85c676fd97","0d335db1f762","d75a838dc758","262f86db0ac7","71ace2cfa542","8c5c04391361","0033728f0fbc","ac3180d2bc33","cd2eb0837c9b","db39009fdacb","f5e1107953d7","9ddcab3ac361","dcd2ee35085f","b9c4682d9f63","6ccffa4977d4","09cc1b93ceee","c183fffb6c55","64e8abab66c8","dc10e452bd36","d5273ab90605"]);
  const encD = src.match(/const DICT=\(\(\)=>\{const enc="([^"]+)"/)[1], DW = [];
  { let prev = "", i = 0; while (i < encD.length) { const n = +encD[i]; i++; let t = ""; while (i < encD.length && (encD[i] < "0" || encD[i] > "9")) { t += encD[i]; i++ } const w = prev.slice(0, n) + t; DW.push(w); prev = w } }
  const dictHits = DW.filter(w => BLOCK.has(require("crypto").createHash("sha256").update(w).digest("hex").slice(0, 12)));
  ok("the Plate dictionary carries no slurs, profanity or porn tokens", dictHits.length === 0 && DW.length > 10000, dictHits.length + " hits");
  ok('Late has a podcast scope', ev('!!document.getElementById("cbViz")'));

  const bad = R.filter(r => !r[1]);
  for (const [n, p, d] of R) console.log((p ? '  ok  ' : ' FAIL ') + n.padEnd(62) + String(d).slice(0, 90));
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' | faults ' + ev('FAULTS.length') + ' ' + ev('JSON.stringify(FAULTS.map(f=>f.where+": "+f.msg))'));
  process.exit(bad.length ? 2 : 0);
})();
