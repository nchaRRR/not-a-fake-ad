// Opening screen (studio splash + game logo) and the first-launch onboarding pages.
// The same file is used by every Not a Fake Ad game; each game passes its own logo, pages and words.
//
//   runOpening({
//     key: 'nfa-choices',            // remembers that onboarding was seen
//     logo: '<h1 class="logo">…</h1>',
//     pages: [{ art: '<svg…>', title, body }, …],
//     str: { presents, notFake, skip, next, start },
//     onboard: true,                 // false for players who already have progress
//   }) -> Promise<{ onboarded: boolean }>
//
// Tapping the splash skips it. The promise resolves when the player is on the home screen.

const CSS = `
.op { position: fixed; inset: 0; z-index: 200; background: radial-gradient(120% 90% at 50% 40%, #fff7ef 0%, #ffe9d6 60%, #ffd9bd 100%);
  display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); place-items: center; overflow: hidden; color: var(--ink, #2b2140); font-family: var(--font-body, system-ui, sans-serif);
  -webkit-user-select: none; user-select: none; transition: opacity 0.35s ease; touch-action: pan-x; }
.op.out { opacity: 0; pointer-events: none; }
.op-rays { position: absolute; left: 50%; top: 42%; width: 160vmax; height: 160vmax; transform: translate(-50%, -50%);
  background: repeating-conic-gradient(rgba(255,190,46,0.16) 0 9deg, transparent 9deg 18deg); animation: opSpin 30s linear infinite; pointer-events: none; }
@keyframes opSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }
.op-splash { position: relative; display: grid; place-items: center; width: 100%; height: 100%; }
.op-studio { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 6px; animation: opStudio 1.15s ease both; }
.op-mark { width: 74px; height: 74px; border-radius: 22px; background: var(--ink, #2b2140); color: #ffbe2e; display: grid; place-items: center;
  font: 800 46px/1 var(--font-display, sans-serif); box-shadow: 0 6px 0 rgba(43,33,64,0.25); transform: rotate(-6deg); }
.op-studio b { font: 800 30px/1 var(--font-display, sans-serif); letter-spacing: 0.18em; margin-top: 8px; }
.op-studio small { font-weight: 800; font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-soft, #5d5172); }
@keyframes opStudio { 0% { opacity: 0; transform: scale(0.85); } 25% { opacity: 1; transform: scale(1); } 75% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.08); } }
.op-logo { position: relative; opacity: 0; animation: opLogo 0.6s cubic-bezier(.2,1.5,.4,1) 1.05s both; }
.op-logo .logo { margin: 0; }
@keyframes opLogo { from { opacity: 0; transform: scale(0.3) rotate(-14deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
.op-stamp { position: absolute; left: 50%; top: calc(50% + 92px); transform: translate(-50%, 0) rotate(-10deg);
  font: 800 28px/1 var(--font-display, sans-serif); letter-spacing: 0.06em; color: #2eb872; border: 6px solid #2eb872; border-radius: 14px;
  padding: 6px 16px 2px; background: rgba(255,255,255,0.85); animation: opStamp 0.35s cubic-bezier(.2,1.6,.4,1) 1.7s both; white-space: nowrap; }
@keyframes opStamp { from { opacity: 0; transform: translate(-50%, 0) rotate(-10deg) scale(2.6); } to { opacity: 1; transform: translate(-50%, 0) rotate(-10deg) scale(1); } }
.op-tap { position: absolute; bottom: calc(env(safe-area-inset-bottom, 0px) + 22px); left: 0; right: 0; text-align: center; font-weight: 800; font-size: 13px; color: var(--ink-soft, #5d5172); opacity: 0; animation: opFade 0.4s ease 2s both; }
@keyframes opFade { to { opacity: 0.8; } }
.op-skipped * { animation-delay: 0s !important; animation-duration: 0.01s !important; }
.op-skipped .op-studio { display: none; }

.op-board { position: relative; width: 100%; min-width: 0; height: 100%; display: flex; flex-direction: column; animation: opIn 0.35s ease both;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 0 calc(env(safe-area-inset-bottom, 0px) + 18px); }
@keyframes opIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.op-top { display: flex; justify-content: flex-end; padding: 0 max(16px, env(safe-area-inset-right, 0px)); min-height: 40px; }
.op-skip { background: none; border: 0; font: 800 16px var(--font-body, sans-serif); color: var(--ink-soft, #5d5172); padding: 8px 4px; cursor: pointer; }
.op-pages { flex: 1; min-height: 0; width: 100%; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.op-pages::-webkit-scrollbar { display: none; }
.op-page { flex: 0 0 100%; scroll-snap-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  padding: 0 max(28px, env(safe-area-inset-left, 0px)); text-align: center; }
.op-art { width: min(78vw, 300px, 40vh); aspect-ratio: 1; display: grid; place-items: center; background: #fff; border: 4px solid var(--ink, #2b2140);
  border-radius: 36px; box-shadow: 0 8px 0 var(--ink, #2b2140); overflow: hidden; }
.op-art svg { width: 100%; height: 100%; display: block; }
.op-page h2 { margin: 10px 0 0; font: 800 clamp(26px, 7.4vw, 34px)/1.05 var(--font-display, sans-serif); max-width: 16ch; text-wrap: balance; }
.op-page p { margin: 0; max-width: 30ch; font-weight: 700; font-size: 17px; line-height: 1.35; color: var(--ink-soft, #5d5172); text-wrap: balance; }
.op-dots { display: flex; justify-content: center; gap: 8px; margin: 10px 0 14px; }
.op-dots i { width: 10px; height: 10px; border-radius: 5px; background: var(--line, #ecd9cb); border: 2px solid var(--ink, #2b2140); transition: width 0.2s, background 0.2s; }
.op-dots i.on { width: 28px; background: var(--gold, #ffbe2e); }
.op-next { margin: 0 auto; width: min(calc(100% - 40px), 380px); font: 800 26px/1 var(--font-display, sans-serif); color: #fff; cursor: pointer;
  border: 3px solid var(--ink, #2b2140); border-radius: 18px; padding: 18px 20px 15px; background: var(--green, #2eb872);
  box-shadow: inset 0 -5px 0 var(--green-deep, #1f8a54), 0 4px 0 var(--ink, #2b2140); }
.op-next:active { transform: translateY(3px); box-shadow: inset 0 -3px 0 var(--green-deep, #1f8a54), 0 1px 0 var(--ink, #2b2140); }
@media (prefers-reduced-motion: reduce) { .op-rays { animation: none; } }
@media (max-height: 620px) { .op-page p { font-size: 15px; } .op-page { gap: 8px; } }
`;

