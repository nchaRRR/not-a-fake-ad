// Screenshots of the puzzle layer at three sizes (390x844, 375x667, 820x1180):
// preview, fork, shape control, target door, mid-run shop, boss intro, boss weak point, results.
// Writes /tmp/claude-0/sc/<size>-<scene>.png and a grid of eight to /tmp/claude-0/sc/nfa-puzzle-grid.png.
const { open } = require('./harness.cjs');
const { plans, installPilot } = require('./puzzle-e2e.cjs');
const OUT = '/tmp/claude-0/sc';
const SIZES = [[390, 844], [375, 667], [820, 1180]];

async function runUntil(page, plan, test, ms = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.waitForTimeout(60);
    const st = await page.evaluate(test);
    if (st) return true;
    const shop = await page.evaluate(() => !document.getElementById('screen-runshop').hidden);
    if (shop && plan.noShop !== true) {
      const it = plan.script.find((x) => 'shop' in x);
      await page.evaluate((i) => (i >= 0 ? window.__game.buy(i) : window.__game.skipShop()), it ? it.shop : -1);
    }
  }
  return false;
}
const freeze = (page) => page.evaluate(() => { window.__game.game.steps = 0; });
const go = (page, n = 4) => page.evaluate((k) => { window.__game.game.steps = k; }, n);

async function start(page, all, n) {
  await page.evaluate((k) => window.__game.play(k), n);
  await page.evaluate(installPilot, all[n - 1].script);
}

(async () => {
  const all = await plans();
  const fails = [];
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const { browser, page, errors } = await open({ width: w, height: h, level: 31 });
    const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${tag}-${name}.png` }); };

    // 1. Preview (level 6: the fork) and 2. inside the fork.
    await start(page, all, 6);
    await page.waitForTimeout(2400);
    await shot('preview');
    await page.evaluate(() => window.__game.skipPreview());
    await go(page, 3);
    if (await runUntil(page, all[5], () => window.__game.props().some((p) => p.type === 'fork' && p.lane && p.z > 9))) { await freeze(page); await shot('fork'); } else fails.push(`${tag} fork`);

    // 3. Shape control at the narrow door (level 2).
    await start(page, all, 2);
    await page.evaluate(() => window.__game.skipPreview());
    await go(page, 3);
    if (await runUntil(page, all[1], () => window.__game.props().some((p) => p.type === 'wall' && p.z > -5.5 && p.z < -2.5))) { await freeze(page); await shot('shape'); } else fails.push(`${tag} shape`);

    // 4. Exact target door (level 4), then 7. results.
    await start(page, all, 4);
    await page.evaluate(() => window.__game.skipPreview());
    await go(page, 3);
    if (await runUntil(page, all[3], () => window.__game.props().some((p) => p.type === 'check' && p.z > -9 && p.z < -6))) { await freeze(page); await shot('target'); } else fails.push(`${tag} target`);
    await go(page, 12);
    await runUntil(page, all[3], () => !!window.__game.game.cine);
    await page.evaluate(() => window.__game.endCine());
    if (await runUntil(page, all[3], () => !document.getElementById('screen-won').hidden)) { await page.waitForTimeout(1500); await shot('results'); } else fails.push(`${tag} results`);

    // 5. Mid-run shop (level 8).
    await start(page, all, 8);
    await page.evaluate(() => window.__game.skipPreview());
    await go(page, 4);
    if (await runUntil(page, { ...all[7], noShop: true }, () => !document.getElementById('screen-runshop').hidden)) { await shot('shop'); await page.evaluate(() => window.__game.buy(0)); } else fails.push(`${tag} shop`);

    // 6. Boss intro and 7. weak point open (level 10, the first world boss).
    await start(page, all, 10);
    await page.evaluate(() => window.__game.skipPreview());
    await go(page, 4);
    if (await runUntil(page, all[9], () => window.__game.game.cine && window.__game.game.cine.t > 1.2)) { await freeze(page); await shot('intro'); } else fails.push(`${tag} intro`);
    await go(page, 6);
    await page.evaluate(() => window.__game.endCine());
    if (await runUntil(page, all[9], () => { const b = window.__game.boss; return b && b.weakOpen && b.weakT < 2.1 && b.phase >= 1; })) { await freeze(page); await shot('weak'); } else fails.push(`${tag} weak`);

    // 8. A lost run shows which goals were missed (level 9 with no plan: the bridge folds).
    await page.evaluate(() => window.__game.play(9));
    await page.evaluate(() => { window.__game.skipPreview(); window.__game.game.steps = 12; window.__game.game.pilot = () => { window.__game.crowd.target = -1.75; }; });
    if (await runUntil(page, all[8], () => !document.getElementById('screen-lost').hidden)) { await page.waitForTimeout(400); await shot('lost'); } else fails.push(`${tag} lost`);

    // Level map
    await page.evaluate(() => { window.__game.game.pilot = null; document.getElementById('btn-lost-home').click(); });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__game.levels());
    await shot('levels');
    console.log(tag, 'pageerror:', errors.length ? errors.join('\n') : 'none');
    if (errors.length) fails.push(`${tag} pageerror`);
    await browser.close();
  }

  // Grid of eight (390x844 shots).
  const sharp = require('sharp');
  const names = ['preview', 'fork', 'shape', 'target', 'shop', 'intro', 'weak', 'results'];
  const W = 390; const H = 844; const pad = 12;
  const tiles = await Promise.all(names.map((n) => sharp(`${OUT}/390x844-${n}.png`).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * 4 + pad * 5, height: H * 2 + pad * 3, channels: 3, background: '#2b2140' } })
    .composite(tiles.map((input, i) => ({ input, left: pad + (i % 4) * (W + pad), top: pad + Math.floor(i / 4) * (H + pad) })))
    .png().toFile(`${OUT}/nfa-puzzle-grid.png`);
  console.log(fails.length ? `missing: ${fails.join(', ')}` : 'all scenes captured');
})();
