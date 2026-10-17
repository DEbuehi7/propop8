// real-browser look at one page+pane at a given viewport.  node scripts/look.cjs home hub 393x852 out.png [--full] [--warm=ms]
const {chromium}=require('playwright');const path=require('path');
const [id='home',pane='',vp='393x852',out='shots/look.png']=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const full=process.argv.includes('--full');
const warmArg=(process.argv.find(a=>a.startsWith('--warm='))||'').split('=')[1];
const [w,h]=vp.split('x').map(Number);
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:w<700,hasTouch:w<700});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+path.join(__dirname,'..','..','public','plate','index.html')).catch(()=>{});
await p.waitForTimeout(1300);
if(warmArg){ // visit skate first so the circuit has riders mid-lap
  await p.evaluate(()=>{go('skate');setPane('play')}); await p.waitForTimeout(+warmArg); }
await p.evaluate(([i,q])=>{go(i); if(q)setPane(q)},[id,pane]);
await p.waitForTimeout(1600);
if(full){ // unclip the scroller so the whole hub lands in one image
  await p.evaluate(()=>{const s=document.querySelector('.mod.on .pane.on .scroll');
    const r=document.getElementById('rig'); if(s){r.style.height='auto';r.style.maxHeight='none';
    s.style.overflow='visible';s.closest('.pane').style.position='relative';s.closest('.mod').style.position='relative';
    document.getElementById('stage').style.position='relative';}});
  await p.waitForTimeout(400);
}
await p.screenshot({path:path.join(__dirname,'..',out),fullPage:full});
console.log(out,'| faults',await p.evaluate(()=>FAULTS.length),'| errors',errs.slice(0,3).join(' / ')||'none');
await b.close()})();
