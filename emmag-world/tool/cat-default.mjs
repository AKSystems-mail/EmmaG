// does the DEFAULT url now load the scan, and does it still sit/walk?
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
const seen = [];
p.onRequest?.((r) => { if (r.url().includes('.glb')) seen.push(r.url().split('/models/')[1]); });
await p.goto('https://emmaga2.web.app/?awake&hour=12&debug&seed=777', { timeoutMs: 120000, settleMs: 4500, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(3000);
console.log('glb', await ev(`(() => { const r = performance.getEntriesByType('resource').filter((e) => e.name.includes('/models/')).map((e) => e.name.split('/models/')[1]); return r.join(','); })()`));
console.log('bones', await ev(`(() => { const f = window.__fluffy; const n = []; f.traverse((o) => { if (o.isBone) n.push(o.name); }); return n.length + ' tail5:' + n.includes('tail5') + ' mats:' + window.__w ? [n.length, n.slice(-3)].join(' ') : 'x'; })()`));
await ev(`(() => { const f = window.__fluffy; window.__w.tp(f.position.x + 1.2, f.position.z + 0.9); window.__w.zoom(1.2); })()`);
await sleep(1200);
await ev(`window.__cs = 1; window.__cl = 1`);
await sleep(1800);
await p.screenshot({ path: '/tmp/default_loaf.jpg', quality: 95 });
await b.close();
