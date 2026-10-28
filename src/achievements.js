// Achievements and personal records. They work on the device today and are
// mirrored to Game Center / Play Games through platform.js once packaged.
import { t } from './i18n.js';
import { platform } from './platform.js';

// stat: which counter it reads; goal: the number to reach.
export const ACHIEVEMENTS = [
  { id: 'first_win', stat: 'bestLevel', goal: 2 },
  { id: 'level_10', stat: 'bestLevel', goal: 11 },
  { id: 'level_25', stat: 'bestLevel', goal: 26 },
  { id: 'level_50', stat: 'bestLevel', goal: 51 },
  { id: 'army_100', stat: 'bestArmy', goal: 100 },
  { id: 'army_500', stat: 'bestArmy', goal: 500 },
  { id: 'army_1000', stat: 'bestArmy', goal: 1000 },
  { id: 'kills_1000', stat: 'kills', goal: 1000 },
  { id: 'kills_10000', stat: 'kills', goal: 10000 },
  { id: 'boss_10', stat: 'bosses', goal: 10 },
  { id: 'world_boss', stat: 'worldBosses', goal: 1 },
  { id: 'flip_25', stat: 'flips', goal: 25 },
  { id: 'mystery_10', stat: 'mysteries', goal: 10 },
  { id: 'dodge_25', stat: 'dodges', goal: 25 },
  { id: 'x5', stat: 'x5', goal: 1 },
  { id: 'all_weapons', stat: 'weapons', goal: 4 },
  { id: 'skins_5', stat: 'skins', goal: 5 },
  { id: 'streak_7', stat: 'bestStreak', goal: 7 },
  { id: 'jackpot', stat: 'jackpots', goal: 1 },
  { id: 'pass_30', stat: 'passTier', goal: 30 },
];

export function createAchievements(ctx) {
  const { save, writeSave, sfx, track, fmt } = ctx;
  const $ = (id) => document.getElementById(id);
  let tab = 'trophies';

  const stats = () => {
    if (!save.stats) save.stats = {};
    return save.stats;
  };
  const got = () => {
    if (!Array.isArray(save.achieved)) save.achieved = [];
    return save.achieved;
  };

  function toast(a) {
    const el = $('trophy-toast');
    $('trophy-toast-name').textContent = t(`ach.${a.id}`);
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function check() {
    const st = stats();
    const done = got();
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (done.includes(a.id)) continue;
      if ((st[a.stat] || 0) >= a.goal) {
        done.push(a.id);
        fresh.push(a);
        platform.unlockAchievement(a.id);
        track('achievement', { id: a.id });
      }
    }
    if (fresh.length) {
      writeSave(save);
      sfx.win();
      fresh.forEach((a, i) => setTimeout(() => toast(a), i * 3400));
    }
    refreshBadge();
  }

  // Add to a counter, or raise a record with `max`.
  function add(stat, n = 1) {
    const st = stats();
    st[stat] = (st[stat] || 0) + n;
    writeSave(save);
    check();
  }
  function max(stat, value) {
    const st = stats();
    if (value <= (st[stat] || 0)) return;
    st[stat] = value;
    if (stat === 'bestLevel') platform.submitScore('best_level', value - 1);
    if (stat === 'bestArmy') platform.submitScore('biggest_army', value);
    writeSave(save);
    check();
  }

  function refreshBadge() {
    // Badge shows trophies earned but not yet looked at.
    const unseen = got().length - (save.achSeen || 0);
    $('trophy-badge').hidden = unseen <= 0;
    $('trophy-badge').textContent = unseen;
  }

  function render() {
    for (const b of document.querySelectorAll('[data-ttab]')) b.setAttribute('aria-selected', String(b.dataset.ttab === tab));
    const st = stats();
    const done = got();
    if (tab === 'trophies') {
      $('trophy-count').textContent = t('ach.count', { n: done.length, max: ACHIEVEMENTS.length });
      $('trophy-list').innerHTML = ACHIEVEMENTS.map((a) => {
        const have = done.includes(a.id);
        const v = Math.min(a.goal, st[a.stat] || 0);
        const show = a.stat === 'bestLevel' ? Math.max(0, v - 1) : v;
        const goal = a.stat === 'bestLevel' ? a.goal - 1 : a.goal;
        return `<li class="trophy${have ? ' have' : ''}">
          <span class="trophy-icon" aria-hidden="true"></span>
          <div class="trophy-text"><b>${t(`ach.${a.id}`)}</b><small>${t(`ach.${a.id}.desc`)}</small>
          ${have ? '' : `<div class="bar mission-bar" aria-hidden="true"><div style="transform:scaleX(${v / a.goal})"></div></div>`}</div>
          <span class="trophy-state">${have ? '✓' : `${fmt(show)}/${fmt(goal)}`}</span></li>`;
      }).join('');
    } else {
      $('trophy-count').textContent = t('rec.note');
      const rows = [
        ['rec.level', Math.max(0, (st.bestLevel || 1) - 1)],
        ['rec.army', st.bestArmy || 0],
        ['rec.kills', st.kills || 0],
        ['rec.bosses', st.bosses || 0],
        ['rec.dodges', st.dodges || 0],
      ];
      $('trophy-list').innerHTML = rows.map(([k, v]) =>
        `<li class="record"><span>${t(k)}</span><strong>${fmt(v)}</strong></li>`).join('');
    }
  }

  function open() {
    tab = 'trophies';
    save.achSeen = got().length;
    writeSave(save);
    refreshBadge();
    render();
    $('screen-trophies').hidden = false;
  }

  for (const b of document.querySelectorAll('[data-ttab]')) {
    b.addEventListener('click', () => { tab = b.dataset.ttab; sfx.tap(); render(); });
  }
  $('btn-trophies').addEventListener('click', () => { sfx.tap(); open(); });
  $('btn-trophies-close').addEventListener('click', () => { $('screen-trophies').hidden = true; });

  refreshBadge();
  return { add, max, check, refreshBadge };
}
