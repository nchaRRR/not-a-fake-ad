// "Enjoying the game?" — asked at a happy moment, never after a loss, a few times at most.
// Yes → the phone's own rating sheet (Play / App Store in-app review). No → an email to us instead,
// so unhappy players talk to us rather than leaving a one-star review.
const CSS = `
.rv { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; background: rgba(43,33,64,0.5); padding: 20px; animation: rvIn 0.2s ease both; }
@keyframes rvIn { from { opacity: 0; } to { opacity: 1; } }
.rv-card { width: min(100%, 360px); background: var(--paper, #fff7ef); border: 3px solid var(--ink, #2b2140); border-radius: 24px; box-shadow: 0 6px 0 var(--ink, #2b2140);
  padding: 22px 18px 18px; display: flex; flex-direction: column; gap: 12px; text-align: center; color: var(--ink, #2b2140); font-family: var(--font-body, system-ui, sans-serif);
  animation: rvPop 0.35s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes rvPop { from { transform: scale(0.7); } to { transform: none; } }
.rv-face { font-size: 52px; line-height: 1; }
.rv-card h2 { margin: 0; font: 800 26px/1.1 var(--font-display, sans-serif); }
.rv-card p { margin: 0; font-weight: 700; color: var(--ink-soft, #5d5172); }
.rv-btn { font: 800 20px/1 var(--font-display, sans-serif); border: 3px solid var(--ink, #2b2140); border-radius: 16px; padding: 14px 16px 11px; cursor: pointer; color: #fff;
  background: var(--green, #2eb872); box-shadow: inset 0 -5px 0 rgba(0,0,0,0.18), 0 4px 0 var(--ink, #2b2140); }
.rv-btn.alt { background: var(--paper, #fff7ef); color: var(--ink, #2b2140); box-shadow: inset 0 -5px 0 var(--line, #ecd9cb), 0 4px 0 var(--ink, #2b2140); }
.rv-btn:active { transform: translateY(3px); }
.rv-later { background: none; border: 0; font: 800 14px var(--font-body, sans-serif); color: var(--ink-soft, #5d5172); text-decoration: underline; cursor: pointer; padding: 4px; }
`;

export function createReview({ game, save, writeSave, t, track = () => {}, remote, email = 'destek@nimoriq.com', gameName = 'Not a Fake Ad', canShow = () => true }) {
  function css() {
    if (document.getElementById('rv-style')) return;
    const s = document.createElement('style'); s.id = 'rv-style'; s.textContent = CSS; document.head.appendChild(s);
  }
  const state = () => (save.review = save.review || { wins: 0, asked: 0, last: 0, done: false });

  async function nativeReview() {
    const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.InAppReview;
    if (!p) return false;
    try { await p.requestReview(); return true; } catch (e) { return false; }
  }

  function show() {
    css();
    const box = document.createElement('div');
    box.className = 'rv';
    box.innerHTML = `<div class="rv-card"><div class="rv-face">😍</div><h2>${t('rv.title')}</h2><p>${t('rv.body')}</p>
      <button type="button" class="rv-btn" data-a="yes">${t('rv.yes')}</button><button type="button" class="rv-btn alt" data-a="no">${t('rv.no')}</button>
      <button type="button" class="rv-later" data-a="later">${t('rv.later')}</button></div>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.addEventListener('click', async (e) => {
      const a = e.target && e.target.closest && e.target.closest('[data-a]');
      if (!a) return;
      const st = state();
      if (a.dataset.a === 'yes') {
        st.done = true; writeSave(save); track('review', { answer: 'yes' }); close();
        await nativeReview();
      } else if (a.dataset.a === 'no') {
        st.done = true; writeSave(save); track('review', { answer: 'no' });
        box.querySelector('.rv-card').innerHTML = `<div class="rv-face">🛠️</div><h2>${t('rv.fb.title')}</h2><p>${t('rv.fb.body')}</p>
          <button type="button" class="rv-btn" data-a="mail">${t('rv.fb.btn')}</button><button type="button" class="rv-later" data-a="later">${t('rv.later')}</button>`;
      } else if (a.dataset.a === 'mail') {
        track('review', { answer: 'mail' }); close();
        try { window.open(`mailto:${email}?subject=${encodeURIComponent(gameName + ' - ' + t('rv.fb.subject'))}`, '_blank'); } catch (err) { /* blocked */ }
      } else { track('review', { answer: 'later' }); close(); }
    });
  }

  return {
    // call after a win; kind: 'win' | 'big' (boss, 3 stars, record)
    onWin(kind = 'win') {
      const st = state();
      st.wins++;
      writeSave(save);
      if (st.done || st.asked >= 3 || (remote && !remote.bool('review_enabled', true))) return false;
      const need = remote ? remote.num('review_after_wins', 8, 2, 100) : 8;
      if (st.wins < need || Date.now() - st.last < 20 * 864e5) return false;
      if (kind !== 'big' && st.wins < need * 2) return false;
      if (!canShow()) return false;
      st.asked++; st.last = Date.now(); writeSave(save);
      track('review_prompt', { n: st.asked, wins: st.wins });
      setTimeout(show, 900);
      return true;
    },
    show,
  };
}
