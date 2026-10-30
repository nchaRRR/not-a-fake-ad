// Headless solver/bot test for the hand-designed levels.
// For every level: the best plan (exhaustive search over doors, lanes, shapes and shop picks)
// must clear it with 3 stars, and the naive plan (always the bigger-looking door, no shape
// changes, no shopping) must earn fewer stars or fail on most levels after level 5.
// Usage: node tests/puzzle-bot.mjs [--verbose]
globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', languages: ['en'] }, configurable: true });
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { WEAPONS } = await import('../src/config.js');
const { LEVELS } = await import('../src/levels.js');
const { solve, naive } = await import('../src/sim.js');

const weapons = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
const verbose = process.argv.includes('--verbose');
let fails = 0;
let naiveWorse = 0;
let naiveWorseAfter5 = 0;
let after5 = 0;
let naiveFailed = 0;
const rows = [];
LEVELS.forEach((lv, i) => {
  const n = i + 1;
  const best = solve(lv, weapons);
  const nv = naive(lv, weapons);
  const ok = best.won && best.stars === 3;
  if (!ok) fails++;
  const worse = !nv.won || nv.stars < best.stars;
  if (worse) naiveWorse++;
  if (!nv.won) naiveFailed++;
  if (n > 5) { after5++; if (worse) naiveWorseAfter5++; }
  rows.push({ n, idea: lv.idea, best: `${best.stars}★ ${best.won ? 'win' : 'FAIL ' + best.dead} final ${best.final} boss ${best.bossSecs?.toFixed(1)}s t ${best.time.toFixed(0)}s`, naive: `${nv.won ? nv.stars + '★' : 'FAIL ' + nv.dead} final ${nv.final}${nv.bossSecs ? ' boss ' + nv.bossSecs.toFixed(1) + 's' : ''}`, plan: best.choices.map((c) => c.opt).join(' '), nplan: nv.choices.map((c) => c.opt).join(' '), goals: best.goals.map((g) => (g ? 'Y' : 'n')).join(''), ngoals: nv.goals.map((g) => (g ? 'Y' : 'n')).join('') });
});
for (const r of rows) {
  console.log(`L${String(r.n).padStart(2)} ${r.idea.padEnd(8)} best: ${r.best.padEnd(46)} [${r.goals}]  naive: ${r.naive} [${r.ngoals}]`);
  if (verbose) console.log(`      plan: ${r.plan}\n      naive: ${r.nplan}`);
}
const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
console.log(`\noptimal plan 3 stars: ${LEVELS.length - fails}/${LEVELS.length} (${pct(LEVELS.length - fails, LEVELS.length)})`);
console.log(`naive plan fewer stars or failed: ${naiveWorse}/${LEVELS.length} (${pct(naiveWorse, LEVELS.length)}); after level 5: ${naiveWorseAfter5}/${after5} (${pct(naiveWorseAfter5, after5)}); naive failed outright: ${naiveFailed}`);
// Levels after 30 reuse the designs of 11-30 with tougher enemies (and, from 71, doubled numbers).
const { levelDef } = await import('../src/level.js');
for (const edge of [1, 2]) {
  let later = 0;
  let laterWin = 0;
  for (let n = 31; n <= 110; n++) {
    const r = solve(levelDef(n), weapons, edge);
    if (r.won) laterWin++;
    if (r.stars === 3) later++;
  }
  console.log(`levels 31-110, ${edge === 1 ? 'no upgrades' : 'upgrade edge x2 (about damage+rate x4)'}: best plan wins ${laterWin}/80, 3 stars ${later}/80`);
}
const pass = fails === 0 && naiveWorseAfter5 / after5 >= 0.75;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
