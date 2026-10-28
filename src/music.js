// Background music, generated live: no audio files to ship or license.
// A bouncy 4-chord loop. Menus get a gentle version; the run adds drums;
// the boss fight doubles the hats and adds a lead.
import { getAudioContext } from './audio.js';

const BPM = 122;
const STEP = 60 / BPM / 4; // sixteenth notes
// C - G - Am - F, as root notes (MIDI)
const ROOTS = [48, 43, 45, 41];
const CHORDS = [
  [60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65],
];
const LEAD = [72, 0, 74, 76, 0, 79, 76, 0, 74, 0, 72, 0, 71, 0, 72, 0];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

let master = null;
let timer = null;
let nextTime = 0;
let step = 0;
let intensity = 0; // 0 menu, 1 run, 2 boss
let enabled = true;
let noiseBuf = null;

function ensureGraph(ctx) {
  if (master) return;
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const len = ctx.sampleRate * 0.3;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function note(ctx, t, freq, dur, type, vol, cutoff) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.connect(f);
    out = f;
  }
  o.connect(g);
  out.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function kick(ctx, t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.2);
}

function hiss(ctx, t, dur, vol, freq) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

function schedule(ctx, t, i) {
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  const root = ROOTS[bar];
  const chord = CHORDS[bar];

  // Bass on the eighths, octave jump on the offbeat.
  if (s % 2 === 0) note(ctx, t, midi(root + (s % 4 === 2 ? 12 : 0)), STEP * 1.8, 'triangle', 0.32, 900);
  // Plucked arpeggio.
  const arp = chord[(s >> 1) % 3] + (s >= 8 ? 12 : 0);
  if (s % 2 === 1 || intensity === 0) note(ctx, t, midi(arp), STEP * 1.5, 'square', intensity === 0 ? 0.05 : 0.06, 2400);

  if (intensity >= 1) {
    if (s % 4 === 0) kick(ctx, t);
    if (s === 4 || s === 12) hiss(ctx, t, 0.16, 0.35, 1800); // snare
    if (s % 2 === 1) hiss(ctx, t, 0.04, 0.12, 7000); // hats
  }
  if (intensity === 2) {
    if (s % 2 === 0) hiss(ctx, t, 0.03, 0.1, 8000);
    if (LEAD[s]) note(ctx, t, midi(LEAD[s] + (bar === 3 ? -2 : 0)), STEP * 1.6, 'sawtooth', 0.05, 3000);
  }
}

function tick() {
  const ctx = getAudioContext();
  if (!ctx || !master) return;
  while (nextTime < ctx.currentTime + 0.15) {
    schedule(ctx, nextTime, step);
    nextTime += STEP;
    step = (step + 1) % 64;
  }
}

function targetVolume() {
  if (!enabled) return 0;
  return intensity === 0 ? 0.35 : 0.5;
}

// Call after the first tap (browsers block sound before that).
export function startMusic() {
  const ctx = getAudioContext();
  if (!ctx) return;
  ensureGraph(ctx);
  if (!timer) {
    nextTime = ctx.currentTime + 0.05;
    timer = setInterval(tick, 30);
  }
  master.gain.setTargetAtTime(targetVolume(), ctx.currentTime, 0.4);
}

export function setMusicIntensity(level) {
  intensity = level;
  const ctx = getAudioContext();
  if (ctx && master) master.gain.setTargetAtTime(targetVolume(), ctx.currentTime, 0.4);
}

export function setMusicEnabled(on) {
  enabled = on;
  const ctx = getAudioContext();
  if (ctx && master) master.gain.setTargetAtTime(targetVolume(), ctx.currentTime, 0.2);
}

// Quiet while the game is hidden or paused.
export function duckMusic(on) {
  const ctx = getAudioContext();
  if (ctx && master) master.gain.setTargetAtTime(on ? 0 : targetVolume(), ctx.currentTime, 0.15);
}
