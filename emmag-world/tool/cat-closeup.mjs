// orbit the camera around the cat in the real scene and grab close-ups from four sides,
// so a pose can be judged the way it is seen in game instead of from a render
import { Browser, sleep } from './cdp.mjs';
const url = process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 2 });
const ev = (x) => p.eval(x);
await p.goto(url, { timeoutMs: 120000, settleMs: 4000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(2000);
await ev(`(() => { const f = window.__fluffy.position; window.__w.tp(f.x + 0.9, f.z + 1.3); window.__w.zoom(1.6); window.__fluffy.scale.setScalar(5); })()`);  // 5x only for inspection: the camera cannot get closer than CAM_MIN
await sleep(1500);
const shot = async (name, force, yaw) => {
  await ev(force);
  await ev(`window.__w.look(${yaw})`);
  await sleep(1200);
  const at = await ev(`(() => { const f = window.__fluffy, c = window.__w.camera;
    const v = c.position.clone().set(f.position.x, f.position.y + 0.22, f.position.z).project(c);
    return JSON.stringify([Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]); })()`);
  await p.screenshot({ path: `/tmp/cat_${name}.jpg`, quality: 95 });
  console.log(name, at);
};
for (const [i, yaw] of [0, 1.57, 3.14, 4.71].entries()) {
  await shot(`sit${i}`, `window.__cs = 1; window.__cl = 0`, yaw);
}
await b.close();
