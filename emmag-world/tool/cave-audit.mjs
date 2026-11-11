// Cave audit: drives the real game in headless Chrome and checks every cave
// layout's placement work in one command. Layout edits (CAVE_LAYOUTS, the vault,
// the ledge, the spur) have broken reachability four times now — this is the check
// that fails when they do.
//
//   npm run audit:caves                        # against the live site
//   npm run audit:caves -- http://localhost:5173/?debug
//
// Needs Chrome/Chromium: set CHROME_PATH, or let tool/cdp.mjs find one.
// Exit 1 on any fault.
import { Browser, sleep } from './cdp.mjs';

const URL_ = process.argv[2] || 'https://emmaga2.web.app/?awake&hour=12&debug';
const KEYS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'];
const PICKUP = 2.0;      // what the box asks for
const REACH = 1.2;       // what we accept, with room to spare
const fail = [];
const bad = (what, msg) => fail.push(`${what}: ${msg}`);

// walk twelve ways toward a point and report the closest she can get
const reachFn = (x, z) => `(() => { const W = window.__w; let best = 1e9;
  for (let a = 0; a < 12; a++) { const ang = a / 12 * 6.2832;
    let px = (${x}) + Math.cos(ang) * 6, pz = (${z}) + Math.sin(ang) * 6;
    const s = W.pushAt(px, pz); px = s[0]; pz = s[1];
    for (let i = 0; i < 60; i++) { const dx = (${x}) - px, dz = (${z}) - pz, d = Math.hypot(dx, dz) || 1;
      best = Math.min(best, d); if (d < 0.2) return +best.toFixed(2);
      const q = W.pushAt(px + dx / d * 0.2, pz + dz / d * 0.2); px = q[0]; pz = q[1]; } }
  return +best.toFixed(2); })()`;

// walk straight at a point from one known start
const walkFn = (sx, sz, tx, tz) => `(() => { const W = window.__w;
  const s = W.pushAt((${sx}), (${sz})); let px = s[0], pz = s[1];
  for (let i = 0; i < 60; i++) { const dx = (${tx}) - px, dz = (${tz}) - pz, d = Math.hypot(dx, dz) || 1;
    if (d < 0.4) return +d.toFixed(2);
    const q = W.pushAt(px + dx / d * 0.2, pz + dz / d * 0.2);
    if (Math.hypot(q[0] - px, q[1] - pz) < 0.01) break;   // stuck
    px = q[0]; pz = q[1]; }
  return +Math.hypot((${tx}) - px, (${tz}) - pz).toFixed(2); })()`;

const b = await Browser.launch({ width: 800, height: 600 });
const p = await b.newPage({ width: 800, height: 600, dsf: 1 });
const ev = (x) => p.eval(x);
const J = (x) => JSON.parse(x);

await p.goto(URL_, { timeoutMs: 120000, settleMs: 3000, cacheBust: true });
await ev(`document.querySelector('#go')?.click()`);
await sleep(1500);

