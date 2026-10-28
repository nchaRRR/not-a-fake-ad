// Plays the game headless, captures six store scenes in English and Turkish,
// then frames them with captions for the App Store (1320x2868) and Play (1080x1920).
// Usage: node scripts/screenshots.mjs   (writes to assets/store/)
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const sharp = require('/opt/npm-tools/node_modules/sharp');
const rawDir = resolve(root, 'assets/store/raw');
const outDir = resolve(root, 'assets/store');
mkdirSync(rawDir, { recursive: true });

const CAPTIONS = {
  doors: { en: 'The ad. But real.', tr: 'Reklamdaki oyun.\nAma gerçek.' },
  shoot: { en: 'Shoot doors\nto raise them', tr: 'Kapıyı vur,\nsayıyı büyüt' },
  army: { en: 'Grow a huge army', tr: 'Dev bir ordu kur' },
  boss: { en: 'Dodge the boss', tr: 'Boss\'tan kaç,\nonu devir' },
  bonus: { en: 'Multiply your\ncoins up to x5', tr: 'Altınını x5\'e\nkadar katla' },
  shop: { en: 'Unlock weapons\nand looks', tr: 'Silah ve\ngörünüm aç' },
};

const have = (n) => existsSync(resolve(rawDir, `en-${n}.png`)) && existsSync(resolve(rawDir, `tr-${n}.png`));
const START_LEVEL = have('doors') ? 6 : 3; // squads only show up from level 6
const today = new Date();
const dayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

async function capture() {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  // A mid-game save: strong enough to show a big army, all first-time tips seen.
  await page.addInitScript(({ day, lvl: START_LEVEL }) => {
    localStorage.setItem('not-a-fake-ad-lang', 'en');
    localStorage.setItem('not-a-fake-ad-v1', JSON.stringify({
      coins: 1840, level: START_LEVEL, muted: true, music: false,
      up: { army: 5, dmg: 3, rate: 2, income: 2 }, skin: 'blue', weapon: 'rifle',
      owned: { skins: ['blue', 'jungle', 'neon'], weapons: ['rifle', 'shotgun'] },
      seen: { slider: true, saw: true, turret: true, armor: true, shield: true, giant: true, mystery: true, tutDrag: true, tutDoor: true, tutShoot: true, tutEnemy: true, tutBoss: true, tutBonus: true, tutShop: true },
      daily: { last: day, streak: 2 }, adConsent: 'npa', offerSeen: true, wheel: { day, free: false, adSpins: 0 },
    }));
  }, { day: dayStr, lvl: START_LEVEL });
  await page.goto('file://' + resolve(root, 'dist/app/index.html'));
  await page.waitForTimeout(800);

  // Simple autopilot: shoot a red door when one is coming, otherwise take the better door,
  // otherwise line up with the nearest target, and step around saws and rocks.
  await page.evaluate(() => {
    const G = window.__game;
    G.game.steps = 2; // software rendering is slow; two updates per frame keep time moving
    setInterval(() => {
      const g = G.game;
      // Make the boss last long enough to be photographed mid-attack.
      if (G.boss && !G.boss.buffed) { G.boss.buffed = true; G.boss.hp *= 4; G.boss.max *= 4; }
      if (g.mode !== 'playing' && g.mode !== 'bonus') return;
      let tx = null;
      const pairs = G.gatePairs().filter((p) => !p.passed && p.z < 0 && p.z > -18).sort((a, b) => b.z - a.z);
      if (pairs.length) {
        const p = pairs[0];
        const red = p.gates.find((x) => p.kind === 'gates' && x.spec.op === '+' && x.value < 0);
        const score = (x) => (p.kind === 'weapon' ? x.spec.val : x.spec.op === 'x' ? g.count * x.spec.val : x.spec.op === '÷' ? g.count / x.spec.val : g.count + x.value);
        const best = p.gates.length < 2 ? p.gates[0] : score(p.gates[0]) >= score(p.gates[1]) ? p.gates[0] : p.gates[1];
        tx = red && p.z < -6 ? red.x : best.x * 0.8;
      } else {
        const t = [...G.squads(), ...G.barrels()].filter((x) => x.z < 0).sort((a, b) => b.z - a.z)[0];
        if (t) tx = t.x;
        if (G.boss) tx = G.boss.x;
      }
      const sl = G.slams()[0];
      if (sl) tx = sl.x > 0 ? sl.x - 2.4 : sl.x + 2.4;
      if (tx !== null) G.crowd.target = Math.max(-2.9, Math.min(2.9, tx));
    }, 60);
  });

  const got = new Set(['doors', 'shoot', 'army', 'boss', 'bonus'].filter(have));
  const tap = (sel) => page.evaluate((q) => { for (const x of q.split(',')) { const el = document.querySelector(x.trim()); if (el && el.offsetParent) { el.click(); return true; } } return false; }, sel);
  const shoot = async (name) => {
    if (got.has(name)) return;
    got.add(name);
    await page.evaluate(() => {
      window.__game.game.steps = 0; // freeze the moment; rendering continues
      for (const id of ['banner', 'tut', 'hud-hint', 'popups']) { const el = document.getElementById(id); if (el) el.style.visibility = 'hidden'; }
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(rawDir, `en-${name}.png`) });
    await page.evaluate(() => window.__game.lang('tr'));
    if (name === 'shop') await page.click('#tab-weapons');
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(rawDir, `tr-${name}.png`) });
    await page.evaluate(() => {
      window.__game.lang('en');
      window.__game.game.steps = 2;
      for (const id of ['banner', 'tut', 'hud-hint', 'popups']) { const el = document.getElementById(id); if (el) el.style.visibility = ''; }
    });
    if (name === 'shop') await page.click('#tab-weapons');
    console.log('captured', name);
  };

  for (let attempt = 0; attempt < 6 && got.size < 5 - 0; attempt++) {
    await page.waitForTimeout(1500);
    if (!(await tap('#btn-play, #btn-next, #btn-retry'))) { await page.evaluate(() => document.querySelectorAll('.modal:not([hidden]) .btn, [id$=-close]').forEach((b) => b.offsetParent && b.click())); await tap('#btn-play, #btn-next, #btn-retry'); }
    const t0 = Date.now();
    while (Date.now() - t0 < 420000) {
      await page.waitForTimeout(90);
      const st = await page.evaluate(() => {
        const G = window.__game;
        const pairs = G.gatePairs().filter((p) => !p.passed);
        return {
          mode: G.game.mode,
          doors: pairs.some((p) => p.kind === 'gates' && !p.moving && p.z > -11 && p.z < -7) && !G.squads().some((s) => s.z > -12),
          shoot: pairs.some((p) => p.z > -13 && p.z < -7 && p.gates.some((g) => g.spec.op === '+' && g.spec.val < 0 && g.value > g.spec.val + 2 && Math.abs(G.crowd.x - g.x) < 1.2)),
          army: G.game.count > 25 && G.squads().some((s) => s.z > -7 && s.z < -2 && s.alive > 4),
          boss: G.slams().some((s) => s.t > s.dur * 0.4 && s.t < s.dur * 0.85) && G.boss && !G.boss.dead && G.boss.z > -18,
          bonus: !!G.bonus() && G.bonus().tiles.filter((t) => t.reached).length >= 3,
        };
      });
      for (const k of ['doors', 'shoot', 'army', 'boss', 'bonus']) if (st[k]) await shoot(k);
      if (st.mode === 'won' || st.mode === 'lost') {
        await page.waitForSelector('#screen-won:not([hidden]), #screen-lost:not([hidden])', { timeout: 30000 });
        break;
      }
    }
  }

  // Shop scene.
  await page.waitForTimeout(1500);
  await tap('#btn-won-shop, #btn-lost-shop, #btn-shop');
  await page.evaluate(() => { document.getElementById('screen-shop').hidden = false; });
  await page.waitForTimeout(300);
  await page.click('#tab-weapons');
  await page.waitForTimeout(300);
  await shoot('shop');
  await browser.close();
  return got;
}

