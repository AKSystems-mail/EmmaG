// standing still: is the body y flat?  and a walking screenshot for the tail
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto('https://emmaga2.web.app/?awake&hour=12&debug&seed=777', { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(3000);
const ys = [];
for (let i = 0; i < 26; i++) { ys.push(await ev('+window.__fluffy.position.y.toFixed(4)')); await sleep(75); }
console.log('idle y', Math.min(...ys).toFixed(3), Math.max(...ys).toFixed(3), JSON.stringify(ys.slice(0, 8)));
// walk and shoot from the side while the tail is up
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(2600);
await ev(`(() => { const f = window.__fluffy; window.__w.tp(f.position.x + 1.0, f.position.z - 1.0); window.__w.zoom(1.1); })()`);
await sleep(400);
await p.screenshot({ path: '/tmp/walk_tail.jpg', quality: 95 });
await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }))`);
const ys2 = [];
for (let i = 0; i < 30; i++) { ys2.push(await ev('+window.__fluffy.position.y.toFixed(4)')); await sleep(75); }
console.log('after stop y', Math.min(...ys2).toFixed(3), Math.max(...ys2).toFixed(3), JSON.stringify(ys2.slice(10, 18)));
await b.close();
