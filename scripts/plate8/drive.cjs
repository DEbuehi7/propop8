#!/usr/bin/env node
// Headless page-drive harness for the Plate rig.
// Boots public/index.html in jsdom with enough browser surface that every
// module mounts, then walks every page and every pane and reports FAULTS.
// Usage: node scripts/drive.js [--json] [--dump-canvas mate:viz]

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const FILE = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

// ---- canvas double ---------------------------------------------------------
// Records every 2d call so we can assert a visualization actually drew,
// and what it drew with (gradients, shadows, stroke widths...).
function makeCtx(rec) {
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0,
    shadowColor: 'transparent', lineCap: 'butt', lineJoin: 'miter',
    textAlign: 'start', textBaseline: 'alphabetic', lineDashOffset: 0, filter: 'none' };
  const log = (op, args) => { rec.ops.push(op); rec.n++;
    if (op === 'createLinearGradient') rec.grad.lin++;
    if (op === 'createRadialGradient') rec.grad.rad++;
    if (op === 'createConicGradient') rec.grad.con++;
    if (op === 'setLineDash' && args[0] && args[0].length) rec.dash++;
  };
  const grad = () => ({ addColorStop(){ rec.stops++ } });
  const noop = new Proxy({}, { get: () => () => {} });
  const ctx = {
    canvas: null,
    createLinearGradient(...a){ log('createLinearGradient', a); return grad() },
    createRadialGradient(...a){ log('createRadialGradient', a); return grad() },
    createConicGradient(...a){ log('createConicGradient', a); return grad() },
    createPattern(){ return null },
    measureText(t){ return { width: String(t).length * 6, actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2 } },
    getImageData(x, y, w, h){ return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h } },
    putImageData(){}, createImageData(w, h){ return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h } },
    isPointInPath(){ return false }, getLineDash(){ return [] },
  };
  for (const m of ['save','restore','beginPath','closePath','moveTo','lineTo','arc','arcTo',
    'bezierCurveTo','quadraticCurveTo','rect','roundRect','ellipse','fill','stroke','clip',
    'fillRect','strokeRect','clearRect','fillText','strokeText','translate','rotate','scale',
    'setTransform','resetTransform','transform','setLineDash','drawImage'])
    ctx[m] = (...a) => log(m, a);
  for (const k of Object.keys(state))
    Object.defineProperty(ctx, k, { get(){ return state[k] },
      set(v){ state[k] = v; if (k === 'shadowBlur' && v > 0) rec.shadow++; } });
  return new Proxy(ctx, { get(t, p){ return p in t ? t[p] : (typeof p === 'string' && /^[a-z]/.test(p) ? noop[p] : undefined) } });
}

const canvasRecs = new Map();

// ---- environment -----------------------------------------------------------
const vc = new VirtualConsole();
const consoleErrors = [];
vc.on('jsdomError', e => consoleErrors.push('jsdomError: ' + (e.message || e)));
vc.on('error', (...a) => consoleErrors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost:3000/plate/index.html',
  virtualConsole: vc,
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = function (kind) {
      if (kind !== '2d') return null;
      let rec = canvasRecs.get(this);
      if (!rec) { rec = { ops: [], n: 0, grad: { lin: 0, rad: 0, con: 0 }, stops: 0,
        shadow: 0, dash: 0, id: this.id || '(anon)' }; canvasRecs.set(this, rec); }
      const c = makeCtx(rec); c.canvas = this; return c;
    };
    win.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
    // layout: jsdom reports 0x0 for everything, which makes fitCanvas bail
    win.Element.prototype.getBoundingClientRect = function () {
      const w = this.id === 'rig' || this.tagName === 'BODY' ? 900 : 820;
      const h = this.id === 'rig' || this.tagName === 'BODY' ? 700 : 340;
      return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON(){} };
    };
    Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get(){ return 820 } });
    Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get(){ return 340 } });
    Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get(){ return 820 } });
    Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get(){ return 340 } });

    win.matchMedia = q => ({ matches: false, media: q, addListener(){}, removeListener(){},
      addEventListener(){}, removeEventListener(){}, onchange: null });
    win.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
    win.cancelAnimationFrame = id => clearTimeout(id);
    win.scrollTo = () => {};
    win.HTMLElement.prototype.scrollIntoView = () => {};
    win.HTMLMediaElement.prototype.play = function(){ return Promise.resolve() };
    win.HTMLMediaElement.prototype.pause = function(){};
    win.HTMLMediaElement.prototype.load = function(){};
    win.AudioContext = win.webkitAudioContext = function(){
      const node = () => ({ connect(){ return node() }, disconnect(){}, gain: { value: 1,
        setValueAtTime(){}, linearRampToValueAtTime(){} }, frequency: { value: 440, setValueAtTime(){} },
        type: 'sine', start(){}, stop(){}, fftSize: 2048, frequencyBinCount: 1024,
        smoothingTimeConstant: .8, minDecibels: -90, maxDecibels: -10,
        getByteFrequencyData(a){ for (let i = 0; i < a.length; i++) a[i] = (i * 7 + 40) % 200 },
        getByteTimeDomainData(a){ for (let i = 0; i < a.length; i++) a[i] = 128 + Math.round(40 * Math.sin(i / 9)) },
        getFloatFrequencyData(a){ a.fill(-60) } });
      return { state: 'running', sampleRate: 48000, currentTime: 0, destination: node(),
        createAnalyser: node, createGain: node, createOscillator: node,
        createMediaElementSource: node, createMediaStreamSource: node, createBiquadFilter: node,
        createBufferSource: node, createDynamicsCompressor: node,
        createBuffer: () => ({ getChannelData: () => new Float32Array(1024) }),
        decodeAudioData: () => Promise.resolve({ getChannelData: () => new Float32Array(1024), duration: 1 }),
        resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve() };
    };
    win.MediaRecorder = function(){ return { state: 'inactive', start(){}, stop(){}, ondataavailable: null, onstop: null } };
    win.MediaRecorder.isTypeSupported = () => true;
    win.navigator.mediaDevices = { getUserMedia: () => Promise.reject(new Error('no mic in harness')) };
    win.indexedDB = undefined;              // exercises the no-IDB fallback path
    win.fetch = () => Promise.reject(new Error('Failed to fetch (harness offline)'));
    win.ResizeObserver = function(){ return { observe(){}, unobserve(){}, disconnect(){} } };
    win.IntersectionObserver = function(){ return { observe(){}, unobserve(){}, disconnect(){}, takeRecords: () => [] } };
    win.crypto = win.crypto || {};
    if (!win.crypto.getRandomValues)
      win.crypto.getRandomValues = a => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; return a };
    if (!win.crypto.subtle) win.crypto.subtle = { importKey: () => Promise.resolve({}),
      deriveKey: () => Promise.resolve({}), encrypt: () => Promise.resolve(new ArrayBuffer(16)),
      decrypt: () => Promise.resolve(new ArrayBuffer(16)), digest: () => Promise.resolve(new ArrayBuffer(32)) };
  },
});

