// Card album: 24 cards in four sets of six, drawn as inline SVG in the series look.
// A won level has a chance to drop a card (world bosses and Boss Week always do); rarer cards
// drop less often. Duplicates turn into coins. A finished set pays coins and a squad look.
// Saved as save.cards = { have: { id: copies }, fresh: [ids not looked at yet], sets: [finished set ids] }.
import { t } from './i18n.js';

export const SETS = [
  { id: 'arsenal', color: '#ff9628', reward: { coins: 1000, skin: 'steel' } },
  { id: 'enemies', color: '#e8453c', reward: { coins: 1200, skin: 'crimson' } },
  { id: 'traps', color: '#1fae9f', reward: { coins: 1200, skin: 'hazard' } },
  { id: 'bosses', color: '#7a5cf0', reward: { coins: 2000, skin: 'holo' } },
];

// r: c(ommon), r(are), e(pic). Three commons, two rares and one epic per set.
export const CARDS = [
  { id: 'rifle', set: 'arsenal', r: 'c' }, { id: 'shotgun', set: 'arsenal', r: 'c' }, { id: 'minigun', set: 'arsenal', r: 'c' },
  { id: 'sniper', set: 'arsenal', r: 'r' }, { id: 'laser', set: 'arsenal', r: 'r' }, { id: 'rocket', set: 'arsenal', r: 'e' },
  { id: 'grunt', set: 'enemies', r: 'c' }, { id: 'runner', set: 'enemies', r: 'c' }, { id: 'shield', set: 'enemies', r: 'c' },
  { id: 'splitter', set: 'enemies', r: 'r' }, { id: 'medic', set: 'enemies', r: 'r' }, { id: 'giant', set: 'enemies', r: 'e' },
  { id: 'door', set: 'traps', r: 'c' }, { id: 'saw', set: 'traps', r: 'c' }, { id: 'barrel', set: 'traps', r: 'c' },
  { id: 'turret', set: 'traps', r: 'r' }, { id: 'slider', set: 'traps', r: 'r' }, { id: 'mystery', set: 'traps', r: 'e' },
  { id: 'bplains', set: 'bosses', r: 'c' }, { id: 'bdesert', set: 'bosses', r: 'c' }, { id: 'bsnow', set: 'bosses', r: 'c' },
  { id: 'bnight', set: 'bosses', r: 'r' }, { id: 'blava', set: 'bosses', r: 'r' }, { id: 'bmega', set: 'bosses', r: 'e' },
];

const DUP_COINS = { c: 30, r: 80, e: 200 };
const ODDS = { normal: { c: 72, r: 23, e: 5 }, boss: { c: 50, r: 38, e: 12 } };
const byId = (id) => CARDS.find((c) => c.id === id);
const setOf = (id) => SETS.find((s) => s.id === id);
export const cardName = (c) => t(c.set === 'arsenal' ? `gun.${c.id}` : `card.${c.id}`);

// ---------------------------------------------------------------- art
const INK = '#2b2140';
const sw = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

