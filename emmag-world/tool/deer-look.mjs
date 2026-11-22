// daylight look at a deer: spawn one in front of the camera and shoot it
import { Browser, sleep } from './cdp.mjs';
const url = process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(url, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);
console.log('spawn', await ev(`window.__w.deerSpawn('${process.argv[3] || 'doe'}', 7)`));
console.log('big', await ev(`window.__w.doeBig(2.5)`));
await sleep(1500);
console.log('mats', await ev(`(() => { const o = []; window.__w.scene.traverse((m) => { if (m.isMesh && m.material && /^(Main|Fur)/.test(m.material.name || '')) o.push(m.material.name + '#' + m.material.color.getHexString()); }); return JSON.stringify(o); })()`));
await p.screenshot({ path: '/tmp/deer_day.jpg', quality: 95 });
await b.close();
