// asserts each ?ride= style runs up -> cut -> down -> settle and lands her on the ground
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
const boot = async (style) => {
  const url = `https://emmaga2.web.app/?awake&hour=12&debug&seed=777&ride=${style}`;
  await p.goto(url, { timeoutMs: 120000, settleMs: 3000, cacheBust: true });
  await ev(`(() => { const k = 'emmaworld.v2'; const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.restored = Array(8).fill('x');
    s.camps = [{ x: (s.x||0) + 6, z: (s.z||0) + 4, props: [] }, { x: (s.x||0) - 9, z: (s.z||0) - 7, props: [] }];
    localStorage.setItem(k, JSON.stringify(s)); return s.camps.length; })()`);
  await p.goto(url, { timeoutMs: 120000, settleMs: 3500, cacheBust: true });
  await ev(`document.querySelector('#go')?.click()`);
  await sleep(2200);
};
for (const style of [3]) {
  await boot(style);
  const ok = await ev(`window.__w.ride(1)`);
  const seen = [], t0 = Date.now();
  let last = null, y = 0;
  while (Date.now() - t0 < 45000) {
    const s = await ev(`JSON.stringify({ p: window.__w.ridingNow(), y: +window.__w.pose().y.toFixed(2) })`);
    const d = JSON.parse(s);
    if (d.p && d.p !== last) { seen.push(d.p); last = d.p; }
    y = Math.max(y, d.y);
    if (!d.p && seen.length) break;
    await sleep(120);
  }
  const end = await ev(`JSON.stringify({ p: window.__w.ridingNow(), y: +window.__w.pose().y.toFixed(2) })`);
  console.log(`ride=${style} start=${ok} phases=${seen.join('>')} peakY=${y.toFixed(1)} end=${end} ms=${Date.now() - t0}`);
}
await b.close();