for (const key of KEYS) {
  await ev(`window.__w.caveOut?.()`); await sleep(1000);
  await ev(`window.__w.caveTest('${key}')`);
  // wait for THIS cave, not the one still standing from the last loop
  let info = null;
  for (let i = 0; i < 40; i++) {
    await sleep(280);
    const c = J(await ev(`JSON.stringify(window.__w.cave())`));
    if (c.in && c.key === key) { info = J(await ev(`JSON.stringify(window.__w.caveRoomInfo())`)); break; }
  }
  if (!info) { bad(key, 'cave never built'); continue; }
  const tag = `${key} ${info.kind}`;
  const chest = J(await ev(`JSON.stringify(window.__w.chest())`));
  const crys = J(await ev(`JSON.stringify(window.__w.cave().crystals)`));
  const v = info.vault;

  // crystals: nothing may push her off one, and one has to be walkable to
  const disp = J(await ev(`JSON.stringify(window.__w.cave().crystals.map((c) => { const q = window.__w.pushAt(c.x, c.z); return +Math.hypot(q[0] - c.x, q[1] - c.z).toFixed(2); }))`));
  disp.forEach((d, i) => { if (d > 0.05) bad(tag, `crystal ${i + 1} sits ${d} m inside a collider`); });
  for (let i = 0; i < crys.length; i++) {
    const r = await ev(reachFn(crys[i].x, crys[i].z));
    if (r > 0.4) bad(tag, `crystal ${i + 1} unreachable, closest ${r} m`);
  }

  // the gift: inside its vault and close enough to open
  const [cx, cz] = chest.w;
  const e = ((cx - v.x) / v.rx) ** 2 + ((cz - v.z) / v.rz) ** 2;
  if (e > 0.95) bad(tag, `gift outside the vault (ellipse ${e.toFixed(2)})`);
  const cr = await ev(reachFn(cx, cz));
  if (cr > REACH) bad(tag, `gift unreachable, closest ${cr} m (asks ${PICKUP})`);
  // and standing on it has to actually arm the box: the vault is turned to face
  // the hall, so a reach test on the model's own position never fires
  await ev(`window.__w.gateReset(); window.__w.tp(${cx}, ${cz}, 0)`);
  await sleep(400);
  if (!(await ev(`document.querySelector('#gate').className.includes('on')`))) bad(tag, 'standing on the gift does not open it');

  // the map must never mark the vault: the pool used to be a blue dot that pointed
  // at the room nobody had found yet
  const wet = J(await ev(`JSON.stringify((() => { const c = document.querySelector('#map');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] > 100 && d[i + 2] - d[i + 1] > 25 && d[i + 1] - d[i] > 25) n++;
    return n; })())`));
  if (wet) bad(tag, `${wet} water pixels on the cave map`);

  // caches: walkable to, and exactly one per cave — one bundle is the whole point
  if (info.caches.length !== 1) bad(tag, `${info.caches.length} caches, want exactly 1`);
  for (const [x, z] of info.caches) {
    const r = await ev(reachFn(x, z));
    if (r > REACH) bad(tag, `cache at ${x},${z} unreachable, closest ${r} m`);
  }

  // doors: closed ones must stop her walking straight at the room from the hall
  // side; open ones must leave the room-side point reachable from anywhere, which
  // covers a mouth that is a metre off centre as long as she can still get in
  for (const [id, dx, dz, axis, open] of info.doors) {
    const from = axis === 'z' ? [dx, dz - 6] : [dx - 6, dz];
    const past = axis === 'z' ? [dx, dz + 4] : [dx + 4, dz];
    if (!open) {
      const shut = await ev(walkFn(from[0], from[1], past[0], past[1]));
      if (shut < 3) bad(tag, `door ${id} closed but walkable through (stopped ${shut} m off)`);
      await ev(`window.__w.cdoor('${id}')`);
      await sleep(150);
    }
    const thru = await ev(reachFn(past[0], past[1]));
    if (thru > 2) bad(tag, `door ${id} open but blocked (closest ${thru} m)`);
  }
  // a cave she has already solved keeps its doors open and grows no new crystals
  await ev(`window.__w.caveOut?.()`); await sleep(1400);
  await ev(`window.__w.caveTest('${key}')`);
  let back = null;
  for (let i = 0; i < 40; i++) {
    await sleep(280);
    const c = J(await ev(`JSON.stringify(window.__w.cave())`));
    if (c.in && c.key === key) { back = c; break; }
  }
  if (!back) bad(tag, 'cave never rebuilt on the second visit');
  else {
    if (!back.crystals.every((k) => k.got)) bad(tag, 'crystals came back after the door was opened');
    if (!J(await ev(`JSON.stringify(window.__w.caveDoors())`)).some((d) => d.open)) bad(tag, 'the open door closed itself');
  }
  console.log(`${tag.padEnd(18)} crystals ${crys.length}  gift ${cr} m  caches ${info.caches.length}  doors ${info.doors.length}`);
}

await b.close?.();
if (fail.length) { console.log('\nFAULTS'); for (const f of fail) console.log(' -', f); process.exit(1); }
console.log('\nall clear');