const fontData = readFileSync(resolve(root, 'assets/fonts/Baloo2.ttf')).toString('base64');

async function composeAll(names) {
  const browser = await chromium.launch();
  const SPECS = [
    { suffix: 'appstore-1320x2868', w: 1320, h: 2868, size: 132, top: 150, shotH: 2240, radius: 70, border: 12 },
    { suffix: 'play-1080x1920', w: 1080, h: 1920, size: 96, top: 90, shotH: 1460, radius: 48, border: 9 },
  ];
  let i = 1;
  for (const name of names) {
    for (const lang of ['en', 'tr']) {
      const shot = readFileSync(resolve(rawDir, `${lang}-${name}.png`)).toString('base64');
      for (const sp of SPECS) {
        const page = await browser.newPage({ viewport: { width: sp.w, height: sp.h } });
        const caption = CAPTIONS[name][lang].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
          @font-face { font-family: Baloo; src: url(data:font/ttf;base64,${fontData}); font-weight: 400 800; }
          html, body { margin: 0; width: ${sp.w}px; height: ${sp.h}px; overflow: hidden; }
          body { background: linear-gradient(#7db6ef, #c6d8f6 45%, #ffdccb 75%, #ffc3a6); display: flex; flex-direction: column; align-items: center; }
          h1 { margin: ${sp.top}px 40px 0; font-family: Baloo; font-weight: 800; font-size: ${sp.size}px; line-height: 0.98; text-align: center; color: #fff;
               -webkit-text-stroke: ${Math.round(sp.size * 0.11)}px #2b2140; paint-order: stroke fill; text-shadow: 0 ${Math.round(sp.size * 0.08)}px 0 #2b2140; }
          .frame { margin-top: auto; margin-bottom: ${Math.round(sp.h * 0.03)}px; border: ${sp.border}px solid #2b2140; border-radius: ${sp.radius + sp.border}px; overflow: hidden;
                   box-shadow: 0 ${sp.border * 2}px 0 rgba(43,33,64,0.35); line-height: 0; }
          .frame img { height: ${sp.shotH}px; display: block; }
        </style></head><body><h1>${caption}</h1><div class="frame"><img src="data:image/png;base64,${shot}"></div></body></html>`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        await page.screenshot({ path: resolve(outDir, `${i}-${sp.suffix}-${lang}-${name}.png`) });
        await page.close();
      }
    }
    i++;
  }
  await browser.close();
}

const got = await capture();
const order = ['doors', 'shoot', 'army', 'boss', 'bonus', 'shop'].filter((n) => got.has(n) || have(n));
await composeAll(order);
console.log('done:', order.join(', '));
