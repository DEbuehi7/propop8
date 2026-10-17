#!/usr/bin/env node
// Headless page-drive harness for the Plate rig.
// Boots public/plate/index.html in jsdom with enough browser surface that
// every module mounts, then walks every page and every pane and reports FAULTS.
// Usage: node scripts/plate8/drive.cjs [--json] [--dump-canvas mate:viz]

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// Was '..', 'public', 'index.html' -- stale from before Plate8 moved under
// public/plate/, and one '..' short of the repo root besides. Every harness
// script in this directory requires boot.cjs, so this one path drives all of
// them; fixed here rather than worked around per-script.
const FILE = path.join(__dirname, '..', '..', 'public', 'plate', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

// ---- canvas double ---------------------------------------------------------
// Records every 2d call so we can assert a visualization actually drew,
// and what it drew with (gradients, shadows, stroke widths...).
function makeCtx(rec) {
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0,
    shadowColor: 'transparent', lineCap: 'butt', lineJoin: 'miter',
    textAlign: 'start', textBaseline: 'alphabetic', lineDashOffset: 0, filter: 'none' };
  const log = (op, args) => { if(rec.ops.length<4000)rec.ops.push(op); rec.n++;
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

const wait = ms => new Promise(r => setTimeout(r, ms));
module.exports = { win, dom, canvasRecs, consoleErrors, wait,
  ev: code => win.eval(code),
  ready: async (ms = 400) => { await wait(ms); return win.eval('typeof ARC!=="undefined"') } };
