// real-browser look with live data in every module: a track playing in State,
// riders mid-lap in Skate, a few chess moves, a Plate word. Then screenshots.
//   node scripts/live.cjs 1440x900 shots/live  state:graph home:hub skate:play
// AUDIO env var overrides the test mp3 path.
const {chromium}=require('playwright');const path=require('path');
const args=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const [vp='1440x900',prefix='shots/live',...pages]=args;
const full=process.argv.includes('--full');
const [w,h]=vp.split('x').map(Number);
const AUDIO=process.env.AUDIO||'/tmp/claude-0/aud/Test Groove.mp3';
(async()=>{
  const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:w<700,hasTouch:w<700});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(__dirname,'..','public','index.html')).catch(()=>{});
  await p.waitForTimeout(1200);
  // State: load and play the track
  await p.evaluate(()=>{go('state');setPane('graph')}); await p.waitForTimeout(300);
  await p.setInputFiles('#wFile',AUDIO); await p.waitForTimeout(700);
  await p.click('#wPlay').catch(()=>{}); await p.waitForTimeout(400);
  // Skate: riders on the circuit
  await p.evaluate(()=>{go('skate');setPane('play')}); await p.waitForTimeout(+(process.env.SKATE_MS||5000));
  // Mate: a short opening, so the geometry has something to say
  if(process.env.MATE!=='0')await p.evaluate(async()=>{go('mate');setPane('play');
    const idx=n=>(8-(+n[1]))*8+'abcdefgh'.indexOf(n[0]);
    const click=n=>{const s=document.querySelector('#board .sq[data-i="'+idx(n)+'"]');s&&s.click()};
    for(const [a,b] of [['e2','e4'],['g1','f3'],['f1','c4'],['d2','d3']]){click(a);await new Promise(r=>setTimeout(r,60));click(b);await new Promise(r=>setTimeout(r,2600))}
  }).catch(()=>{});
  await p.waitForTimeout(600);
  // Plate: bank the two shortest words the plate can make
  if(process.env.PLATE!=='0')await p.evaluate(async()=>{go('plate');setPane('play');
    document.querySelector('#pAll').click(); await new Promise(r=>setTimeout(r,80));
    const all=document.querySelector('#pMsg').textContent.replace(/^.*?Reachable:\s*/,'').split(' · ').map(x=>x.replace(/[^A-Z]/g,'')).filter(Boolean).sort((a,b)=>a.length-b.length);
    for(const w of [all[0],all[Math.min(all.length-1,3)],all.find(x=>x.length>=5)].filter(Boolean)){
      const i=document.querySelector('#pIn'); i.value=w; i.dispatchEvent(new Event('input')); document.querySelector('#pGo').click(); await new Promise(r=>setTimeout(r,300)) }
  }).catch(()=>{});
  // State again so the analyser has several seconds of history
  await p.evaluate(()=>{go('state');setPane('graph')}); await p.waitForTimeout(+(process.env.STATE_MS||5000));
  // RICH=1: a library in Slate and one share from each instrument, the way the
  // Share buttons would make them, so the river and the engine have traffic
  if(process.env.RICH==='1'){
    await p.evaluate(()=>{
      ARC.mods.slate.load({vids:[
        {id:'abcdefghijk',title:'Modal jazz trio — live at the Vanguard',author:'Test channel',crate:'Jazz',pos:1260,dur:2880,added:Date.now()},
        {id:'bcdefghijkl',title:'Blue Note 1960s set',crate:'Jazz',pos:2880,dur:2880,watched:1,added:Date.now()-1e5},
        {id:'cdefghijklm',title:'Jazz trio live set',crate:'Jazz',pos:0,dur:3100,added:Date.now()-2e5},
        {id:'defghijklmn',title:'Cap rate explained',crate:'BRRRR',pos:300,dur:900,added:Date.now()-3e5},
        {id:'efghijklmno',title:'Fela Kuti live',crate:'Afrobeat',pos:0,dur:0,added:Date.now()-4e5}],cur:'abcdefghijk'});
      go('home');
      for(const [f,k,t] of [['state','track','Test Groove · 8 onsets'],['mate','position','Move 5 · -4.6'],['skate','lap','Vortex · lap 1'],['plate','plate','6EGD821'],['slate','video','Modal jazz trio']])
        BUS.post({from:f,kind:k,title:t,body:'harness'});
    });
    await p.waitForTimeout(+(process.env.PK_MS||900));
  }
  let i=0;
  for(const spec of (pages.length?pages:['state:graph','home:hub'])){
    const [id,pane]=spec.split(':');
    await p.evaluate(([a,q])=>{go(a);if(q)setPane(q)},[id,pane]); await p.waitForTimeout(1500);
    if(full){await p.evaluate(()=>{const s=document.querySelector('.mod.on .pane.on .scroll');
      const r=document.getElementById('rig'); if(s){r.style.height='auto';r.style.maxHeight='none';
      s.style.overflow='visible';s.closest('.pane').style.position='relative';s.closest('.mod').style.position='relative';
      document.getElementById('stage').style.position='relative';}}); await p.waitForTimeout(300)}
    const out=prefix+'-'+id+'-'+(pane||'x')+'-'+w+'.png';
    await p.screenshot({path:path.join(__dirname,'..',out),fullPage:full});
    console.log(out); i++;
  }
  console.log('faults',await p.evaluate(()=>JSON.stringify(FAULTS.map(f=>f.where+': '+f.msg))),'| errors',errs.slice(0,3).join(' / ')||'none',
    '| state',await p.evaluate(()=>document.querySelector('#npG')&&document.querySelector('#npG').textContent));
  await b.close();
})();
