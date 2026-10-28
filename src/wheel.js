// Lucky wheel: one free spin a day, up to three more with ads,
// and any prize can be doubled with an ad.
import { t } from './i18n.js';

const SEGMENTS = [
  { coins: 50, w: 22, color: '#2f7cf6' },
  { coins: 100, w: 20, color: '#ff9628' },
  { xp: 150, w: 12, color: '#7a5cf0' },
  { coins: 150, w: 16, color: '#1fae9f' },
  { coins: 250, w: 12, color: '#e8453c' },
  { coins: 400, w: 8, color: '#2f7cf6' },
  { coins: 750, w: 6, color: '#ff9628' },
  { coins: 1500, w: 4, color: '#ffbe2e', jackpot: true },
];
const AD_SPINS = 3;
const SLICE = 360 / SEGMENTS.length;

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pick() {
  const total = SEGMENTS.reduce((a, s) => a + s.w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].w;
    if (r <= 0) return i;
  }
  return 0;
}

export function createWheel(ctx) {
  const { save, writeSave, ads, sfx, buzz, refreshWallet, track, addPassXp, fmt } = ctx;
  const $ = (id) => document.getElementById(id);
  const wheelEl = $('wheel');
  let angle = 0;
  let spinning = false;
  let prize = null;

  // Paint the wheel once: colored slices plus a label per slice.
  wheelEl.style.background = `conic-gradient(${SEGMENTS.map((s, i) => `${s.color} ${i * SLICE}deg ${(i + 1) * SLICE}deg`).join(', ')})`;
  wheelEl.innerHTML = SEGMENTS.map((s, i) => `
    <span class="wheel-label${s.jackpot ? ' jackpot' : ''}" style="transform: rotate(${i * SLICE + SLICE / 2}deg)">
      <b>${s.xp ? `${s.xp}<small>XP</small>` : fmt(s.coins)}</b>
    </span>`).join('');

  function state() {
    const key = dayKey();
    if (!save.wheel || save.wheel.day !== key) {
      save.wheel = { day: key, free: true, adSpins: 0 };
      writeSave(save);
    }
    return save.wheel;
  }

  function refresh() {
    const st = state();
    const free = st.free;
    const adLeft = AD_SPINS - st.adSpins;
    $('wheel-badge').hidden = !free;
    $('btn-wheel-spin').hidden = !!prize;
    $('btn-wheel-spin').disabled = spinning || (!free && adLeft <= 0);
    $('wheel-spin-label').textContent = free ? t('wheel.spinFree') : adLeft > 0 ? t('wheel.spinAd', { n: adLeft }) : t('wheel.tomorrow');
    $('wheel-spin-chip').hidden = free || adLeft <= 0;
    $('wheel-result').hidden = !prize;
    $('btn-wheel-collect').hidden = !prize;
    if (prize) {
      $('wheel-prize').textContent = prize.xp ? `+${prize.xp * prize.mult} XP` : `+${fmt(prize.coins * prize.mult)}`;
      $('btn-wheel-double').hidden = prize.mult > 1;
    }
  }

  async function spin() {
    if (spinning || prize) return;
    const st = state();
    if (!st.free) {
      if (st.adSpins >= AD_SPINS) return;
      const ok = await ads.showRewarded('wheel_spin');
      track('ad_reward', { placement: 'wheel_spin', granted: ok });
      if (!ok) return;
      st.adSpins += 1;
    } else {
      st.free = false;
    }
    writeSave(save);
    const i = pick();
    spinning = true;
    refresh();
    // Land slice i under the pointer at the top, with a little wobble inside the slice.
    const center = i * SLICE + SLICE / 2;
    const wobble = (Math.random() - 0.5) * SLICE * 0.6;
    const current = ((angle % 360) + 360) % 360;
    angle += 360 * 5 + ((360 - center - wobble - current) % 360 + 360) % 360;
    wheelEl.style.transform = `rotate(${angle}deg)`;
    // Clicks slow down with the wheel.
    let delay = 60;
    const tick = () => {
      if (!spinning) return;
      sfx.tick();
      delay *= 1.12;
      setTimeout(tick, delay);
    };
    tick();
    setTimeout(() => {
      spinning = false;
      prize = { ...SEGMENTS[i], mult: 1 };
      if (ctx.onPrize) ctx.onPrize(SEGMENTS[i]);
      track('wheel_spin', { prize: SEGMENTS[i].coins || 0, xp: SEGMENTS[i].xp || 0 });
      if (prize.jackpot) { sfx.win(); buzz([30, 40, 30, 40, 60]); } else { sfx.coin(); buzz(20); }
      refresh();
    }, 3700);
  }

  async function doublePrize() {
    if (!prize || prize.mult > 1) return;
    $('btn-wheel-double').disabled = true;
    const ok = await ads.showRewarded('wheel_double');
    track('ad_reward', { placement: 'wheel_double', granted: ok });
    $('btn-wheel-double').disabled = false;
    if (!ok) return;
    prize.mult = 2;
    sfx.win();
    refresh();
  }

  function collect() {
    if (!prize) return;
    if (prize.coins) save.coins += prize.coins * prize.mult;
    if (prize.xp) addPassXp(prize.xp * prize.mult);
    writeSave(save);
    sfx.buy();
    prize = null;
    refreshWallet();
    refresh();
  }

  function open() {
    refresh();
    $('screen-wheel').hidden = false;
  }

  $('btn-wheel').addEventListener('click', () => { sfx.tap(); open(); });
  $('btn-wheel-spin').addEventListener('click', spin);
  $('btn-wheel-double').addEventListener('click', doublePrize);
  $('btn-wheel-collect').addEventListener('click', collect);
  $('btn-wheel-close').addEventListener('click', () => {
    if (spinning) return;
    if (prize) collect();
    $('screen-wheel').hidden = true;
  });

  refresh();
  return {
    // Opens by itself once a day while the free spin is waiting.
    openIfFree() {
      if (!state().free) return false;
      open();
      return true;
    },
    refresh,
  };
}
