// Behaviour check for the 1-5 fixes that the cave audit cannot see: feed double-charge,
// colliders on harvested nodes, and the doorway hint going out.
import { Browser, sleep } from './cdp.mjs';

const URL_ = process.argv[2] || 'http://127.0.0.1:5173/?awake&hour=12&debug&seed=777';
const b = await Browser.launch({ width: 900, height: 650 });
const p = await b.newPage({ width: 900, height: 650, dsf: 1 });
const ev = (x) => p.eval(x);
const J = (x) => JSON.parse(x);
const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

await p.goto(URL_, { timeoutMs: 120000, settleMs: 3000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(1500);

// 1. two taps on Feed cost two bloom, not four
await ev(`window.__w.save.res.bloom = 10; window.__w.deerSpawn();`);
await sleep(600);
await ev(`window.__w.deerTrust(1)`);
await sleep(400);
const b0 = await ev(`window.__w.save.res.bloom`);
await ev(`window.__w.feed(); window.__w.feed();`);   // the second tap lands the same frame
await sleep(300);
const b1 = await ev(`window.__w.save.res.bloom`);
ok(b0 - b1 === 2, `feed double tap spent ${b0 - b1} bloom, want 2`);
ok((await ev(`window.__w.near()`)) !== 'feed', 'the Feed button is still offered mid walk-in');
await sleep(6000);
const b2 = await ev(`window.__w.save.res.bloom`);
ok(b2 === b1, 'bloom moved again mid walk-in');

// 2. a harvested tree is not a wall
const tree = J(await ev(`JSON.stringify(window.__w.treeNodes().filter(([id, x, z]) =>
  Math.hypot(x - window.__w.pose().x, z - window.__w.pose().z) > 8 &&
  Math.hypot(x - window.__w.pose().x, z - window.__w.pose().z) < 40)[0])`));
if (!tree) fail.push('no tree to test');
else {
  const [id, tx, tz] = tree;
  const disp = `(() => { const q = window.__w.pushAt(${tx}, ${tz}); return +Math.hypot(q[0] - ${tx}, q[1] - ${tz}).toFixed(2); })()`;
  await ev(`window.__w.tp(${tx} + 0.9, ${tz}); window.__w.look(0)`);
  await sleep(500);
  const solid = await ev(disp);
  ok(solid > 0.05, `a live tree does not block (push ${solid} m)`);
  await ev(`document.querySelector('#act')?.click()`);   // gather it
  await sleep(900);
  const gone = await ev(disp);
  ok(gone < 0.05, `a harvested tree still blocks (push ${gone} m)`);
  await ev(`window.__w.tp(0, 20)`);   // walk away so the node is not the one she stands in
  void id;
}

// 3. a doorway hint goes out after 30 s, the vault's column never does
await ev(`window.__w.caveTest('-2,0')`); await sleep(2500);
const doors = J(await ev(`JSON.stringify(window.__w.caveDoors())`));
const side = doors.find((d) => d.kind !== 'crystal' && !d.open);
await ev(`window.__w.cdoor('${side.id}')`);
await sleep(500);
let bk = J(await ev(`JSON.stringify(window.__w.beacon())`)).find((o) => o.id === side.id);
ok(!!bk && bk.v, `the ${side.id} hint is not showing right after the door opens`);
for (const c of J(await ev(`JSON.stringify(window.__w.cave().crystals)`))) {
  await ev(`window.__w.caveTp(${c.x}, ${c.z})`); await sleep(300);
}
// the game clock runs slower than the wall clock in headless, so wait on its own t
for (let i = 0; i < 60; i++) {
  const t = J(await ev(`JSON.stringify(window.__w.beacon())`)).find((o) => o.id === side.id)?.t;
  if ((t || 0) > 31) break;
  await sleep(1500);
}
bk = J(await ev(`JSON.stringify(window.__w.beacon())`));
const hint = bk.find((o) => o.id === side.id);
const vault = bk.find((o) => o.perma);
ok(!!hint && !hint.v, 'the doorway hint is still standing after 30 s');
ok(!!vault && vault.v, 'the waterfall doorway column went out');

console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'all clear');
await b.close?.();
process.exit(fail.length ? 1 : 0);
