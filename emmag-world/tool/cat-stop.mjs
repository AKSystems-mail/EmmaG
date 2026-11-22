// 30 ms sampling of y/x/z after a stop — is the cat still creeping, or is something else bobbing it?
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
await p.goto('https://emmaga2.web.app/?awake&hour=12&debug&seed=777&cat=fluffy2', { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
await ev(`(() => { window.__s = []; const f = window.__fluffy; const tick = () => {
  window.__s.push([+f.position.y.toFixed(4), +f.position.x.toFixed(3), +f.position.z.toFixed(3)]);
  requestAnimationFrame(tick); }; tick(); return 1; })()`);
await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(2200);
await p.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(2500);
const s = await ev('window.__s.slice(-90)');
const ys = s.map((r) => r[0]);
console.log('frames', s.length, 'y min/max', Math.min(...ys).toFixed(3), Math.max(...ys).toFixed(3));
const moved = s.slice(1).map((r, i) => +(Math.hypot(r[1] - s[i][1], r[2] - s[i][2])).toFixed(4));
console.log('last 24 y', JSON.stringify(ys.slice(-24)));
console.log('last 12 frame move', JSON.stringify(moved.slice(-12)));
await b.close();
