// what is actually standing around the player: every scene child within 16 m
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 1000, height: 700 });
const p = await b.newPage({ width: 1000, height: 700, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777',
  { timeoutMs: 120000, settleMs: 5000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(3000);
console.log(await ev(`(() => {
  const scene = window.__fluffy.parent, me = window.__w.pose();
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh && !o.isGroup) return;
    if (o.isMesh && o.parent && o.parent.isMesh) return;
    const wp = new o.position.constructor(); o.getWorldPosition(wp);
    const d = Math.hypot(wp.x - me.x, wp.z - me.z);
    if (d > 16) return;
    let sz = 0, n = 0, skinned = 0, mat = '';
    o.traverse((c) => { if (c.isMesh) { n++; if (c.isSkinnedMesh) skinned++;
      c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox;
      sz = Math.max(sz, bb.getSize(new c.position.constructor()).length());
      if (!mat && c.material) mat = (c.material.name || c.material.type) + ':' + (c.material.color ? c.material.color.getHexString() : '-'); } });
    if (!n) return;
    out.push({ name: o.name || o.type, d: +d.toFixed(1), meshes: n, skinned, size: +sz.toFixed(2), mat });
  });
  return JSON.stringify(out.sort((a, b) => a.d - b.d).slice(0, 40), null, 0);
})()`));
await p.screenshot({ path: '/tmp/probe_scene.jpg', quality: 92 });
await b.close();
