// Shared Playwright setup for the puzzle tests: a seeded save (tips seen, daily reward and wheel
// already taken today, ad consent answered) so no popups get in the way, and pageerror capture.
const { chromium } = require('playwright');

const today = new Date();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const SEEN = ['slider', 'saw', 'turret', 'armor', 'shield', 'giant', 'mystery', 'tutDrag', 'tutDoor', 'tutShoot', 'tutEnemy', 'tutBoss', 'tutPunch', 'tutBonus', 'tutShop'];

async function open({ width = 390, height = 844, level = 12, tips = false, extra = {} } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: width < 700 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}\n${(e.stack || '').split('\n').slice(0, 3).join('\n')}`));
  const seen = Object.fromEntries(SEEN.map((k) => [k, true]));
  if (!tips) Object.assign(seen, { tutShape: true, tutWeak: true, tip_door: true, tip_saws: true, tip_pit: true, tip_log: true, tip_bridge: true, tip_check: true, tip_key: true, tip_fork: true, tip_cage: true, tip_switch: true, tip_mud: true, tip_lock: true, door: true, saws: true, pit: true, log: true, bridge: true, bridgeMax: true, target: true, switch: true, fork: true, hostage: true, key: true });
  await page.addInitScript(({ day, level, seen, extra }) => {
    window.__skipOpening = 1;
    localStorage.setItem('not-a-fake-ad-lang', extra.lang || 'en');
    localStorage.setItem('not-a-fake-ad-v1', JSON.stringify({
      coins: 900, level, muted: true, music: false, up: { army: 0, dmg: 0, rate: 0, income: 0 }, skin: 'blue', weapon: 'rifle',
      owned: { skins: ['blue'], weapons: ['rifle'] }, seen, daily: { last: day, streak: 2 }, adConsent: 'npa', offerSeen: true,
      wheel: { day, free: false, adSpins: 0 }, ...(extra.save || {}),
    }));
  }, { day, level, seen, extra });
  await page.goto('file:///home/claude/nfa-repo/dist/app/index.html');
  await page.waitForTimeout(900);
  // Anything still open (consent, daily, wheel, Christmas gift): close it.
  await page.evaluate(() => {
    for (const id of ['btn-consent-later', 'btn-daily-claim', 'btn-wheel-close', 'btn-xmas-claim', 'btn-offer-no']) {
      const b = document.getElementById(id);
      if (b && b.offsetParent) b.click();
    }
  });
  await page.waitForTimeout(300);
  return { browser, page, errors };
}

module.exports = { open };
