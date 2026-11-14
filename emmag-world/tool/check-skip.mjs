// Skip counts: a good tap should skip 5-6 times, a sloppy one 3.
// Constants mirror skipTick()/finishSkips() in src/main.js — keep them in sync.
//   node tool/check-skip.mjs
const G = 5.4, DT = 1 / 60, HOP_MAX = 9, MIN_IMPACT = 0.9;

function skips(acc) {
  const rest = 0.62 + acc * 0.14;                 // bounce keeps this much speed
  let y = 1.0, vy = 1.9 + acc * 2.0, hops = 0;
  for (let t = 0; t < 40; t += DT) {
    vy -= G * DT; y += vy * DT;
    if (y <= 0.075 && vy < 0) {
      if (hops >= HOP_MAX || vy > -MIN_IMPACT) return hops;   // too soft to skip again
      hops++; vy *= -rest; y = 0.078;
    }
  }
  return hops;
}

const want = { 0: 3, 0.5: 4, 0.75: 5, 1: 6 };
for (const [acc, n] of Object.entries(want)) {
  const got = skips(+acc);
  console.assert(got === n, `acc ${acc}: ${got} skips, expected ${n}`);
  console.log(`acc ${acc} -> ${got} skips`);
}
for (let a = 0.1; a <= 1; a += 0.1) {
  console.assert(skips(a) >= 2, `acc ${a.toFixed(1)} died at ${skips(a)}`);
  console.assert(skips(a) <= 7, `acc ${a.toFixed(1)} ran to ${skips(a)}`);
}
console.log('ok');
