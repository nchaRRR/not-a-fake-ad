// Reasons to come back: the season pass and the daily reward.
// Everything runs on the device clock for now; a server check can replace
// seasonNow() later to stop players from moving their clock.
import { t } from './i18n.js';

const DAY = 86400000;
const SEASON_EPOCH = Date.UTC(2026, 9, 27); // season 1 starts 27 Oct 2026
const SEASON_DAYS = 30;
export const TIERS = 30;
export const XP_PER_TIER = 250;
const DAILY = [50, 80, 120, 160, 220, 300, 500];

export function seasonNow(now = Date.now()) {
  const len = SEASON_DAYS * DAY;
  const n = Math.max(0, Math.floor((now - SEASON_EPOCH) / len));
  const end = SEASON_EPOCH + (n + 1) * len;
  return { id: n + 1, daysLeft: Math.max(1, Math.ceil((end - now) / DAY)) };
}

// Rewards per tier. Pass-only looks sit on tiers 10, 15 and 30.
export function passReward(track, tier) {
  if (track === 'free') {
    if (tier === 15) return { skin: 'camo' };
    return { coins: tier % 5 === 0 ? 150 + tier * 20 : 40 + tier * 8 };
  }
  if (tier === 1) return { coins: 500 };
  if (tier === 10) return { skin: 'neon' };
  if (tier === 30) return { skin: 'royal' };
  return { coins: 80 + tier * 15 };
}