function gunArt(id) {
  const parts = {
    rifle: `<rect x="10" y="46" width="14" height="12" rx="3" fill="#8a5a3a" ${sw}/><rect x="22" y="42" width="40" height="14" rx="3" fill="#5d5172" ${sw}/><rect x="60" y="45" width="28" height="7" rx="2" fill="${INK}"/><path d="M38 56l-4 16h9l4-16" fill="#5d5172" ${sw}/>`,
    shotgun: `<rect x="8" y="48" width="18" height="13" rx="4" fill="#8a5a3a" ${sw}/><rect x="24" y="43" width="30" height="16" rx="3" fill="#5d5172" ${sw}/><rect x="52" y="41" width="38" height="8" rx="2" fill="${INK}"/><rect x="52" y="51" width="38" height="8" rx="2" fill="${INK}"/><path d="M34 59l-3 13h9l3-13" fill="#5d5172" ${sw}/>`,
    minigun: `<rect x="12" y="38" width="30" height="26" rx="6" fill="#5d5172" ${sw}/><g fill="${INK}"><rect x="42" y="38" width="46" height="6" rx="2"/><rect x="42" y="47" width="46" height="6" rx="2"/><rect x="42" y="56" width="46" height="6" rx="2"/></g><rect x="56" y="35" width="7" height="30" rx="2" fill="#ffbe2e" ${sw}/><path d="M22 64v12h10V64" fill="#5d5172" ${sw}/>`,
    sniper: `<rect x="6" y="48" width="16" height="11" rx="3" fill="#3f8f4a" ${sw}/><rect x="20" y="46" width="32" height="11" rx="3" fill="#3f8f4a" ${sw}/><rect x="50" y="49" width="44" height="5" rx="2" fill="${INK}"/><rect x="28" y="34" width="20" height="9" rx="4" fill="${INK}"/><circle cx="48" cy="38" r="5" fill="#7ff6ff" ${sw}/><path d="M32 57l-3 15h8l3-15" fill="#3f8f4a" ${sw}/>`,
    laser: `<rect x="70" y="46" width="28" height="8" rx="4" fill="#7ff6ff" opacity="0.8"/><rect x="12" y="42" width="40" height="17" rx="8" fill="#eef3fb" ${sw}/><rect x="50" y="45" width="22" height="11" rx="3" fill="#19c8ff" ${sw}/><circle cx="28" cy="50" r="4" fill="#19c8ff"/><path d="M26 59l-3 13h9l3-13" fill="#eef3fb" ${sw}/>`,
    rocket: `<rect x="8" y="40" width="60" height="20" rx="8" fill="#3f8f4a" ${sw}/><path d="M68 42h12l12 8-12 8H68z" fill="#ff6a2a" ${sw}/><rect x="20" y="36" width="10" height="28" rx="3" fill="#ffbe2e" ${sw}/><path d="M38 60l-3 13h9l3-13" fill="#3f8f4a" ${sw}/>`,
  };
  return parts[id];
}

function figureArt(body, extra = '', { helmet = '#7a1f1a', scale = 1, head = '#f0c8a8' } = {}) {
  return `<g transform="translate(50 56) scale(${scale}) translate(-50 -56)">
    <rect x="38" y="74" width="9" height="16" rx="3" fill="#3a1a1a" ${sw}/><rect x="53" y="74" width="9" height="16" rx="3" fill="#3a1a1a" ${sw}/>
    <rect x="33" y="42" width="34" height="36" rx="14" fill="${body}" ${sw}/>
    <circle cx="50" cy="30" r="13" fill="${head}" ${sw}/>
    <path d="M36 28a14 14 0 0 1 28 0z" fill="${helmet}" ${sw}/>
    <circle cx="45" cy="33" r="2" fill="${INK}"/><circle cx="55" cy="33" r="2" fill="${INK}"/>${extra}</g>`;
}

function bossArt(body, dark, extra = '') {
  return `<rect x="34" y="76" width="12" height="16" rx="3" fill="${dark}" ${sw}/><rect x="54" y="76" width="12" height="16" rx="3" fill="${dark}" ${sw}/>
    <rect x="14" y="44" width="14" height="28" rx="7" fill="${body}" ${sw}/><rect x="72" y="44" width="14" height="28" rx="7" fill="${body}" ${sw}/>
    <rect x="24" y="38" width="52" height="44" rx="22" fill="${body}" ${sw}/>
    <path d="M36 22l-6-12 12 6M64 22l6-12-12 6" fill="#fff1d6" ${sw}/>
    <circle cx="50" cy="28" r="15" fill="${dark}" ${sw}/>
    <circle cx="44" cy="28" r="4" fill="#fff"/><circle cx="56" cy="28" r="4" fill="#fff"/><circle cx="45" cy="29" r="2" fill="${INK}"/><circle cx="57" cy="29" r="2" fill="${INK}"/>${extra}`;
}

function doorArt(fill, text, extra = '') {
  return `<rect x="14" y="14" width="8" height="78" rx="3" fill="#fff7ef" ${sw}/><rect x="78" y="14" width="8" height="78" rx="3" fill="#fff7ef" ${sw}/>
    <rect x="20" y="20" width="60" height="54" rx="10" fill="${fill}" ${sw}/>
    <text x="50" y="58" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="30" fill="#fff" stroke="${INK}" stroke-width="4" paint-order="stroke">${text}</text>${extra}`;
}

