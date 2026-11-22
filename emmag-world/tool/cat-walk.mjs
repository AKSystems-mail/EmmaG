// does the tail rise on a long walk and settle back down when she stops?
import { Browser, sleep } from './cdp.mjs';
const url = process.argv[2];
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(url, { timeoutMs: 120000, settleMs: 4500, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
const probe = () => ev(`(() => { const B = window.__fluffyBones, f = window.__fluffy;
  if (!B || !B.tail5) return 'no bones';
  const v = new (f.position.constructor)(); B.tail5.getWorldPosition(v);
  return JSON.stringify({tailY: +(v.y - f.position.y).toFixed(3), catX: +f.position.x.toFixed(2), catZ: +f.position.z.toFixed(2)}); })()`);
console.log('rest', await probe());
await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))`);
for (let i = 0; i < 6; i++) { await sleep(1000); console.log('walk' + i, await probe()); }
await p.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }))`);
for (let i = 0; i < 5; i++) { await sleep(700); console.log('stop' + i, await probe()); }
await p.screenshot({ path: '/tmp/walk_end.jpg', quality: 95 });
await b.close();
