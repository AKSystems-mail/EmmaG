// world-space bbox of the loaded cat, for size comparison between candidates
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
for (const cat of ['fluffy', 'fluffy2']) {
  await p.goto(`https://emmaga2.web.app/?awake&hour=12&debug&seed=777&cat=${cat}`, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
  await ev(`document.querySelector('#go')?.click()`);
  await sleep(2500);
  console.log(cat, await ev(`(() => { const f = window.__fluffy; let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
    f.updateWorldMatrix(true, true);
    f.traverse((o) => { if (!o.isMesh) return; const g = o.geometry; g.computeBoundingBox(); const bb = g.boundingBox;
      for (const sx of [bb.min.x, bb.max.x]) for (const sy of [bb.min.y, bb.max.y]) for (const sz of [bb.min.z, bb.max.z]) {
        const v = new o.position.constructor(sx, sy, sz); o.localToWorld(v);
        mn = [Math.min(mn[0],v.x), Math.min(mn[1],v.y), Math.min(mn[2],v.z)];
        mx = [Math.max(mx[0],v.x), Math.max(mx[1],v.y), Math.max(mx[2],v.z)]; } });
    return JSON.stringify({w: +(mx[0]-mn[0]).toFixed(3), h: +(mx[1]-mn[1]).toFixed(3), d: +(mx[2]-mn[2]).toFixed(3)}); })()`));
}
await b.close();
