// park the camera on the cat and grab a frame, so the rig can be looked at in the real scene
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(process.argv[2] || 'http://127.0.0.1:5173/?awake&hour=12&debug&seed=777',
  { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2000);
// walk close to the cat, then hold still so it settles into Idle
await ev(`(() => { const f = window.__fluffy.position, q = window.__w.pose();
  window.__w.tp(f.x + 1.1, f.z + 1.1); })()`);
await sleep(1200);
await ev(`window.__w.catDbg && window.__cs !== undefined ? 0 : 0`);
await p.screenshot({ path: '/tmp/cat_ingame.jpg', quality: 92 });
await ev(`window.__cs = 1`);            // force the sit pose the game blends to
await sleep(900);
await p.screenshot({ path: '/tmp/cat_sit.jpg', quality: 92 });
await ev(`window.__cs = 0; window.__cl = 1`);
await sleep(900);
await p.screenshot({ path: '/tmp/cat_loaf.jpg', quality: 92 });
console.log('CLIP', await ev(`JSON.stringify(window.__w.tux())`));
await b.close();
