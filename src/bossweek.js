// Boss Week: a mega boss on the home screen, new every ISO week (Monday 00:00 on the phone).
// It can be fought any number of times, but pays out once a day; the first win of each week
// also gives a squad look (one of three, in rotation). Remote config "boss_week": false turns it off.
import { t } from './i18n.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const MIN_LEVEL = 5;
export const WEEK_SKINS = ['titan', 'inferno', 'phantom'];

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ISO 8601 week of a local date, e.g. "2026-W44", and the local time the week ends (next Monday 00:00).
export function isoWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = d.getUTCDay() || 7; // Monday 1 ... Sunday 7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // the Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (8 - ((now.getDay() || 7))));
  return { key: `${year}-W${String(week).padStart(2, '0')}`, n: year * 53 + week, end: end.getTime() };
}

function timeLeft(ms) {
  const h = Math.max(1, Math.ceil(ms / HOUR));
  return h >= 24 ? t('bw.left.dh', { d: Math.floor(h / 24), h: h % 24 }) : t('bw.left.h', { h });
}

export function createBossWeek(ctx) {
  const { save, writeSave, remote, track, fmt, sfx, onPlay, skinColors } = ctx;
  const $ = (id) => document.getElementById(id);

  function state() {
    const wk = isoWeek();
    if (!save.bw || save.bw.week !== wk.key) {
      save.bw = { week: wk.key, won: [], skin: false };
      writeSave(save);
    }
    return save.bw;
  }

  const enabled = () => remote.bool('boss_week', true) && save.level >= MIN_LEVEL;
  const doneToday = () => state().won.includes(dayKey());
  const coins = () => Math.round((300 + Math.min(save.level, 80) * 20) * remote.num('boss_week_coins', 1, 0.2, 5));

  // This week's look, or null once the player owns all three.
  function weekSkin() {
    const st = state();
    if (st.skin) return null;
    const wk = isoWeek();
    for (let i = 0; i < WEEK_SKINS.length; i++) {
      const id = WEEK_SKINS[(wk.n + i) % WEEK_SKINS.length];
      if (!save.owned.skins.includes(id)) return id;
    }
    return null;
  }

  function render() {
    const card = $('btn-bossweek');
    card.hidden = !enabled();
    if (card.hidden) return;
    const done = doneToday();
    const now = Date.now();
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    card.classList.toggle('done', done);
    $('bw-time').textContent = done ? t('bw.back', { time: timeLeft(tomorrow - now) }) : t('bw.ends', { time: timeLeft(isoWeek().end - now) });
    const skin = weekSkin();
    let reward = `<span class="coin-icon" aria-hidden="true"></span>${fmt(coins())}`;
    if (skin && !done) {
      const c = skinColors(skin);
      reward += `<span class="bw-plus">+</span><span class="mini-soldier" aria-hidden="true" style="--b:${c.body};--h:${c.head}"></span>`;
    }
    $('bw-reward').innerHTML = done ? '<span class="bw-check" aria-hidden="true">✓</span>' : reward;
    card.setAttribute('aria-label', `${t('bw.title')}. ${$('bw-time').textContent}`);
  }

  // Pays out once a day. Returns what was given, for the win screen.
  function onWin() {
    const st = state();
    if (st.won.includes(dayKey())) return { coins: 0, skin: null };
    const r = { coins: coins(), skin: weekSkin() };
    st.won.push(dayKey());
    save.coins += r.coins;
    if (r.skin) {
      st.skin = true;
      save.owned.skins.push(r.skin);
    }
    writeSave(save);
    track('boss_week_win', { week: st.week, coins: r.coins, skin: r.skin || '', level: save.level });
    return r;
  }

  $('btn-bossweek').addEventListener('click', () => {
    if (!enabled()) return;
    sfx.tap();
    track('boss_week_start', { week: state().week, done: doneToday(), level: save.level });
    onPlay();
  });

  return { render, onWin, enabled, doneToday, state };
}
