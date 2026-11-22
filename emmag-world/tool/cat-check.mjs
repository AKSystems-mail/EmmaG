// the rigged cat: does it arrive, is it the right size, does it stand on the ground,
// and do the clip switches land on clips that exist
import { Browser, sleep } from './cdp.mjs';
const URL_ = process.argv[2] || 'http://127.0.0.1:5173/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
const J = (x) => JSON.parse(x);
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

await p.goto(URL_, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2500);

const tux = J(await ev(`JSON.stringify(window.__w.tux())`));
ok(tux.on, 'the tuxedo path never took over — the cat fell back to the primitives');
ok(['Idle', 'Walk', 'Trot', 'Sit', 'Loaf'].every((c) => tux.clips.includes(c)), `clips missing: ${tux.clips}`);

const box = J(await ev(`(() => {
  const f = window.__fluffy;
  f.updateMatrixWorld(true);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  f.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox;
    for (let i = 0; i < 8; i++) {
      const v = new o.position.constructor(
        i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      v.applyMatrix4(o.matrixWorld);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v.getComponent(k)); hi[k] = Math.max(hi[k], v.getComponent(k)); }
    }
  });
  return JSON.stringify({ min: lo, max: hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] });
})()`));
const [sx, sy, sz] = box.size;
ok(sy > 0.12 && sy < 0.55, `cat stands ${sy.toFixed(2)} m tall — outside a cat`);
ok(sz > 0.4 && sz < 0.95, `cat is ${sz.toFixed(2)} m long — outside a cat`);
ok(Math.abs(box.min[1]) < 0.06, `feet float at ${box.min[1].toFixed(3)} m`);

// walk it and read the clip the animator picks
await ev(`window.__w.tp(window.__w.pose().x + 6, window.__w.pose().z + 6)`);
await sleep(600);
const clipsSeen = new Set();
for (let i = 0; i < 24; i++) {
  await ev(`(() => { const k = window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); })()`);
  clipsSeen.add((await ev(`window.__w.catDbg().clip`)) || '');
  await sleep(220);
}
await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }))`);
ok([...clipsSeen].some((c) => c === 'Walk' || c === 'Trot'), `the cat never left Idle while walking (saw ${[...clipsSeen]})`);

await p.screenshot?.({ path: '/tmp/cat_rigged_live.png' });
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'all clear ' + JSON.stringify({ size: box.size.map((v) => +v.toFixed(2)) }));
await b.close?.();
process.exit(fail.length ? 1 : 0);