function seen(key) { try { return localStorage.getItem(key + '-onboarded') === '1'; } catch (e) { return false; } }
function markSeen(key) { try { localStorage.setItem(key + '-onboarded', '1'); } catch (e) { /* storage blocked */ } }

export function runOpening(cfg) {
  if (!document.getElementById('op-style')) {
    const st = document.createElement('style');
    st.id = 'op-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'op';
  root.setAttribute('role', 'dialog');
  root.innerHTML = `<div class="op-rays"></div><div class="op-splash">
    <div class="op-studio" aria-hidden="true"><span class="op-mark">N</span><b>NIMORIQ</b><small>${cfg.str.presents}</small></div>
    <div class="op-logo">${cfg.logo}</div>
    <div class="op-stamp">${cfg.str.notFake}</div>
    <div class="op-tap" aria-hidden="true">▶</div>
  </div>`;
  document.body.appendChild(root);

  return new Promise((resolve) => {
    let stage = 'splash';
    let timer = 0;
    const finish = (onboarded) => {
      root.classList.add('out');
      setTimeout(() => root.remove(), 400);
      resolve({ onboarded });
    };
    const afterSplash = () => {
      if (stage !== 'splash') return;
      stage = 'board';
      clearTimeout(timer);
      if (!cfg.onboard || seen(cfg.key) || !cfg.pages || !cfg.pages.length) { finish(false); return; }
      showBoard();
    };
    const skipSplash = () => {
      if (stage !== 'splash') return;
      if (!root.classList.contains('op-skipped')) {
        root.classList.add('op-skipped');
        clearTimeout(timer);
        timer = setTimeout(afterSplash, 450);
      } else afterSplash();
    };
    root.addEventListener('pointerdown', skipSplash);
    timer = setTimeout(afterSplash, 2700);

    function showBoard() {
      root.removeEventListener('pointerdown', skipSplash);
      const pages = cfg.pages;
      root.innerHTML = `<div class="op-board">
        <div class="op-top"><button type="button" class="op-skip">${cfg.str.skip}</button></div>
        <div class="op-pages">${pages.map((p) => `<section class="op-page"><div class="op-art" aria-hidden="true">${p.art}</div><h2>${p.title}</h2><p>${p.body}</p></section>`).join('')}</div>
        <div class="op-dots">${pages.map(() => '<i></i>').join('')}</div>
        <button type="button" class="op-next">${cfg.str.next}</button>
      </div>`;
      const strip = root.querySelector('.op-pages');
      const dots = [...root.querySelectorAll('.op-dots i')];
      const next = root.querySelector('.op-next');
      const at = () => Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
      const paint = () => {
        const i = Math.min(pages.length - 1, at());
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
        next.textContent = i === pages.length - 1 ? cfg.str.start : cfg.str.next;
      };
      strip.addEventListener('scroll', paint, { passive: true });
      paint();
      const done = () => { markSeen(cfg.key); if (cfg.onTap) cfg.onTap(); finish(true); };
      next.addEventListener('click', () => {
        if (cfg.onTap) cfg.onTap();
        const i = at();
        if (i >= pages.length - 1) done();
        else strip.scrollTo({ left: (i + 1) * strip.clientWidth, behavior: 'smooth' });
      });
      root.querySelector('.op-skip').addEventListener('click', done);
    }
  });
}
