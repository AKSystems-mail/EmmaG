// audio state has to survive a reload
import { Browser, sleep } from './cdp.mjs';
const b = await Browser.launch({ width: 800, height: 600 });
const p = await b.newPage({ width: 800, height: 600, dsf: 1 });
const ev = (x) => p.eval(x);
const fail = [];
await p.goto('https://emmaga2.web.app/?awake&hour=12&debug', { timeoutMs: 120000, settleMs: 3000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(1200);
const on0 = await ev(`document.querySelector('#mute').textContent`);
await ev(`document.querySelector('#mute').click()`);
await sleep(300);
const off = await ev(`document.querySelector('#mute').textContent`);
const saved = await ev(`JSON.parse(localStorage.getItem('emmaworld.v2') || '{}').mute`);
if (on0 !== '♪' || off !== '✕' || saved !== true) fail.push(`toggle: ${on0} -> ${off}, saved ${saved}`);

await p.goto('https://emmaga2.web.app/?awake&hour=12&debug&v=2', { timeoutMs: 120000, settleMs: 3000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(1200);
const after = await ev(`document.querySelector('#mute').textContent`);
if (after !== '✕') fail.push(`after reload the glyph is ${after}, want ✕`);
await ev(`document.querySelector('#mute').click()`);   // and back on
await sleep(300);
const backOn = await ev(`JSON.parse(localStorage.getItem('emmaworld.v2') || '{}').mute`);
if (backOn !== false) fail.push(`unmute did not clear the flag (${backOn})`);
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'all clear');
await b.close?.();
process.exit(fail.length ? 1 : 0);