function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createMeta(ctx) {
  const { save, writeSave, sfx, buzz, refreshWallet, ads, payments, track, fmt, skinName, skinColors } = ctx;
  const $ = (id) => document.getElementById(id);

  function pass() {
    const season = seasonNow();
    if (!save.pass || save.pass.season !== season.id) {
      save.pass = { season: season.id, xp: 0, free: [], prem: [], premium: false };
      writeSave(save);
    }
    return save.pass;
  }

  const tierOf = (xp) => Math.min(TIERS, Math.floor(xp / XP_PER_TIER));

  function claimable() {
    const p = pass();
    const reached = tierOf(p.xp);
    let n = 0;
    for (let i = 1; i <= reached; i++) {
      if (!p.free.includes(i)) n++;
      if (p.premium && !p.prem.includes(i)) n++;
    }
    return n;
  }

  function refreshBadges() {
    const n = claimable();
    $('pass-badge').hidden = n === 0;
    $('pass-badge').textContent = n;
  }

  function grant(r) {
    if (r.coins) save.coins += r.coins;
    if (r.skin && !save.owned.skins.includes(r.skin)) save.owned.skins.push(r.skin);
  }

  function rewardLabel(r) {
    if (r.coins) {
      const big = r.coins >= 250 ? ' big' : '';
      return `<span class="coin-stack${big}" aria-hidden="true"><i></i><i></i><i></i></span>${fmt(r.coins)}`;
    }
    const c = skinColors(r.skin);
    return `<span class="mini-soldier" aria-hidden="true" style="--b:${c.body};--h:${c.head}"></span><small>${skinName(r.skin)}</small>`;
  }

  function cell(trackName, tier, reached, p) {
    const r = passReward(trackName, tier);
    const claimed = (trackName === 'free' ? p.free : p.prem).includes(tier);
    const locked = tier > reached || (trackName === 'prem' && !p.premium);
    const ready = !claimed && !locked;
    const cls = `pass-cell ${trackName}${claimed ? ' claimed' : ''}${locked ? ' locked' : ''}${ready ? ' ready' : ''}${r.skin ? ' skin' : ''}`;
    let action = '';
    if (claimed) action = '<span class="pass-check" aria-hidden="true">✓</span>';
    else if (!locked) action = `<button type="button" class="pass-claim" data-track="${trackName}" data-tier="${tier}">${t('pass.claim')}</button>`;
    else if (trackName === 'prem' && !p.premium) action = '<span class="pass-lock" aria-hidden="true"></span>';
    return `<div class="${cls}"><span class="pass-reward">${rewardLabel(r)}</span>${action}</div>`;
  }

  function renderPass() {
    const p = pass();
    const season = seasonNow();
    const reached = tierOf(p.xp);
    $('pass-season').textContent = t('pass.season', { n: season.id });
    $('pass-days').textContent = t('pass.daysLeft', { n: season.daysLeft });
    $('pass-tier').textContent = t('pass.tier', { n: reached, max: TIERS });
    $('pass-tier-num').textContent = reached;
    const into = reached >= TIERS ? 1 : (p.xp % XP_PER_TIER) / XP_PER_TIER;
    $('pass-xp').style.transform = `scaleX(${into})`;
    $('pass-xp-text').textContent = reached >= TIERS ? t('pass.done') : `${p.xp % XP_PER_TIER} / ${XP_PER_TIER} XP`;
    $('btn-pass-unlock').hidden = p.premium;
    $('btn-pass-all').hidden = claimable() < 2;
    let html = '';
    for (let i = 1; i <= TIERS; i++) {
      html += `<li class="pass-row${i <= reached ? ' reached' : ''}${i === reached + 1 ? ' next' : ''}">
        ${cell('free', i, reached, p)}<span class="pass-num">${i}</span>${cell('prem', i, reached, p)}</li>`;
    }
    $('pass-list').innerHTML = html;
    for (const b of $('pass-list').querySelectorAll('.pass-claim')) {
      b.addEventListener('click', () => {
        const tr = b.dataset.track;
        const tier = Number(b.dataset.tier);
        const list = tr === 'free' ? p.free : p.prem;
        if (list.includes(tier)) return;
        list.push(tier);
        const r = passReward(tr, tier);
        grant(r);
        writeSave(save);
        track('pass_claim', { track: tr, tier, coins: r.coins || 0, skin: r.skin || '' });
        sfx.buy();
        buzz(15);
        refreshWallet();
        renderPass();
        refreshBadges();
      });
    }
    refreshBadges();
  }

  // Claims every reached tier on both tracks in one go.
  function claimAll() {
    const p = pass();
    const reached = tierOf(p.xp);
    let coins = 0;
    let count = 0;
    for (let i = 1; i <= reached; i++) {
      for (const tr of p.premium ? ['free', 'prem'] : ['free']) {
        const list = tr === 'free' ? p.free : p.prem;
        if (list.includes(i)) continue;
        list.push(i);
        const r = passReward(tr, i);
        grant(r);
        coins += r.coins || 0;
        count++;
      }
    }
    if (!count) return;
    writeSave(save);
    track('pass_claim_all', { count, coins });
    sfx.win();
    buzz([20, 30, 20]);
    refreshWallet();
    renderPass();
    refreshBadges();
  }

  function openPass() {
    renderPass();
    $('screen-pass').hidden = false;
    // Scroll the list (not the page) so the next tier sits in the middle.
    requestAnimationFrame(() => {
      const list = $('pass-list');
      const next = list.querySelector('.pass-row.next') || list.lastElementChild;
      if (next) list.scrollTop = Math.max(0, next.offsetTop - list.offsetTop - list.clientHeight / 2 + next.clientHeight / 2);
    });
  }

  async function unlockPremium() {
    const ok = await payments.buy('premium_pass');
    track('purchase', { kind: 'iap', id: 'premium_pass', cost: 0, granted: ok });
    if (!ok) return;
    pass().premium = true;
    writeSave(save);
    sfx.win();
    renderPass();
  }

  // Called at the end of every level. Returns the XP gained.
  function onLevelEnd(won, mult = 1) {
    const p = pass();
    const before = tierOf(p.xp);
    const gain = won ? 100 + Math.round((mult - 1) * 40) : 30;
    p.xp += gain;
    writeSave(save);
    refreshBadges();
    return { gain, tierUp: tierOf(p.xp) > before };
  }

  // ---------------------------------------------------------------- daily reward
  function dailyState() {
    const today = localDay();
    const yesterday = localDay(new Date(Date.now() - DAY));
    const d = save.daily || { last: '', streak: 0 };
    const ready = d.last !== today;
    const day = d.last === yesterday ? (d.streak % 7) + 1 : d.last === today ? d.streak : 1;
    return { ready, day, today };
  }

  function renderDaily() {
    const st = dailyState();
    let html = '';
    DAILY.forEach((c, i) => {
      const n = i + 1;
      const state = n < st.day ? 'done' : n === st.day ? 'today' : 'later';
      html += `<li class="day ${state}${n === 7 ? ' big' : ''}"><small>${t('daily.day', { n })}</small><b><span class="coin-icon" aria-hidden="true"></span>${fmt(c)}</b></li>`;
    });
    $('daily-list').innerHTML = html;
  }

  async function claimDaily(double) {
    const st = dailyState();
    if (!st.ready) return;
    let mult = 1;
    if (double) {
      $('btn-daily-double').disabled = true;
      const ok = await ads.showRewarded('daily');
      track('ad_reward', { placement: 'daily', granted: ok });
      $('btn-daily-double').disabled = false;
      if (!ok) return;
      mult = 2;
    }
    const coins = DAILY[st.day - 1] * mult;
    save.coins += coins;
    save.daily = { last: st.today, streak: st.day };
    writeSave(save);
    track('daily_claim', { day: st.day, coins });
    sfx.win();
    buzz([20, 30, 20]);
    refreshWallet();
    $('screen-daily').hidden = true;
  }

  function openDailyIfReady() {
    if (!dailyState().ready) return false;
    renderDaily();
    $('screen-daily').hidden = false;
    return true;
  }

  $('btn-pass').addEventListener('click', () => { sfx.tap(); openPass(); });
  $('btn-pass-close').addEventListener('click', () => { $('screen-pass').hidden = true; });
  $('btn-pass-unlock').addEventListener('click', unlockPremium);
  $('btn-pass-all').addEventListener('click', claimAll);
  $('btn-daily-claim').addEventListener('click', () => claimDaily(false));
  $('btn-daily-double').addEventListener('click', () => claimDaily(true));

  refreshBadges();
  function addXp(n) {
    pass().xp += n;
    writeSave(save);
    refreshBadges();
  }

  const currentTier = () => tierOf(pass().xp);
  return { onLevelEnd, openPass, openDailyIfReady, refreshBadges, addXp, currentTier };
}
