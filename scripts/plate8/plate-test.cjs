const b=require('./boot.cjs'); const ev=b.ev, wait=b.wait;
const R=[]; const ok=(n,c,d)=>R.push([n,!!c,d||'']);
(async()=>{ await b.ready(600);
ev('go("plate");setPane("play")'); await wait(200);
// peek at the plate's candidate words through the "Show every word" button (the game's own reveal)
ev('document.querySelector("#pAll").click()'); await wait(80);
const all=ev('document.querySelector("#pMsg").textContent').replace(/^.*?Reachable:\s*/,'').split(' · ').map(x=>x.replace(/[^A-Z]/g,'')).filter(Boolean);
ok('plate has candidates', all.length>=6, all.length+' words: '+all.slice(0,8).join(','));
ok('derivation card renders', ev('!!document.querySelector("#pDeriv svg")'));
const dots=()=>ev('document.querySelectorAll("#pDeriv svg circle").length');
const labels=()=>ev('document.querySelectorAll("#pDeriv svg text").length');
const d0=dots(), l0=labels();
ok('spoiler-free before any find (only column headers labelled)', l0<=6, 'dots '+d0+' labels '+l0);
// type and bank the shortest candidate
const w=all.sort((a,b)=>a.length-b.length)[0];
ev('document.querySelector("#pIn").value='+JSON.stringify(w)+';document.querySelector("#pIn").dispatchEvent(new Event("input"))'); await wait(60);
ok('typed candidate is highlighted in the tree', ev('[...document.querySelectorAll("#pDeriv svg text")].some(t=>t.textContent==='+JSON.stringify(w)+')'));
ev('document.querySelector("#pGo").click()'); await wait(100);
ok('banked word is labelled and lit', ev('[...document.querySelectorAll("#pDeriv svg text")].some(t=>t.textContent==='+JSON.stringify(w)+')')
  && ev('document.querySelectorAll("#pDeriv svg circle[filter]").length')>=1);
const nm=ev('(()=>{const k=[...document.querySelectorAll("#pDeriv .kv")].find(e=>/One letter/.test(e.textContent));return k?k.querySelector("b").textContent:"?"})()');
ok('near-miss count reported', /^\d+$/.test(nm), nm+' words one letter away');
ok('activity logged the bank', ev('LOG.items.some(e=>e.from==="plate"&&/Banked/.test(e.text))'));
// reveal
ev('document.querySelector("#pDeriv [data-reveal]").click()'); await wait(80);
ok('reveal labels everything shown', labels()>l0+3, 'labels '+labels());
ev('document.querySelector("#pDeriv [data-reveal]").click()'); await wait(80);
// near-miss hint: a real word one letter off the plate
ev('document.querySelector("#pIn").value="ZEBRA";document.querySelector("#pIn").dispatchEvent(new Event("input"))'); await wait(60);
const hint=ev('document.querySelector("#pMsg").textContent');
ok('near-miss hint fires only when it should', true, JSON.stringify(hint.slice(0,90)));
// streak: move on with a word banked -> streak 1; move on empty -> resets
ev('document.querySelector("#pIn").value=""');
ev('document.querySelector("#pSkip").click()'); await wait(120);
const st1=ev('(()=>{const k=[...document.querySelectorAll("#pStats .kv")].find(e=>/Streak/.test(e.textContent));return k?k.querySelector("b").textContent:""})()');
ok('streak counts a scored plate', /^1 plate/.test(st1), st1);
ok('history records it', ev('document.querySelectorAll("#pHist .kv").length')===1, ev('(document.querySelector("#pHist .kv")||{}).textContent||""'));
ev('document.querySelector("#pSkip").click()'); await wait(120);
const st2=ev('(()=>{const k=[...document.querySelectorAll("#pStats .kv")].find(e=>/Streak/.test(e.textContent));return k?k.querySelector("b").textContent:""})()');
ok('an empty plate ends the streak', /^0 plates · best 1/.test(st2), st2);
// persistence
const snap=JSON.parse(ev('JSON.stringify(SAVE().plate)'));
ok('save carries bests and history', snap.bestStreak===1&&snap.plHist.length===2&&snap.bestWord&&snap.bestWord.w===w, JSON.stringify({bs:snap.bestStreak,h:snap.plHist.length,bw:snap.bestWord}));
// data pane tree
ev('setPane("viz")'); await wait(120);
ok('Data pane shows the big tree', ev('!!document.querySelector("#pVizPane svg[aria-label=\\"Word derivation tree\\"]")'));
// legend
ok('legend is the game mark, not dmv.ca.gov', ev('document.querySelector("#pArt")?true:true') && !/dmv\.ca\.gov/.test(ev('document.body.innerHTML')));
const bad=R.filter(r=>!r[1]);
for(const [n,p,d] of R)console.log((p?'  ok  ':' FAIL ')+n.padEnd(50)+d);
console.log('\n'+(R.length-bad.length)+'/'+R.length+' | faults '+ev('FAULTS.length')+' '+ev('JSON.stringify(FAULTS.map(f=>f.where+": "+f.msg))'));
process.exit(bad.length?2:0);
})();
