// A/B the cat: sit, loaf and a walk, from the side, at shipped scale
import { Browser, sleep } from './cdp.mjs';
const base = process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(base, { timeoutMs: 120000, settleMs: 4500, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(3000);
console.log('bones', await ev(`(() => { const B = window.__fluffyBones || {}; return Object.keys(B).length; })()`));
console.log('size', await ev(`(() => { const f = window.__fluffy; const box = new (Object.getPrototypeOf(f.position).constructor)(); return JSON.stringify(window.__w.catSize ? window.__w.catSize() : null); })()`));
await ev(`(() => { window.__w.tp(window.__fluffy.position.x + 1.4, window.__fluffy.position.z + 0.4); window.__w.zoom(1.3); })()`);
await sleep(1200);
await p.screenshot({ path: '/tmp/ab_scene.jpg', quality: 95 });
for (const [tag, setup] of [['sit', `window.__cs = 1; window.__cl = 0`], ['loaf', `window.__cs = 1; window.__cl = 1`], ['stand', `window.__cs = 0; window.__cl = 0`]]) {
  await ev(`(() => { ${setup}; })()`);
  await sleep(1600);
  const at = await ev(`(() => { const f = window.__fluffy, c = window.__w.camera; const v = c.position.clone().set(f.position.x, f.position.y + 0.25, f.position.z).project(c); return JSON.stringify([Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]); })()`);
  await p.screenshot({ path: `/tmp/ab_${tag}.jpg`, quality: 95 });
  console.log(tag, at);
}
await b.close();
