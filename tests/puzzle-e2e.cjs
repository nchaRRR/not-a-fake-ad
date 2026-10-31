// Plays hand-designed levels in the real game (Chromium, software GL), with a bot that follows
// the solver's best plan: which door, which lane, which shape where, what to buy, then the boss
// (stand under the open weak point, squeezed, and step out of red zones). Reports the stars the
// game gave next to the stars the solver predicted. pageerror must stay empty.
// Usage: node tests/puzzle-e2e.cjs [first] [last]   (needs dist/ built)
const { open } = require('./harness.cjs');

async function plans() {
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', languages: ['en'] }, configurable: true });
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const { WEAPONS } = await import('../src/config.js');
  const { LEVELS } = await import('../src/levels.js');
  const { solve } = await import('../src/sim.js');
  const { laneCentre } = await import('../src/rules.js');
  const weapons = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
  return LEVELS.map((lv) => {
    const best = solve(lv, weapons);
    const script = best.choices.map((c) => {
      if (c.type === 'gates') return { d: c.d, end: c.d, x: c.opt === 'L' ? -1.75 : 1.75 };
      if (c.type === 'fork') { const [side, shape] = c.opt.split(':'); return { d: c.d, end: c.d + c.len, x: laneCentre(side), shape: shape === 'normal' ? null : shape, fork: true }; }
      if (c.type === 'wall' || c.type === 'bridge') return { d: c.d, end: c.d + c.len, x: c.cx, shape: c.opt };
      if (c.type === 'switch') return { d: c.d, end: c.d + 1, x: 0, shape: c.opt };
      if (c.type === 'shop') return { d: c.d, end: c.d, shop: c.opt === 'skip' ? -1 : Number(c.opt.slice(3)) };
      if (c.type === 'boss') return { d: c.d, boss: true, shape: c.opt };
      return null;
    }).filter(Boolean);
    return { stars: best.stars, goals: best.goals, final: best.final, script };
  });
}

// Runs inside the page, once per game update.
function installPilot(script) {
  const G = window.__game;
  const g = G.game;
  g.pilot = () => {
    const tr = g.traveled;
    const items = script.filter((it) => !it.boss && !('shop' in it));
    // Hold position until the tail of the squad (a squeezed column is long) has cleared a hazard too.
    const cur = items.find((it) => tr < it.end + (it.shape === 'squeeze' ? 3.4 : 1.2));
    let shape = 'normal';
    let tx = G.crowd.target;
    if (cur && cur.d - tr < 34) {
      tx = cur.x;
      if (cur.shape && cur.d - tr < 17) shape = cur.shape;
    }
    // Squads that are about to reach the squad: line up so they get shot.
    const sq = G.squads().filter((s) => s.z > -16 && s.z < -2 && s.alive > 0).sort((a, b) => b.z - a.z)[0];
    if (sq && (!cur || cur.d - tr > 18)) tx = sq.x;
    const b = G.boss;
    if (b && b.introduced && !b.dead) {
      const bs = script.find((it) => it.boss);
      shape = bs ? bs.shape : 'squeeze';
      tx = b.weak ? (b.weakOpen ? b.weakX - 0.12 : (b.weakX || 0) - 0.12) : b.x;
    }
    // Step out of red zones: rock circles, the fists' zone, and find the gap in a wall.
    const R = 0.3 + Math.sqrt(Math.max(1, g.count)) * 0.12;
    for (const sl of G.slams()) if (sl.t > -0.2 && Math.abs(tx - sl.x) < sl.r + R) tx = sl.x > 0 ? sl.x - sl.r - R - 0.2 : sl.x + sl.r + R + 0.2;
    if (b && b.introduced && !b.dead) {
      const p = b.punch;
      if (p && p.phase !== 'rest' && Math.abs(tx - p.x) < p.w / 2 + R) tx = p.x > 0 ? p.x - p.w / 2 - R - 0.1 : p.x + p.w / 2 + R + 0.1;
    }
    if (G.shape() !== shape) G.shape(shape);
    G.crowd.target = Math.max(-3, Math.min(3, tx));
  };
}

module.exports = { plans, installPilot };
if (require.main === module) (async () => {
  // Levels: "first last", or a comma list ("10,15,20").
  const arg = process.argv[2] || '1';
  const list = arg.includes(',') ? arg.split(',').map(Number)
    : Array.from({ length: Number(process.argv[3] || 30) - Number(arg) + 1 }, (_, i) => Number(arg) + i);
  const all = await plans();
  let match = 0;
  let three = 0;
  const rows = [];
  const errors = [];
  let session = null;
  for (const [idx, n] of list.entries()) {
    // A fresh browser every eight levels: software GL leaks over very long sessions.
    if (idx % 8 === 0) {
      if (session) { errors.push(...session.errors); await session.browser.close(); }
      // A small view and light graphics: the bot does not need pixels, and software GL is slow.
      session = await open({ level: 31, width: 200, height: 420 });
      await session.page.evaluate(() => window.__game.tier(2));
    }
    const { page } = session;
    const plan = all[n - 1];
    await page.evaluate((k) => window.__game.play(k), n);
    await page.evaluate(installPilot, plan.script);
    await page.evaluate(() => { window.__game.skipPreview(); window.__game.game.steps = 40; });
    const t0 = Date.now();
    let res = null;
    while (Date.now() - t0 < 240000) {
      await page.waitForTimeout(150);
      const st = await page.evaluate(() => {
        const G = window.__game;
        return { mode: G.game.mode, shop: !document.getElementById('screen-runshop').hidden, cine: !!G.game.cine, res: G.result() };
      });
      if (st.cine) await page.evaluate(() => window.__game.endCine());
      if (st.shop) {
        const it = plan.script.find((x) => 'shop' in x);
        await page.evaluate((i) => (i >= 0 ? window.__game.buy(i) : window.__game.skipShop()), it ? it.shop : -1);
      }
      if (st.res) { res = st.res; break; }
    }
    const got = res ? res.stars : -1;
    if (got === plan.stars) match++;
    if (got === 3) three++;
    const line = `L${String(n).padStart(2)} solver ${plan.stars}★ (final ${plan.final})  game ${res ? `${res.won ? 'win' : 'LOST'} ${got}★ [${res.goals.map((x) => (x ? 'Y' : 'n')).join('')}] final ${res.final} lost ${res.lost} boss ${Number.isFinite(res.bossSecs) ? res.bossSecs.toFixed(1) + 's' : '-'}` : 'TIMEOUT'}`;
    console.log(line);
    rows.push(line);
    await page.evaluate(() => { window.__game.game.pilot = null; window.__game.game.steps = 1; });
  }
  errors.push(...session.errors);
  await session.browser.close();
  const total = list.length;
  console.log(`\noptimal plan replayed in the game: 3 stars on ${three}/${total}, same stars as the solver on ${match}/${total}`);
  console.log(`pageerror: ${errors.length ? errors.join('\n') : 'none'}`);
  process.exit(errors.length ? 1 : 0);
})();
