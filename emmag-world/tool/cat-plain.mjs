// one plain look at the cat at its shipped scale (cat-closeup scales it 5x for inspection)
import { Browser, sleep } from './cdp.mjs';
const url = process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(url, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
console.log('tux', await ev(`JSON.stringify(window.__w.tux())`));
await ev(`(() => { const f = window.__fluffy.position; window.__w.tp(f.x + 0.7, f.z + 1.1); window.__w.zoom(1.6); window.__cs = 1; window.__cl = 0; })()`);
await sleep(2500);
console.log('at', await ev(`(() => { const f = window.__fluffy, c = window.__w.camera; const v = c.position.clone().set(f.position.x, f.position.y + 0.3, f.position.z).project(c); return JSON.stringify([Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]); })()`));
await p.screenshot({ path: '/tmp/cat_plain.jpg', quality: 95 });
await b.close();
