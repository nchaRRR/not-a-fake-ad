// Weekly and all-time leaderboards (Supabase: lb_submit / lb_top / lb_rename in 003_leaderboard_config.sql).
// No account needed: a random id made on this phone plus a name the player can change.
// The screen is built here (series look), so each game only calls submit() and open().
import { CLOUD_CONFIG } from './cloud.js';

const CSS = `
.lb { position: fixed; inset: 0; z-index: 110; background: rgba(43,33,64,0.5); display: flex; justify-content: center; overflow-y: auto;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(env(safe-area-inset-bottom, 0px) + 16px); animation: lbIn 0.2s ease both; }
@keyframes lbIn { from { opacity: 0; } to { opacity: 1; } }
.lb-card { width: min(100%, 420px); margin: auto 0; background: var(--paper, #fff7ef); border: 3px solid var(--ink, #2b2140); border-radius: 24px; box-shadow: 0 6px 0 var(--ink, #2b2140);
  padding: 18px 14px 14px; display: flex; flex-direction: column; gap: 10px; color: var(--ink, #2b2140); font-family: var(--font-body, system-ui, sans-serif); }
.lb-card h2 { margin: 0; text-align: center; font: 800 28px/1.1 var(--font-display, sans-serif); }
.lb-tabs { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; }
.lb-tab { font: 800 14px var(--font-body, sans-serif); border: 3px solid var(--ink, #2b2140); border-radius: 999px; padding: 5px 12px; background: #fff; color: var(--ink, #2b2140); cursor: pointer; }
.lb-tab.on { background: var(--gold, #ffbe2e); }
.lb-list { display: flex; flex-direction: column; gap: 4px; min-height: 120px; max-height: 52vh; overflow-y: auto; }
.lb-row { display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 12px; background: #fff; border: 2px solid var(--line, #ecd9cb); font-weight: 800; }
.lb-row.me { background: #fff2b8; border-color: var(--gold, #ffbe2e); }
.lb-row .r { font: 800 18px var(--font-display, sans-serif); text-align: center; }
.lb-row .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-row .s { font: 800 18px var(--font-display, sans-serif); }
.lb-gap { text-align: center; color: var(--ink-soft, #5d5172); font-weight: 800; line-height: 0.6; }
.lb-msg { text-align: center; color: var(--ink-soft, #5d5172); font-weight: 700; padding: 24px 8px; margin: 0; }
.lb-name { display: flex; gap: 6px; }
.lb-name input { flex: 1; min-width: 0; font: 700 16px var(--font-body, sans-serif); border: 3px solid var(--ink, #2b2140); border-radius: 12px; padding: 8px 10px; color: var(--ink, #2b2140); background: #fff; }
.lb-btn { font: 800 17px/1 var(--font-display, sans-serif); border: 3px solid var(--ink, #2b2140); border-radius: 14px; padding: 11px 14px 9px; cursor: pointer; color: var(--ink, #2b2140);
  background: var(--paper, #fff7ef); box-shadow: inset 0 -4px 0 var(--line, #ecd9cb), 0 3px 0 var(--ink, #2b2140); }
.lb-btn.go { background: var(--green, #2eb872); color: #fff; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.18), 0 3px 0 var(--ink, #2b2140); }
.lb-links { display: flex; justify-content: space-between; gap: 8px; }
.lb-link { background: none; border: 0; font: 800 14px var(--font-body, sans-serif); color: var(--blue-deep, #1d5bc4); text-decoration: underline; cursor: pointer; padding: 4px 0; }
`;

const ANIMALS = ['🦊', '🐼', '🐸', '🐵', '🦁', '🐯', '🐨', '🐙', '🦄', '🐔', '🐧', '🦉'];

function uid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* old webview */ }
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

