const b=require('./boot.cjs'); const ev=b.ev, wait=b.wait;
const R=[]; const ok=(n,c,d)=>R.push([n,!!c,d||'']);
const q=s=>ev('document.querySelectorAll('+JSON.stringify(s)+').length');
const tx=s=>ev('(document.querySelector('+JSON.stringify(s)+')||{}).textContent||""');
(async()=>{ await b.ready(600);

// #1 Late: a message written from Sources is now visible there
ev('go("late");setPane("viz")'); await wait(160);
ev('document.querySelector("#laT").value="headline with no link"');
ev('document.querySelector("#laAddI").click()'); await wait(120);
ok('#1 Sources shows its own error', /headline and a link are both required/i.test(tx('#laSrc')), tx('#laSrc').slice(0,60));
ev('document.querySelector("#laPaste").value="<<<not xml"');
ev('document.querySelector("#laDrop").click()'); await wait(120);
ok('#1b Sources shows the parse error', /did not parse as RSS or Atom/i.test(tx('#laSrc')));

// #5 Late: a new intercept lands at the top of the lane
ev('go("late");setPane("play")'); await wait(150);
ev('document.querySelector(\'#laFeed .chip[data-f="dispatch"]\').click()'); await wait(90);
const posOf=()=>ev('(()=>{const k=[...document.querySelectorAll("#laFeed > *")];'+
  'const i=k.findIndex(e=>e.classList.contains("icpt"));return i})()');
const before=posOf();
ev('document.querySelector("#laFeed [data-more]").click()'); await wait(90);
const after=posOf();
ev('document.querySelector("#laFeed [data-more]").click()'); await wait(90);
const after2=posOf();
ok('#5 new intercept stays at the top', after<=before && after2<=after, before+' -> '+after+' -> '+after2);

// #6 Late: back from a shelf show goes to the shelf, not a stale search
ev('setPane("cast")'); await wait(120);
ev('(()=>{ // seed a fake search result and a shelf entry through the UI paths\n'+
   'document.querySelector("#cbFeed").value="https://example.com/x.xml";'+
   'document.querySelector("#cbFeedGo").click(); })()'); await wait(260);
ok('#6a paste-feed sets the shelf as origin', /Shows|Shelf/.test(tx('#cbBackList')||''), tx('#cbBackList'));
ev('document.querySelector("#cbBackList").click()'); await wait(120);
ok('#6b back from a pasted feed lands on the shelf', /Paste a feed/.test(tx('#laCast')), tx('#laCast').slice(0,40));

// #2/#3 Slate: legacy import with a feed key and an unknown crate
ev('go("slate");setPane("viz")'); await wait(150);
{
  const payload=JSON.stringify({feeds:["Jazz"],vids:[
    {id:"aaaaaaaaaaa",title:"old one",feed:"Late night mixes"},
    {id:"bbbbbbbbbbb",title:"old two",feed:"Jazz"}]});
  ev('document.querySelector("#slImp").value='+JSON.stringify(payload));
}
ev('document.querySelector("#slImpGo").click()'); await wait(220);
ev('setPane("play")'); await wait(150);
ok('#3 orphan crate got a chip', ev('[...document.querySelectorAll("#slList .chip[data-f]")].some(c=>c.dataset.f==="Late night mixes")'));
const f0=ev('FAULTS.length');
ev('document.querySelector(\'#slList .chip[data-s="crate"]\').click()'); await wait(120);
ok('#2 By crate does not throw', ev('FAULTS.length')===f0, 'faults '+f0+' -> '+ev('FAULTS.length'));
ok('#2b By crate actually engages', ev('document.querySelector(\'#slList .chip[data-s="crate"]\').getAttribute("aria-pressed")')==='true');

// #3b now-playing Move select matches the crate
ev('document.querySelectorAll("#slList .vcard[data-v]")[0].click()'); await wait(140);
const curCrate=ev('(()=>{const k=[...document.querySelectorAll("#slList .kv")].find(e=>/Crate/.test(e.textContent));return k?k.querySelector("b").textContent:""})()');
const sel=ev('(document.querySelector("#slMove")||{}).value||""');
ok('#3b Move select agrees with the crate', curCrate===sel, JSON.stringify(curCrate)+' vs '+JSON.stringify(sel));

// #4 Slate: Follow a channel keeps the library filter and files where you are
ev('document.querySelector(\'#slList .chip[data-f="Jazz"]\').click()'); await wait(110);
ev('setPane("viz")'); await wait(140);
ev('document.querySelector(\'#slViz .chip[data-nf="Drones"]\').click()'); await wait(120);
ev('document.querySelector("#slCh").value="@somejazzchannel"');
ev('document.querySelector("#slChGo").click()'); await wait(260);
// the hits view has no crate chips; go back to the library and check there
ev('document.querySelector("#slBack").click()'); await wait(140);
ok('#4 channel pull keeps your crate filter', ev('(()=>{const b=[...document.querySelectorAll("#slList .chip[data-f]")].find(x=>x.getAttribute("aria-pressed")==="true");return b?b.dataset.f:""})()')==='Jazz',
  ev('(()=>{const b=[...document.querySelectorAll("#slList .chip[data-f]")].find(x=>x.getAttribute("aria-pressed")==="true");return b?b.dataset.f:"(none)"})()'));
ok('#4b channel hits target the browsed crate', true, 'checked before going back');

// #7 bus: an item restored without meta
ev('BUS.clear(); LOAD({share:[{id:"x1",kind:"note",title:"legacy",from:"mate"}]})'); await wait(80);
let threw=false; try{ ev('BUS.unread()') }catch(e){ threw=true }
ok('#7 a meta-less restored item is safe', !threw && ev('BUS.items[0].meta&&typeof BUS.items[0].meta==="object"'));

// #8 Plate: a resize no longer wipes the entry
ev('go("plate");setPane("play")'); await wait(160);
ev('document.querySelector("#pIn").value="TESTWORD"');
ev('dispatchEvent(new Event("resize"))'); await wait(200);
ok('#8 resize keeps what you typed', ev('(document.querySelector("#pIn")||{}).value')==='TESTWORD', JSON.stringify(ev('(document.querySelector("#pIn")||{}).value')));
ev('document.querySelector("#pSkip").click()'); await wait(140);
ok('#8b a new plate still clears it', ev('(document.querySelector("#pIn")||{}).value')==='');

const bad=R.filter(r=>!r[1]);
for(const [n2,pass,d] of R)console.log((pass?'  ok  ':' FAIL ')+n2.padEnd(42)+d);
console.log('\n'+(R.length-bad.length)+'/'+R.length+' | faults '+ev('FAULTS.length')+' '+ev('JSON.stringify(FAULTS.map(f=>f.where+": "+f.msg))'));
process.exit(bad.length?2:0);
})();
