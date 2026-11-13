// 2nd-grade problems: add/sub within 20 and 100, skip counting, place value.
// Level 5 bridges: times tables and two-digit x one-digit with rounding, so
// three-digit work at level 6 is not a cliff. Level 6 is the 3rd-grade tier.
// Questions ramp by `level` (0..5) and, when the game passes its inventory,
// some are word problems about what Emma is actually carrying.

const ri = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

const PLAN = [
  ['add20', 'sub20'],
  ['add20', 'sub20', 'skip'],
  ['add20', 'sub20', 'skip', 'add100'],
  ['add20', 'sub20', 'skip', 'add100', 'sub100'],
  ['add20', 'sub20', 'skip', 'add100', 'sub100', 'place'],
  ['mul', 'mul', 'mul2', 'round', 'place'],
  ['mul', 'mul', 'big', 'bigsub', 'round'],
];

export const MAX_LEVEL = PLAN.length - 1;

// The ramp lives here so it can be tested without a running game. 'clean' is a
// first-try answer, 'sloppy' a correct one after a miss, 'wrong' a miss.
export function stepLevel(lvl, streak, miss, kind) {
  if (kind === 'clean') {
    streak += 1;
    if (streak >= 3) return { lvl: Math.min(MAX_LEVEL, lvl + 1), streak: 0, miss: 0 };
    return { lvl, streak, miss: 0 };
  }
  if (kind === 'sloppy') return { lvl, streak: 0, miss };
  miss += 1;
  return miss >= 3 ? { lvl: Math.max(0, lvl - 1), streak: 0, miss: 0 } : { lvl, streak: 0, miss };
}

const NAMES = { wood: 'twigs', stone: 'stones', bloom: 'flowers', spark: 'sparkles' };

export function makeProblem(level = 0, ctx = {}, rand = Math.random) {
  const lv = Math.max(0, Math.min(PLAN.length - 1, level | 0));
  const kinds = PLAN[lv];
  let kind = pick(kinds, rand);
  let q, answer, hint;

  if (kind === 'add20') {
    const a = ri(2, 9, rand), b = ri(2, 9, rand);
    q = `${a} + ${b} = ?`; answer = a + b;
    hint = `Start at ${a} and count up ${b} more.`;
  } else if (kind === 'sub20') {
    const a = ri(11, 20, rand), b = ri(2, 9, rand);
    q = `${a} − ${b} = ?`; answer = a - b;
    hint = `Start at ${a} and count back ${b}.`;
  } else if (kind === 'add100') {
    const t = ri(2, 6, rand) * 10, o = ri(11, 49, rand);
    q = `${t} + ${o} = ?`; answer = t + o;
    hint = `Add the tens first: ${t} + ${Math.floor(o / 10) * 10}, then the rest.`;
  } else if (kind === 'sub100') {
    const a = ri(41, 99, rand), b = ri(11, 39, rand);
    q = `${a} − ${b} = ?`; answer = a - b;
    hint = `Take away the tens first, then the ones.`;
  } else if (kind === 'mul') {
    const a = ri(2, 9, rand), b = ri(2, 10, rand);
    q = `${a} × ${b} = ?`; answer = a * b;
    hint = `Think of ${b} rows of ${a}. Count up by ${a}s.`;
  } else if (kind === 'mul2') {
    const a = ri(12, 29, rand), b = ri(2, 5, rand);
    q = `${a} × ${b} = ?`; answer = a * b;
    hint = `Split ${a} into tens and ones: ${Math.floor(a / 10) * 10} × ${b}, then ${a % 10} × ${b}.`;
  } else if (kind === 'big') {
    const a = ri(150, 640, rand), b = ri(105, 299, rand);
    q = `${a} + ${b} = ?`; answer = a + b;
    hint = `Add the hundreds, then the tens, then the ones.`;
  } else if (kind === 'bigsub') {
    const a = ri(320, 980, rand), b = ri(115, 289, rand);
    q = `${a} − ${b} = ?`; answer = a - b;
    hint = `Take away the hundreds first, then the tens, then the ones.`;
  } else if (kind === 'round') {
    const n = ri(112, 989, rand), tens = rand() < 0.5;
    const unit = tens ? 10 : 100;
    q = `What is ${n} rounded to the nearest ${tens ? 10 : '100'}?`;
    answer = Math.round(n / unit) * unit;
    hint = tens ? `Look at the ones digit: 1–4 rounds down, 5–9 rounds up.`
      : `Look at the tens digit: 1–4 rounds down, 5–9 rounds up.`;
  } else if (kind === 'skip') {
    const step = pick([2, 5, 10], rand), start = step * ri(1, 4, rand);
    q = `${start}, ${start + step}, ${start + step * 2}, ?`;
    answer = start + step * 3;
    hint = `What are we counting by? Keep the same step.`;
  } else {
    const n = ri(12, 99, rand), tens = Math.floor(n / 10);
    q = `Which digit is in the tens place of ${n}?`; answer = tens;
    hint = `The tens digit is the second one from the right.`;
  }

  // word problems built from her real bag, so the maths is about the game
  const res = ctx.res, have = ctx.have | 0, need = ctx.need | 0;
  if (res && NAMES[res] && rand() < (ctx.bias ?? 0.45)) {
    const things = NAMES[res];
    if (need > have) {
      q = `The sleeping stone wants ${need} ${things}. You have ${have}. How many more?`;
      answer = need - have;
      hint = `Count up from ${have} until you reach ${need}.`;
      kind = 'word-sub';
    } else {
      const more = ri(2, 9, rand);
      q = `You have ${have} ${things} and find ${more} more. How many now?`;
      answer = have + more;
      hint = `Start at ${have} and count up ${more}.`;
      kind = 'word-add';
    }
  }

  // rounding is a four-way choice a kid can reason about, not a number soup
  const choices = new Set([answer]);
  if (kind === 'round') {
    const unit = /nearest 10\b/.test(q) ? 10 : 100;
    [answer - unit, answer + unit, Math.round((answer + ri(1, 40, rand)) / unit) * unit].forEach((c) => c >= 0 && choices.add(c));
    while (choices.size < 4) choices.add(answer + unit * choices.size);
  }
  const spread = kind === 'place' ? 4
    : kind === 'round' ? 10
    : kind === 'mul2' ? 20
    : kind === 'big' || kind === 'bigsub' ? 30
    : Math.max(4, Math.round(Math.abs(answer) * 0.4));
  let guard = 0;
  while (choices.size < 4 && guard++ < 80) {
    const off = ri(1, Math.max(3, spread), rand) * (rand() < 0.5 ? -1 : 1);
    const c = answer + off;
    if (c >= 0 && c !== answer) choices.add(c);
  }
  let fill = 0;
  while (choices.size < 4) choices.add(answer + 3 + fill++);

  const arr = [...choices];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { q, answer, choices: arr, hint, kind };
}
