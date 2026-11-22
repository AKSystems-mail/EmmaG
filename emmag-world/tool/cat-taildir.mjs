// tail direction: rest vs walking.  up = +y with a short horizontal reach
import { Browser, sleep } from './cdp.mjs';
const cat = process.argv[2] || 'fluffy2';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
await p.goto(`https://emmaga2.web.app/?awake&hour=12&debug&seed=777&cat=${cat}`, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
const dir = () => ev(`(() => { const B = window.__fluffyBones; const V = window.__fluffy.position.constructor;
  const a = new V(), c = new V(); B.tail1.getWorldPosition(a); B.tail5.getWorldPosition(c);
  const d = c.clone().sub(a); const h = Math.hypot(d.x, d.z);
  return JSON.stringify({dy: +d.y.toFixed(2), horiz: +h.toFixed(2), degFromUp: Math.round(Math.atan2(h, d.y) * 180 / Math.PI)}); })()`);
console.log(cat, 'rest', await dir());
await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(2200);
for (let i = 0; i < 3; i++) { console.log(cat, 'walk', await dir()); await sleep(400); }
await p.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(1500);
console.log(cat, 'settled', await dir());
await b.close();