// boards: [{ id: 'endless', label: () => '…', fmt: (n) => '…' }]
export function createLeaderboard({ game, enabled, t, sfx = {}, boards, track = () => {} }) {
  const idKey = `${game}-iid`;
  const nameKey = `${game}-lbname`;
  const pendKey = `${game}-lbpend`;
  let installId = null;
  try { installId = JSON.parse(localStorage.getItem(idKey)); } catch (e) { /* none */ }
  if (!installId) { installId = uid(); try { localStorage.setItem(idKey, JSON.stringify(installId)); } catch (e) { /* ignore */ } }
  const defaultName = () => `${ANIMALS[parseInt(String(installId).replace(/\W/g, '').slice(-4), 36) % ANIMALS.length]} ${t('lb.player')} ${String(parseInt(String(installId).replace(/\W/g, '').slice(-6), 36) % 9000 + 1000)}`;
  const getName = () => { try { return localStorage.getItem(nameKey) || defaultName(); } catch (e) { return defaultName(); } };
  const best = {}; // local best per board (also shown in the web preview)
  try { Object.assign(best, JSON.parse(localStorage.getItem(`${game}-lbbest`)) || {}); } catch (e) { /* none */ }

  async function rpc(fn, body) {
    const r = await fetch(`${CLOUD_CONFIG.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CLOUD_CONFIG.key, Authorization: `Bearer ${CLOUD_CONFIG.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('lb ' + r.status);
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  // scores that could not be sent wait here and go with the next one
  function pending() { try { return JSON.parse(localStorage.getItem(pendKey)) || {}; } catch (e) { return {}; } }
  async function flush() {
    if (!enabled) return;
    const p = pending();
    for (const [board, score] of Object.entries(p)) {
      try {
        await rpc('lb_submit', { p_game: game, p_board: board, p_install: installId, p_name: getName(), p_score: score });
        delete p[board];
      } catch (e) { break; }
    }
    try { localStorage.setItem(pendKey, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function submit(board, score) {
    score = Math.floor(Number(score) || 0);
    if (score <= 0) return;
    if (score > (best[board] || 0)) {
      best[board] = score;
      try { localStorage.setItem(`${game}-lbbest`, JSON.stringify(best)); } catch (e) { /* ignore */ }
    }
    if (!enabled) return;
    const p = pending();
    p[board] = Math.max(p[board] || 0, score);
    try { localStorage.setItem(pendKey, JSON.stringify(p)); } catch (e) { /* ignore */ }
    flush();
  }

  function css() {
    if (document.getElementById('lb-style')) return;
    const s = document.createElement('style'); s.id = 'lb-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  function open(boardId = boards[0].id) {
    css();
    let board = boardId;
    let period = 'week';
    const root = document.createElement('div');
    root.className = 'lb';
    root.innerHTML = `<div class="lb-card" role="dialog" aria-label="${t('lb.title')}"><h2>🏆 ${t('lb.title')}</h2>
      ${boards.length > 1 ? `<div class="lb-tabs lb-boards">${boards.map((b) => `<button type="button" class="lb-tab" data-b="${b.id}">${b.label()}</button>`).join('')}</div>` : ''}
      <div class="lb-tabs lb-periods"><button type="button" class="lb-tab" data-p="week">${t('lb.week')}</button><button type="button" class="lb-tab" data-p="all">${t('lb.all')}</button></div>
      <div class="lb-list"></div>
      <div class="lb-name" hidden><input maxlength="18" autocomplete="nickname" aria-label="${t('lb.name')}"><button type="button" class="lb-btn go lb-save">${t('lb.save')}</button></div>
      <div class="lb-links"><button type="button" class="lb-link lb-rename">✏️ ${t('lb.rename')}</button></div>
      <button type="button" class="lb-btn lb-close">${t('close')}</button></div>`;
    document.body.appendChild(root);
    const list = root.querySelector('.lb-list');
    const fmt = () => (boards.find((b) => b.id === board).fmt || String);
    const paintTabs = () => {
      for (const b of root.querySelectorAll('[data-b]')) b.classList.toggle('on', b.dataset.b === board);
      for (const b of root.querySelectorAll('[data-p]')) b.classList.toggle('on', b.dataset.p === period);
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r);
    async function load() {
      paintTabs();
      const f = fmt();
      if (!enabled) {
        const mine = best[board] || 0;
        list.innerHTML = `<p class="lb-msg">${t('lb.web')}</p>${mine ? `<div class="lb-row me"><span class="r">–</span><span class="n">${esc(getName())}</span><span class="s">${f(mine)}</span></div>` : ''}`;
        return;
      }
      list.innerHTML = `<p class="lb-msg">…</p>`;
      try {
        await flush();
        const rows = await rpc('lb_top', { p_game: game, p_board: board, p_period: period, p_install: installId });
        if (!rows || !rows.length) { list.innerHTML = `<p class="lb-msg">${t('lb.empty')}</p>`; return; }
        let html = '';
        let prev = 0;
        for (const r of rows) {
          if (r.rank > prev + 1 && prev) html += '<div class="lb-gap">⋮</div>';
          html += `<div class="lb-row${r.me ? ' me' : ''}"><span class="r">${medal(r.rank)}</span><span class="n">${esc(r.name)}${r.me ? ` · ${t('lb.you')}` : ''}</span><span class="s">${f(r.score)}</span></div>`;
          prev = r.rank;
        }
        list.innerHTML = html;
      } catch (e) {
        list.innerHTML = `<p class="lb-msg">${t('lb.offline')}</p>`;
      }
    }
    root.addEventListener('click', async (e) => {
      const el = e.target.closest('button');
      if (!el) { if (e.target === root) root.remove(); return; }
      if (sfx.tap) sfx.tap();
      if (el.dataset.b) { board = el.dataset.b; load(); }
      else if (el.dataset.p) { period = el.dataset.p; load(); }
      else if (el.classList.contains('lb-close')) root.remove();
      else if (el.classList.contains('lb-rename')) {
        const row = root.querySelector('.lb-name');
        row.hidden = false;
        const inp = row.querySelector('input');
        inp.value = getName();
        inp.focus();
      } else if (el.classList.contains('lb-save')) {
        const v = root.querySelector('.lb-name input').value.replace(/[<>"\\\n\r\t]/g, '').trim().slice(0, 18);
        if (v) {
          try { localStorage.setItem(nameKey, v); } catch (err) { /* ignore */ }
          track('lb_rename', {});
          if (enabled) { try { await rpc('lb_rename', { p_game: game, p_install: installId, p_name: v }); } catch (err) { /* later */ } }
        }
        root.querySelector('.lb-name').hidden = true;
        load();
      }
    });
    track('lb_open', { board });
    load();
  }

  flush();
  return { submit, open, getName, installId };
}
