// stand next to the camp balloon and shoot it from two sides
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 700 });
const p = await b.newPage({ width: 900, height: 700, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto('https://emmaga2.web.app/?awake&hour=12&debug&seed=777', { timeoutMs: 120000, settleMs: 4500, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
console.log(await ev(`(() => { const c = (window.__w.camps || [])[0]; if (!c) return 'no camps';
  window.__w.tp(c.x + 8.4, c.z + 6.0); return JSON.stringify({x: c.x, z: c.z, vis: !!c.balloon && c.balloon.visible}); })()`));
await sleep(1500);
await ev(`window.__w.zoom(1.4)`);
await sleep(900);
await p.screenshot({ path: '/tmp/balloon_a.jpg', quality: 95 });
await sleep(600);
await p.screenshot({ path: '/tmp/balloon_b.jpg', quality: 95 });
await b.close();
