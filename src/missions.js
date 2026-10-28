// Three daily missions. Each pays coins and season pass XP.
// Picked from the date, so every player gets the same three on the same day.
import { t } from './i18n.js';

const TYPES = {
  kill: (L) => 40 + L * 6,
  win: () => 3,
  boss: () => 2,
  doors: () => 10,
  flip: () => 2,
  bonus: () => 1, // reach x3 or more on the multiplier tiles
  coins: (L) => 250 + L * 25,
  barrels: () => 6,
};

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickThree(key) {
  let h = 0;
  for (const c of key) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  const names = Object.keys(TYPES);
  const out = [];
  for (let guard = 0; out.length < 3 && guard < 200; guard++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0; // imul keeps the low bits exact
    const n = names[h % names.length];
    if (!out.includes(n)) out.push(n);
  }
  for (const n of names) if (out.length < 3 && !out.includes(n)) out.push(n);
  return out;
}

export function createMissions(ctx) {
  const { save, writeSave, fmt, sfx, buzz, refreshWallet, track, addPassXp, popup } = ctx;
  const $ = (id) => document.getElementById(id);

  function today() {
    const key = dayKey();
    if (!save.missions || save.missions.day !== key) {
      const L = save.level || 1;
      save.missions = {
        day: key,
        list: pickThree(key).map((type) => ({ type, target: TYPES[type](L), progress: 0, claimed: false })),
      };
      writeSave(save);
    }
    return save.missions;
  }

  const reward = () => ({ coins: 100 + (save.level || 1) * 10, xp: 120 });

  function readyCount() {
    return today().list.filter((m) => m.progress >= m.target && !m.claimed).length;
  }

  function refreshBadge() {
    const n = readyCount();
    $('missions-badge').hidden = n === 0;
    $('missions-badge').textContent = n;
  }

  // Called by the game whenever something countable happens.
  function count(type, n = 1) {
    const m = today().list.find((x) => x.type === type);
    if (!m || m.claimed || m.progress >= m.target) return;
    m.progress = Math.min(m.target, m.progress + n);
    if (m.progress >= m.target) {
      popup(t('mission.done'), 'gun');
      sfx.coin();
      track('mission_complete', { type });
    }
    writeSave(save);
    refreshBadge();
  }

  function claimAll() {
    const r = reward();
    let n = 0;
    for (const m of today().list) {
      if (m.claimed || m.progress < m.target) continue;
      m.claimed = true;
      n++;
    }
    if (!n) return;
    save.coins += r.coins * n;
    writeSave(save);
    addPassXp(r.xp * n);
    track('mission_claim_all', { count: n });
    sfx.win();
    buzz([20, 30, 20]);
    refreshWallet();
    render();
    refreshBadge();
  }

  function render() {
    const r = reward();
    $('btn-missions-all').hidden = readyCount() < 2;
    $('missions-list').innerHTML = today().list.map((m, i) => {
      const done = m.progress >= m.target;
      const pct = Math.round((m.progress / m.target) * 100);
      const action = m.claimed
        ? '<span class="pass-check">✓</span>'
        : done
          ? `<button type="button" class="pass-claim" data-i="${i}">${t('pass.claim')}</button>`
          : `<span class="mission-count">${fmt(m.progress)}/${fmt(m.target)}</span>`;
      return `<li class="mission${m.claimed ? ' claimed' : ''}">
        <div class="mission-text">
          <b>${t(`mission.${m.type}`, { n: fmt(m.target) })}</b>
          <div class="bar mission-bar" aria-hidden="true"><div style="transform:scaleX(${pct / 100})"></div></div>
          <small><span class="coin-icon" aria-hidden="true"></span>${fmt(r.coins)} · +${r.xp} XP</small>
        </div>${action}</li>`;
    }).join('');
    for (const b of $('missions-list').querySelectorAll('.pass-claim')) {
      b.addEventListener('click', () => {
        const m = today().list[Number(b.dataset.i)];
        if (!m || m.claimed) return;
        m.claimed = true;
        save.coins += r.coins;
        writeSave(save);
        addPassXp(r.xp);
        track('mission_claim', { type: m.type });
        sfx.buy();
        buzz(15);
        refreshWallet();
        render();
        refreshBadge();
      });
    }
  }

  $('btn-missions').addEventListener('click', () => { sfx.tap(); render(); $('screen-missions').hidden = false; });
  $('btn-missions-close').addEventListener('click', () => { $('screen-missions').hidden = true; });
  $('btn-missions-all').addEventListener('click', claimAll);
  refreshBadge();

  return { count, refreshBadge };
}
