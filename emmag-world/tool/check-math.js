import assert from 'node:assert';
import { makeProblem } from '../src/math.js';

const bag = { res: 'stone', have: 3, need: 4 };

for (let lv = 0; lv <= 5; lv++) {
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
    if (p.kind === 'mul') assert.equal(p.answer, n[0] * n[1], p.q);
    if (p.kind === 'big') assert.equal(p.answer, n[0] + n[1], p.q);
    if (p.kind === 'bigsub') assert.equal(p.answer, n[0] - n[1], p.q);
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
console.log('math: 28k problems OK across 6 levels');
