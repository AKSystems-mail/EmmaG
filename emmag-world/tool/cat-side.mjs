// same camera, both cats, one PNG each — for a straight size comparison
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
for (const cat of ['fluffy', 'fluffy2']) {
  const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
  const ev = (x) => p.eval(x);
  await p.goto(`https://emmaga2.web.app/?awake&hour=12&debug&seed=777&cat=${cat}`, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
  await ev(`document.querySelector('#go')?.click()`);
  await sleep(2500);
  await ev(`(() => { const f = window.__fluffy; window.__w.tp(f.position.x + 1.1, f.position.z + 1.1); window.__w.zoom(1.0); })()`);
  await sleep(1500);
  await p.screenshot({ path: `/tmp/side_${cat}.jpg`, quality: 95 });
  await p.close();
}
await b.close();
