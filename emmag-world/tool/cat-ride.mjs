// long walk then stop, sampled at ~60 fps: tail tip height, cadence and body bob
import { Browser, sleep } from './cdp.mjs';
const url = process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
await p.goto(url, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
const startSampling = () => ev(`(() => { if (!window.__samp) window.__samp = []; return 1; })()`);
const sample = () => ev(`(() => { const f = window.__fluffy, B = window.__fluffyBones; const v = new f.position.constructor();
  B.tail5.getWorldPosition(v);
  window.__samp.push([+f.position.y.toFixed(4), +(v.y - f.position.y).toFixed(4), +f.position.x.toFixed(3), +f.position.z.toFixed(3)]);
  return window.__samp.length; })()`);
await startSampling();
await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))`);
for (let i = 0; i < 40; i++) { await sample(); await sleep(75); }
await p.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }))`);
for (let i = 0; i < 40; i++) { await sample(); await sleep(75); }
const s = await ev('window.__samp');
const walk = s.slice(8, 36), stop = s.slice(42);
const ys = stop.map((r) => r[0]);
const tailW = walk.map((r) => r[1]), tailS = stop.map((r) => r[1]);
const dist = Math.hypot(walk.at(-1)[2] - walk[0][2], walk.at(-1)[3] - walk[0][3]);
const bumps = ys.slice(1).map((y, i) => +(y - ys[i]).toFixed(3)).filter((d) => Math.abs(d) > 0.004);
console.log('walked m', dist.toFixed(2), 'samples', walk.length);
console.log('tail walk min/max', Math.min(...tailW).toFixed(3), Math.max(...tailW).toFixed(3), 'settle', tailS.at(-1).toFixed(3));
console.log('body y after stop', Math.min(...ys).toFixed(3), Math.max(...ys).toFixed(3), 'jumps', JSON.stringify(bumps.slice(0, 6)));
await b.close();