const ART = {
  grunt: () => figureArt('#e8453c'),
  runner: () => figureArt('#ff8c1a', `<rect x="37" y="22" width="26" height="5" rx="2" fill="#ffe14d" ${sw}/><path d="M12 48h14M8 58h18M14 68h12" ${sw} fill="none"/>`, { helmet: '#5a2a0a' }),
  shield: () => figureArt('#e8453c', `<rect x="26" y="46" width="36" height="34" rx="6" fill="#8fa3c4" ${sw}/><path d="M34 54l20 18" stroke="#fff" stroke-width="3" opacity="0.6"/>`),
  splitter: () => figureArt('#8e44d8', `<rect x="42" y="58" width="16" height="4" rx="2" fill="${INK}"/><circle cx="50" cy="52" r="2.6" fill="${INK}"/><circle cx="50" cy="68" r="2.6" fill="${INK}"/>`, { helmet: '#4a1f78', scale: 1.08 }),
  medic: () => figureArt('#f4f1ea', `<path d="M45 4h10v8h8v10h-8v8H45v-8h-8V12h8z" fill="#2bd47a" ${sw} transform="translate(30 4) scale(0.75)"/>`, { helmet: '#1fae6a' }),
  giant: () => figureArt('#b52f28', `<path d="M40 38l20 0" stroke="${INK}" stroke-width="3"/>`, { helmet: '#2b1a1a', head: '#2b1a1a', scale: 1.12 }),
  door: () => doorArt('rgba(47,124,246,0.85)', '+10'),
  saw: () => `<rect x="8" y="78" width="84" height="6" rx="3" fill="#5d5172"/><path d="${(() => { let d = ''; for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2; const r = i % 2 ? 26 : 34; d += `${i ? 'L' : 'M'}${(50 + Math.cos(a) * r).toFixed(1)} ${(48 + Math.sin(a) * r).toFixed(1)}`; } return d; })()}z" fill="#c9ccd6" ${sw}/><circle cx="50" cy="48" r="9" fill="#e8453c" ${sw}/>`,
  barrel: () => `<rect x="28" y="20" width="44" height="66" rx="10" fill="#3c3a48" ${sw}/><rect x="26" y="32" width="48" height="8" rx="3" fill="#ffbe2e" ${sw}/><rect x="26" y="66" width="48" height="8" rx="3" fill="#ffbe2e" ${sw}/><text x="50" y="58" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="16" fill="#ffbe2e">$</text>`,
  turret: () => `<path d="M26 88l6-24h36l6 24z" fill="#4a4458" ${sw}/><rect x="28" y="38" width="44" height="28" rx="6" fill="#4a4458" ${sw}/><rect x="44" y="50" width="12" height="30" rx="4" fill="${INK}" transform="rotate(180 50 58)"/><circle cx="50" cy="44" r="5" fill="#ff3b30" ${sw}/><circle cx="50" cy="88" r="6" fill="#ff5a3c" opacity="0"/>`,
  slider: () => doorArt('rgba(47,124,246,0.85)', 'x3', `<path d="M8 86h84M18 80l-8 6 8 6M82 80l8 6-8 6" fill="none" ${sw}/>`),
  mystery: () => doorArt('rgba(138,92,240,0.9)', '?', '<circle cx="28" cy="28" r="3" fill="#fff"/><circle cx="72" cy="66" r="3" fill="#fff"/>'),
  bplains: () => bossArt('#b3261e', '#5a1f1f', `<circle cx="84" cy="36" r="10" fill="#6b5b73" ${sw}/>`),
  bdesert: () => bossArt('#9c6b3b', '#4a2f1a', `<path d="M6 90h20M4 82h14" ${sw} fill="none"/>`),
  bsnow: () => bossArt('#e9f1fb', '#3d5a80', `<path d="M8 20l10 10M18 20L8 30M13 18v14" stroke="#5b8fd6" stroke-width="3" fill="none"/>`),
  bnight: () => `<circle cx="50" cy="52" r="46" fill="#8f86ff" opacity="0.35" stroke="#ff4fd8" stroke-width="3"/>${bossArt('#7a2fd0', '#1c1033')}`,
  blava: () => bossArt('#1f1414', '#ff5a1f', `<path d="M10 92c-4-10 6-12 4-22 8 6 8 14 4 22zM84 92c-4-10 6-12 4-22 8 6 8 14 4 22z" fill="#ff8c2f" ${sw}/>`),
  bmega: () => bossArt('#34324a', '#1b1a2b', `<path d="M36 16l4-12 6 9 4-11 4 11 6-9 4 12z" fill="#ffbe2e" ${sw}/><rect x="38" y="25" width="24" height="6" rx="3" fill="#ff3df2"/>`),
};