const win = dom.window;

// ---- drive -----------------------------------------------------------------
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(400);                                      // let boot + first rAF settle
  // top-level `const` lives in the global lexical environment, not on window —
  // eval in global scope is the only way to reach it from outside.
  const ev = code => win.eval(code);
  let ARC, FAULTS;
  try { ARC = ev('ARC'); FAULTS = ev('FAULTS'); } catch { /* fall through */ }
  if (!ARC) { console.log('FATAL: ARC never initialised'); console.log(consoleErrors.join('\n')); process.exit(1); }

  const report = { pages: [], faults: [], consoleErrors, canvases: [] };
  const totalOps = () => [...canvasRecs.values()].reduce((a, r) => a + r.n, 0);

  for (const id of ARC.order) {
    ev('go(' + JSON.stringify(id) + ')');
    await wait(120);
    const m = ARC.mods[id];
    const page = { id, label: m.label, panes: [] };
    for (const [key, label] of m.panes) {
      ev('setPane(' + JSON.stringify(key) + ')');
      await wait(60);
      const mark = totalOps();
      // run a few frames so tick()-driven visuals actually paint
      for (let i = 0; i < 6; i++) { ARC.safe(() => m.tick && m.tick(0.016, win.performance.now() + i * 16), id); await wait(8); }
      const host = win.document.querySelector(`.mod[data-m="${id}"] .pane[data-p="${key}"]`);
      page.panes.push({ key, label,
        nodes: host ? host.querySelectorAll('*').length : -1,
        on: host ? host.classList.contains('on') : false,
        text: host ? host.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : '(no such pane)',
        canvasOps: totalOps() - mark });
    }
    report.pages.push(page);
  }

  report.faults = (FAULTS || []).map(f => `${f.where}: ${f.msg || f.message || f}`);
  for (const [c, r] of canvasRecs)
    if (r.n) report.canvases.push({ id: c.id || '(anon)', ops: r.n, lin: r.grad.lin,
      rad: r.grad.rad, con: r.grad.con, stops: r.stops, shadow: r.shadow, dash: r.dash });

  if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); }
  else {
    for (const p of report.pages) {
      console.log(`\n── ${p.id}  (${p.label})`);
      for (const q of p.panes)
        console.log(`   ${q.key.padEnd(7)} ${q.on?"on ":"OFF"} nodes=${String(q.nodes).padStart(4)}  frameOps=${String(q.canvasOps).padStart(6)}  ${q.text.slice(0, 70)}`);
    }
    console.log('\n── canvases');
    for (const c of report.canvases)
      console.log(`   #${(c.id || '?').padEnd(10)} ops=${String(c.ops).padStart(6)} grad(lin/rad/con)=${c.lin}/${c.rad}/${c.con} stops=${c.stops} shadow=${c.shadow} dash=${c.dash}`);
    console.log('\n── faults: ' + (report.faults.length ? '\n   ' + report.faults.join('\n   ') : 'none'));
    if (consoleErrors.length) console.log('\n── console errors:\n   ' + consoleErrors.slice(0, 10).join('\n   '));
  }
  process.exit(report.faults.length ? 2 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1) });
