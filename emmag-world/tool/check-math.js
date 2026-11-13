import assert from 'node:assert';
import { makeProblem, stepLevel, MAX_LEVEL } from '../src/math.js';

const bag = { res: 'stone', have: 3, need: 4 };

for (let lv = 0; lv <= MAX_LEVEL; lv++) {
  for (let i = 0; i < 4000; i++) {
    const p = makeProblem(lv, i % 3 === 0 ? bag : {});
    assert.equal(p.choices.length, 4, 'four choices');
    assert.equal(new Set(p.choices).size, 4, 'choices distinct');
    assert.ok(p.choices.includes(p.answer), 'answer present');
    assert.ok(p.choices.every((c) => c >= 0), 'no negative choices');
    const n = p.q.match(/\d+/g).map(Number);
    if (p.kind === 'add20' || p.kind === 'add100' || p.kind === 'word-add') {
      assert.equal(p.answer, n[0] + n[1], p.q);
    }
    if (p.kind === 'sub20' || p.kind === 'sub100' || p.kind === 'word-sub') {
      assert.equal(p.answer, n[0] - n[1], p.q);
    }
    if (p.kind === 'skip') assert.equal(p.answer, n[2] + (n[1] - n[0]), p.q);
    if (p.kind === 'place') assert.equal(p.answer, Math.floor(n[0] / 10), p.q);
    if (p.kind === 'mul' || p.kind === 'mul2') assert.equal(p.answer, n[0] * n[1], p.q);
    if (p.kind === 'big') assert.equal(p.answer, n[0] + n[1], p.q);
    if (p.kind === 'bigsub') assert.equal(p.answer, n[0] - n[1], p.q);
    if (p.kind === 'mul2x2') assert.equal(p.answer, n[0] * n[1], p.q);
    if (p.kind === 'div') assert.equal(p.answer, n[0] / n[1], p.q);
    if (p.kind === 'rem') assert.equal(p.answer, n[0] % n[1], p.q);
    if (p.kind === 'dec') {
      const [x, y] = p.q.match(/\d+\.\d+/g).map(Number);
      assert.ok(Math.abs(p.answer - (x + y)) < 1e-9, p.q);
      assert.ok(p.choices.every((c) => Math.abs(c * 10 - Math.round(c * 10)) < 1e-9), `not tenths: ${p.q}`);
    }
    if (p.kind === 'frac') {
      const [a, d, b] = n;
      assert.equal(p.answer, /−/.test(p.q) ? a - b : a + b, p.q);
      assert.ok(p.answer > 0 && p.answer <= d, p.q);
    }
    if (p.kind === 'area') {
      const ok = p.answer === n[0] * n[1] || p.answer === 2 * (n[0] + n[1]);
      assert.ok(ok, p.q);
    }
    if (p.kind === 'round') {
      const unit = /nearest 10\b/.test(p.q) ? 10 : 100;
      assert.equal(p.answer, Math.round(n[0] / unit) * unit, p.q);
    }
  }
}

// level 0 must never jump ahead to tens/hundreds
for (let i = 0; i < 3000; i++) {
  const p = makeProblem(0, {});
  assert.ok(['add20', 'sub20'].includes(p.kind), `level 0 gave ${p.kind}`);
}
// every kind must actually be reachable, or the asserts above never run
const seen = new Set();
for (let lv = 0; lv <= MAX_LEVEL; lv++) for (let i = 0; i < 2000; i++) seen.add(makeProblem(lv, {}).kind);
for (const k of ['mul2', 'mul2x2', 'div', 'rem', 'dec', 'frac', 'area']) assert.ok(seen.has(k), `missing kind ${k}`);

// the old cliff: level 4 was place value, level 5 was three-digit arithmetic
const top = new Set(), bridge = new Set();
for (let i = 0; i < 2000; i++) { bridge.add(makeProblem(5, {}).kind); top.add(makeProblem(MAX_LEVEL, {}).kind); }
assert.ok(bridge.has('mul2') && !bridge.has('big'), `bridge tier leaked: ${[...bridge]}`);
assert.ok(top.has('frac') && top.has('dec'), `top tier: ${[...top]}`);
assert.ok(MAX_LEVEL === 8, `level count ${MAX_LEVEL}`);
// the streak ladder: up at 3 clean, down at 3 wrong, never out of range
let st = { lvl: 0, streak: 0, miss: 0 };
for (let i = 0; i < 3; i++) st = stepLevel(st.lvl, st.streak, st.miss, 'clean');
assert.equal(st.lvl, 1, 'three clean answers promote');
st = { lvl: MAX_LEVEL, streak: 0, miss: 0 };
for (let i = 0; i < 9; i++) st = stepLevel(st.lvl, st.streak, st.miss, 'clean');
assert.equal(st.lvl, MAX_LEVEL, 'never above the top tier');
for (let i = 0; i < 3; i++) st = stepLevel(st.lvl, st.streak, st.miss, 'wrong');
assert.equal(st.lvl, MAX_LEVEL - 1, 'three misses step back one');
st = { lvl: 0, streak: 0, miss: 0 };
for (let i = 0; i < 9; i++) st = stepLevel(st.lvl, st.streak, st.miss, 'wrong');
assert.equal(st.lvl, 0, 'never below zero');
assert.deepEqual(stepLevel(3, 2, 1, 'sloppy'), { lvl: 3, streak: 0, miss: 1 }, 'sloppy keeps the level');
assert.deepEqual(stepLevel(3, 2, 2, 'wrong'), { lvl: 2, streak: 0, miss: 0 }, 'third miss drops');

console.log(`math: ${(MAX_LEVEL + 1) * 4000 + 3000} problems OK across ${MAX_LEVEL + 1} levels`);
