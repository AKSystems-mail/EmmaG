// 2nd grade: add/sub within 20 and 100, skip counting, place value.
// L5 bridges: times tables and two-digit x one-digit with rounding, so three-digit
// work at L6 is not a cliff. L6 is 3rd grade. L7-L8 are 4th grade: two-digit
// multiplication, division with remainders, tenths, fractions, area.
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
  ['mul2', 'mul2x2', 'div', 'rem', 'round'],
  ['mul2x2', 'div', 'rem', 'dec', 'frac', 'area'],
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
  } else if (kind === 'mul2x2') {
    const a = ri(12, 29, rand), b = ri(11, 19, rand);
    q = `${a} × ${b} = ?`; answer = a * b;
    hint = `Split ${b} into ${Math.floor(b / 10) * 10} and ${b % 10}: ${a} × ${Math.floor(b / 10) * 10}, then ${a} × ${b % 10}.`;
  } else if (kind === 'div') {
    const b = ri(2, 9, rand), k = ri(3, 12, rand);
    q = `${b * k} ÷ ${b} = ?`; answer = k;
    hint = `How many ${b}s fit in ${b * k}?`;
  } else if (kind === 'rem') {
    const b = ri(3, 9, rand), k = ri(2, 9, rand), r = ri(1, b - 1, rand);
    q = `${b * k + r} ÷ ${b} — what is the remainder?`; answer = r;
    hint = `Find the biggest multiple of ${b} that fits, then count what is left.`;
  } else if (kind === 'dec') {
    const a = ri(11, 89, rand), b = ri(11, 89, rand);   // tenths, kept as integers
    q = `${(a / 10).toFixed(1)} + ${(b / 10).toFixed(1)} = ?`; answer = a + b;
    hint = `Line up the decimal points, add the tenths, then the ones.`;
  } else if (kind === 'frac') {
    const d = pick([4, 5, 6, 8, 10], rand), sub = rand() < 0.45;
    const hi = ri(2, d - 1, rand), lo = ri(1, hi - 1, rand);
    const [a, b] = sub ? [hi, lo] : [lo, ri(1, d - lo, rand)];
    q = `${a}/${d} ${sub ? '−' : '+'} ${b}/${d} = ?/${d}`;
    answer = sub ? a - b : a + b;
    hint = `The bottoms match, so ${sub ? 'subtract' : 'add'} the tops: ${a} ${sub ? '−' : '+'} ${b}.`;
  } else if (kind === 'area') {
    const w = ri(3, 12, rand), h = ri(3, 12, rand), per = rand() < 0.5;
    q = per ? `A rectangle is ${w} by ${h}. What is the distance all the way around?`
      : `A rectangle is ${w} by ${h}. What is the area?`;
    answer = per ? 2 * (w + h) : w * h;
    hint = per ? `Go all the way round: ${w} + ${h} + ${w} + ${h}.` : `Area is length × width: ${w} × ${h}.`;
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
    : kind === 'mul2x2' ? 40
    : kind === 'div' || kind === 'rem' ? 5
    : kind === 'frac' ? 3
    : kind === 'dec' ? 12
    : kind === 'area' ? 14
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
  // tenths stay integers until here: 2.7 + 1 is not 3.7 in binary floating point
  if (kind === 'dec') return { q, answer: answer / 10, choices: arr.map((c) => c / 10), hint, kind };
  return { q, answer, choices: arr, hint, kind };
}
