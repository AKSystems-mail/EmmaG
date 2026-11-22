// verify the scanned balloon sits at camp: force 8 awake stones, teleport, shoot
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 1000, height: 750 });
const p = await b.newPage({ width: 1000, height: 750, dsf: 2 });
const ev = (x) => p.eval(x);
const url = 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777';
await p.goto(url, { timeoutMs: 120000, settleMs: 3500, cacheBust: true });
await ev(`(() => { const k = 'emmaworld.v2'; const s = JSON.parse(localStorage.getItem(k) || '{}');
  s.restored = ['a','b','c','d','e','f','g','h'];
  if (!(s.camps || []).length) s.camps = [{ x: (s.x || 0) + 6, z: (s.z || 0) + 4, props: [] }];
  localStorage.setItem(k, JSON.stringify(s)); return [s.restored.length, s.camps.length]; })()`);
await p.goto(url, { timeoutMs: 120000, settleMs: 4500, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
console.log(await ev(`(() => { const s = window.__w.save; const c = (s.camps || [])[0];
  if (!c) return 'no camps ' + JSON.stringify(Object.keys(s));
  const bx = c.x + 4.9, bz = c.z + 3.6;
  window.__w.tp(bx - 7.5, bz - 5.0);
  window.__w.zoom(9);
  return JSON.stringify({ camp: [c.x, c.z], balloon: [bx, bz] }); })()`));
await sleep(1800);
for (const [i, yaw] of [0, 0.9, 2.1, 3.6].entries()) {
  await ev(`window.__w.look(${yaw})`);
  await sleep(900);
  await p.screenshot({ path: `/tmp/bv_${i}.jpg`, quality: 92 });
}
await b.close();
