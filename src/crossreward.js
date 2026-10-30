// Gifts for playing the other Nimoriq games. Works through the shared account: when the player is
// signed in, we read their level in the other games (their own save rows; row level security) and
// unlock the gifts here. Each gift is claimed once.
const CSS = `
.cr { position: fixed; inset: 0; z-index: 110; background: rgba(43,33,64,0.5); display: flex; justify-content: center; overflow-y: auto;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(env(safe-area-inset-bottom, 0px) + 16px); }
.cr-card { width: min(100%, 420px); margin: auto 0; background: var(--paper, #fff7ef); border: 3px solid var(--ink, #2b2140); border-radius: 24px; box-shadow: 0 6px 0 var(--ink, #2b2140);
  padding: 18px 14px 14px; display: flex; flex-direction: column; gap: 10px; color: var(--ink, #2b2140); font-family: var(--font-body, system-ui, sans-serif); text-align: center; }
.cr-card h2 { margin: 0; font: 800 26px/1.1 var(--font-display, sans-serif); }
.cr-card > p { margin: 0; font-weight: 700; color: var(--ink-soft, #5d5172); }
.cr-row { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; text-align: left; border: 3px solid var(--ink, #2b2140); border-radius: 16px; background: #fff; padding: 8px 10px; }
.cr-row img { width: 44px; height: 44px; border-radius: 11px; border: 2px solid var(--ink, #2b2140); }
.cr-row b { display: block; font: 800 16px/1.15 var(--font-display, sans-serif); }
.cr-row small { font-weight: 700; color: var(--ink-soft, #5d5172); font-size: 12px; }
.cr-row .bar { height: 8px; border-radius: 4px; background: var(--line, #ecd9cb); margin-top: 4px; overflow: hidden; }
.cr-row .bar i { display: block; height: 100%; background: var(--gold, #ffbe2e); }
.cr-btn { font: 800 16px/1 var(--font-display, sans-serif); border: 3px solid var(--ink, #2b2140); border-radius: 12px; padding: 9px 12px 7px; cursor: pointer; color: #fff;
  background: var(--green, #2eb872); box-shadow: 0 3px 0 var(--ink, #2b2140); }
.cr-btn:disabled { background: var(--line, #ecd9cb); color: var(--ink-soft, #5d5172); cursor: default; }
.cr-btn.plain { color: var(--ink, #2b2140); background: var(--paper, #fff7ef); }
.cr-done { font-weight: 800; color: var(--green-deep, #1f8a54); }
`;

// rewards: [{ id, from: 'tower'|'nfa'|'choices', level, gift: () => 'text', grant: () => void }]
// levels(): Promise<{ tower?: n, nfa?: n, choices?: n } | null>  (null = not signed in)
export function createCrossRewards({ save, writeSave, t, sfx = {}, track = () => {}, rewards, levels, icons = {}, names = {}, onSignIn = () => {} }) {
  const claimed = () => (save.cross = save.cross || {});
  let last = null;

  async function refresh() {
    try { last = await levels(); } catch (e) { last = null; }
    return last;
  }
  const ready = () => (last ? rewards.filter((r) => !claimed()[r.id] && (last[r.from] || 0) >= r.level) : []);

  function css() {
    if (document.getElementById('cr-style')) return;
    const s = document.createElement('style'); s.id = 'cr-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  async function open() {
    css();
    const root = document.createElement('div');
    root.className = 'cr';
    document.body.appendChild(root);
    const paint = () => {
      const signed = last !== null;
      root.innerHTML = `<div class="cr-card"><h2>🎁 ${t('cr.title')}</h2><p>${t('cr.body')}</p>
        ${rewards.map((r) => {
          const have = signed ? (last[r.from] || 0) : 0;
          const done = !!claimed()[r.id];
          const can = signed && !done && have >= r.level;
          const pct = Math.min(100, Math.round((have / r.level) * 100));
          return `<div class="cr-row">${icons[r.from] ? `<img src="${icons[r.from]}" alt="">` : '<span></span>'}<div><b>${r.gift()}</b><small>${t('cr.need', { n: r.level, game: names[r.from] || r.from })}</small>${signed && !done ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>
            ${done ? `<span class="cr-done">✓</span>` : `<button type="button" class="cr-btn" data-id="${r.id}" ${can ? '' : 'disabled'}>${t('cr.claim')}</button>`}</div>`;
        }).join('')}
        ${signed ? '' : `<p>${t('cr.signin')}</p><button type="button" class="cr-btn" data-a="signin">${t('cr.signinBtn')}</button>`}
        <button type="button" class="cr-btn plain" data-a="close">${t('close')}</button></div>`;
    };
    root.innerHTML = `<div class="cr-card"><h2>🎁 ${t('cr.title')}</h2><p>…</p></div>`;
    await refresh();
    paint();
    track('cross_open', { signed: last !== null });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) { if (e.target === root) root.remove(); return; }
      if (b.dataset.a === 'close') { if (sfx.tap) sfx.tap(); root.remove(); return; }
      if (b.dataset.a === 'signin') { if (sfx.tap) sfx.tap(); root.remove(); onSignIn(); return; }
      const r = rewards.find((x) => x.id === b.dataset.id);
      if (!r || claimed()[r.id] || !last || (last[r.from] || 0) < r.level) return;
      claimed()[r.id] = Date.now();
      r.grant();
      writeSave(save);
      if (sfx.buy) sfx.buy();
      track('cross_claim', { id: r.id });
      paint();
    });
  }

  return { open, refresh, ready, count: () => ready().length };
}