export function cardArt(c) {
  const body = c.set === 'arsenal' ? gunArt(c.id) : ART[c.id]();
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${body}</svg>`;
}

// One card. state: { have, fresh, count }.
export function cardHtml(c, { have = true, fresh = false, count = 1 } = {}) {
  const set = setOf(c.set);
  const name = have ? cardName(c) : '???';
  return `<div class="tcard r-${c.r}${have ? '' : ' missing'}" style="--set:${set.color}" role="img" aria-label="${name}">
    <span class="tcard-art">${cardArt(c)}${have ? '' : '<b class="tcard-q">?</b>'}</span>
    <span class="tcard-name">${name}</span>
    <span class="tcard-gem" aria-hidden="true"></span>
    ${fresh ? `<span class="tcard-new">${t('album.new')}</span>` : ''}
    ${count > 1 ? `<span class="tcard-n">x${count}</span>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- collection
export function createCards(ctx) {
  const { save, writeSave, track, fmt, sfx, buzz, remote, skinColors, skinName, refreshWallet } = ctx;
  const $ = (id) => document.getElementById(id);
  let tab = 'arsenal';

  function state() {
    if (!save.cards || typeof save.cards !== 'object') save.cards = {};
    const c = save.cards;
    c.have = c.have || {};
    c.fresh = c.fresh || [];
    c.sets = c.sets || [];
    return c;
  }

  const total = () => CARDS.filter((c) => state().have[c.id]).length;
  const setCount = (setId) => CARDS.filter((c) => c.set === setId && state().have[c.id]).length;

  function pickCard(odds) {
    const w = ODDS[odds];
    let r = Math.random() * (w.c + w.r + w.e);
    const rarity = (r -= w.c) < 0 ? 'c' : (r -= w.r) < 0 ? 'r' : 'e';
    const pool = CARDS.filter((c) => c.r === rarity);
    let card = pool[Math.floor(Math.random() * pool.length)];
    // One reroll when it is a copy, so the album fills up at a fair pace.
    if (state().have[card.id]) card = pool[Math.floor(Math.random() * pool.length)];
    return card;
  }

  // After a won level. boss: a world boss or Boss Week, which always drop a card with better odds.
  // Returns the drop (or null): { card, dup, coins, set: finished set or null }.
  function onWin({ boss = false, source = 'level', level = 0 } = {}) {
    const chance = remote.num('card_chance', 0.35, 0, 1);
    if (!boss && Math.random() >= chance) return null;
    const st = state();
    const card = pickCard(boss ? 'boss' : 'normal');
    const dup = !!st.have[card.id];
    st.have[card.id] = (st.have[card.id] || 0) + 1;
    const drop = { card, dup, coins: 0, set: null };
    if (dup) {
      drop.coins = DUP_COINS[card.r];
      save.coins += drop.coins;
    } else {
      if (!st.fresh.includes(card.id)) st.fresh.push(card.id);
      drop.set = finishSet(card.set);
    }
    writeSave(save);
    track('card_drop', { id: card.id, rarity: card.r, set: card.set, dup, coins: drop.coins, source, level, owned: total() });
    refreshBadge();
    return drop;
  }

  function finishSet(setId) {
    const st = state();
    if (st.sets.includes(setId) || setCount(setId) < 6) return null;
    const set = setOf(setId);
    st.sets.push(setId);
    save.coins += set.reward.coins;
    if (!save.owned.skins.includes(set.reward.skin)) save.owned.skins.push(set.reward.skin);
    track('card_set_complete', { set: setId, coins: set.reward.coins, skin: set.reward.skin, owned: total() });
    return set;
  }

  function refreshBadge() {
    const n = state().fresh.length;
    $('album-badge').hidden = n === 0;
    $('album-badge').textContent = n;
  }

  // ---------------------------------------------------------------- win screen
  let pending = null;
  function showDrop(drop) {
    pending = drop;
    const box = $('won-card');
    box.hidden = !drop;
    box.classList.remove('melt');
    if (!drop) return;
    const { card, dup, coins, set } = drop;
    $('won-card-slot').innerHTML = cardHtml(card);
    $('won-card-kicker').textContent = t(dup ? 'album.dup' : 'album.newCard');
    $('won-card-name').textContent = cardName(card);
    let extra = t(`rarity.${card.r}`);
    if (dup) extra = t('album.dupCoins', { n: fmt(coins) });
    if (set) extra = t('album.setDone', { set: t(`set.${set.id}`), n: fmt(set.reward.coins), skin: skinName(set.reward.skin) });
    $('won-card-extra').textContent = extra;
    box.classList.toggle('set-done', !!set);
  }

  // Duplicates: once the win screen is up, the card melts into coins that fly to the total.
  function onWonShown(onLanded) {
    const drop = pending;
    pending = null;
    if (!drop || !drop.dup) return;
    setTimeout(() => {
      const from = $('won-card-slot').getBoundingClientRect();
      const to = $('won-coins').getBoundingClientRect();
      if (!from.width) return;
      $('won-card').classList.add('melt');
      for (let i = 0; i < 7; i++) {
        const c = document.createElement('span');
        c.className = 'fly-coin';
        c.style.left = `${from.left + from.width / 2 - 9}px`;
        c.style.top = `${from.top + from.height / 2 - 9}px`;
        c.style.setProperty('--dx', `${to.left + to.width / 2 - from.left - from.width / 2 + (Math.random() - 0.5) * 30}px`);
        c.style.setProperty('--dy', `${to.top + to.height / 2 - from.top - from.height / 2}px`);
        c.style.animationDelay = `${i * 60}ms`;
        document.body.appendChild(c);
        setTimeout(() => c.remove(), 1200 + i * 60);
      }
      setTimeout(() => { sfx.coin(); buzz(10); onLanded(drop.coins); refreshWallet(); }, 800);
    }, 700);
  }

  // ---------------------------------------------------------------- album
  function renderAlbum() {
    const st = state();
    $('album-count').textContent = `${total()}/${CARDS.length}`;
    for (const b of document.querySelectorAll('[data-set]')) {
      b.setAttribute('aria-selected', String(b.dataset.set === tab));
      const fresh = b.dataset.set !== tab && st.fresh.some((id) => byId(id).set === b.dataset.set);
      b.classList.toggle('has-new', fresh);
    }
    const set = setOf(tab);
    const n = setCount(tab);
    $('album-bar').style.transform = `scaleX(${n / 6})`;
    $('album-bar').style.background = set.color;
    $('album-prog-text').textContent = `${n}/6`;
    const done = st.sets.includes(tab);
    const c = skinColors(set.reward.skin);
    $('album-reward').innerHTML = done
      ? `<span class="album-done">✓ ${t('album.claimed')}</span>`
      : `<small>${t('album.complete')}</small><span class="coin-icon" aria-hidden="true"></span><b>${fmt(set.reward.coins)}</b><span class="bw-plus">+</span><span class="mini-soldier" aria-hidden="true" style="--b:${c.body};--h:${c.head}"></span><b>${skinName(set.reward.skin)}</b>`;
    $('album-grid').innerHTML = CARDS.filter((x) => x.set === tab)
      .map((x) => cardHtml(x, { have: !!st.have[x.id], fresh: st.fresh.includes(x.id), count: st.have[x.id] || 0 })).join('');
    // The NEW stickers show once.
    const before = st.fresh.length;
    st.fresh = st.fresh.filter((id) => byId(id).set !== tab);
    if (st.fresh.length !== before) writeSave(save);
    refreshBadge();
  }

  function openAlbum() {
    const st = state();
    // Open on a set that has something new.
    if (st.fresh.length) tab = byId(st.fresh[0]).set;
    renderAlbum();
    $('screen-album').hidden = false;
    track('album_open', { owned: total(), fresh: st.fresh.length });
  }

  $('btn-album').addEventListener('click', () => { sfx.tap(); openAlbum(); });
  $('btn-album-close').addEventListener('click', () => { $('screen-album').hidden = true; });
  for (const b of document.querySelectorAll('[data-set]')) {
    b.addEventListener('click', () => { tab = b.dataset.set; sfx.tap(); renderAlbum(); });
  }
  refreshBadge();

  return { onWin, showDrop, onWonShown, openAlbum, refreshBadge, total };
}
