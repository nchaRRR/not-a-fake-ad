// Automatic graphics. With the quality setting on "auto", the game watches the frame rate
// while a level is running (the first seconds, then every few seconds of a long run) and
// steps down one tier whenever it stays under 45 fps. The tier is remembered on this device
// only: it lives outside the save, because the save follows the player to other phones.
// A quality the player picked by hand is never changed.

const KEY = 'not-a-fake-ad-autoq';
const LOW_FPS = 45;
const FIRST_WINDOW = 4; // seconds measured at the start of play
const LONG_WINDOW = 8; // seconds per check later in a run
const WARMUP = 1.2; // the first frames of a level compile shaders; don't judge them

// What each tier costs. 0 = full, 1 = balanced, 2 = light.
export const TIERS = [
  { ratio: 2, shadows: true, shadowMap: 1024, particles: 1, allyDraw: 160, enemyDraw: 1400, corpses: 70, cheap: false, snow: 1 },
  { ratio: 1.5, shadows: true, shadowMap: 512, particles: 0.7, allyDraw: 130, enemyDraw: 900, corpses: 45, cheap: false, snow: 0.7 },
  { ratio: 1, shadows: false, shadowMap: 512, particles: 0.45, allyDraw: 90, enemyDraw: 500, corpses: 25, cheap: true, snow: 0.4 },
];

function load() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= 0 && v < TIERS.length ? Math.floor(v) : 0;
  } catch (e) {
    return 0;
  }
}

export function createAutoQuality({ mode, apply, onStep }) {
  let tier = load();
  const win = { frames: 0, time: 0, warm: WARMUP, checks: 0 };
  const reset = () => { win.frames = 0; win.time = 0; };

  // Called every frame with the real (unscaled) frame time.
  function sample(realDt, active) {
    if (mode() !== 'auto' || tier >= TIERS.length - 1) return;
    if (!active) { win.warm = WARMUP; reset(); return; }
    // A gap of a second or more means the app was in the background or the tab was hidden: start over.
    // (Shorter ones are real slow frames, and on a struggling phone those are exactly what must count.)
    if (realDt >= 1) { win.warm = WARMUP; reset(); return; }
    if (win.warm > 0) { win.warm -= realDt; return; }
    win.frames++;
    win.time += realDt;
    if (win.time < (win.checks === 0 ? FIRST_WINDOW : LONG_WINDOW)) return;
    const fps = win.frames / win.time;
    win.checks++;
    reset();
    if (fps >= LOW_FPS) return;
    tier++;
    try { localStorage.setItem(KEY, String(tier)); } catch (e) { /* remembered for this session only */ }
    apply(tier);
    win.warm = WARMUP * 2; // switching materials recompiles shaders
    onStep(tier, Math.round(fps));
  }

  return {
    sample,
    tier: () => tier,
    // For tests: forget what was learned on this device.
    forget() { tier = 0; win.checks = 0; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  };
}
