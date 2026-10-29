// Tiny synthesized sound effects: no audio files to ship or license.
let ctx = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (e) {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended' && !document.hidden) { bgSuspended = false; ctx.resume().catch(() => {}); }
}

// Silence everything while the app is in the background (home button, app switcher, phone call).
// The browser's visibility event covers the web; Capacitor's App plugin covers the packaged app.
let bgSuspended = false;
function setBackground(bg) {
  if (!ctx) return;
  if (bg) {
    if (ctx.state === 'running') {
      bgSuspended = true;
      ctx.suspend().catch(() => {});
    }
  } else if (bgSuspended) {
    bgSuspended = false;
    ctx.resume().catch(() => {});
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => setBackground(document.hidden));
  window.addEventListener('pagehide', () => setBackground(true));
  window.addEventListener('pageshow', () => setBackground(document.hidden));
  window.addEventListener('blur', () => { if (document.hidden) setBackground(true); });
  try {
    const app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (app && app.addListener) app.addListener('appStateChange', (s) => setBackground(!s.isActive));
  } catch (e) { /* not packaged */ }
}

// A full-screen video ad is playing: keep the game quiet underneath it.
export function adPause(on) { setBackground(on); }

export function setMuted(m) {
  muted = m;
}

export const getAudioContext = () => ctx;

// Filtered noise sweep, used for door whooshes.
function whoosh(dur = 0.28, vol = 0.12, from = 600, to = 3200) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start();
}

function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function noise(dur, vol = 0.2) {
  if (!ctx || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

let lastShot = 0;
export const sfx = {
  shoot: () => {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - lastShot < 0.07) return;
    lastShot = now;
    tone(1400 + Math.random() * 300, 0.03, 'square', 0.02, -900);
  },
  hit: () => tone(240 + Math.random() * 60, 0.05, 'triangle', 0.04, -80),
  gateGood: () => {
    whoosh();
    tone(523, 0.09, 'triangle', 0.11);
    tone(784, 0.16, 'triangle', 0.11, 0, 0.08);
  },
  gateBad: () => {
    whoosh(0.3, 0.1, 2400, 400);
    tone(300, 0.3, 'sawtooth', 0.09, -160);
  },
  // Rising notes as the army climbs the multiplier tiles.
  tile: (i) => {
    const f = 523 * Math.pow(2, (i * 2) / 12);
    tone(f, 0.12, 'triangle', 0.1);
    tone(f * 1.5, 0.12, 'triangle', 0.05, 0, 0.05);
  },
  bigBoom: () => {
    tone(90, 0.9, 'sawtooth', 0.14, -50);
    tone(60, 1.1, 'sine', 0.2, -20);
    noise(0.8, 0.28);
  },
  tick: () => tone(1000, 0.03, 'triangle', 0.04),
  coin: () => tone(1046, 0.08, 'triangle', 0.09),
  boom: () => {
    tone(140, 0.35, 'sawtooth', 0.1, -90);
    noise(0.3, 0.18);
  },
  lose: () => {
    tone(330, 0.25, 'triangle', 0.1, -60);
    tone(247, 0.4, 'triangle', 0.1, -60, 0.22);
  },
  win: () => {
    tone(523, 0.1, 'triangle', 0.11);
    tone(659, 0.1, 'triangle', 0.11, 0, 0.1);
    tone(784, 0.1, 'triangle', 0.11, 0, 0.2);
    tone(1046, 0.3, 'triangle', 0.11, 0, 0.3);
  },
  buy: () => {
    tone(660, 0.08, 'triangle', 0.1);
    tone(990, 0.14, 'triangle', 0.1, 0, 0.07);
  },
  tap: () => tone(460, 0.05, 'triangle', 0.07),
  roar: () => {
    tone(110, 0.7, 'sawtooth', 0.12, -50);
    tone(82, 0.8, 'square', 0.06, -30, 0.05);
    noise(0.5, 0.1);
  },
};
