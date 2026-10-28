// Renders the store icon, Android adaptive icon layers, splash screen and
// Play Store feature graphic from HTML, using the game's own fonts.
// Usage: node scripts/brand.mjs   (writes to assets/brand/)
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const sharp = require('/opt/npm-tools/node_modules/sharp');
const out = resolve(root, 'assets/brand');
mkdirSync(out, { recursive: true });
// Fonts go in as data URIs: a page set from a string cannot load file:// URLs.
const font = (f) => `data:font/ttf;base64,${readFileSync(resolve(root, 'assets/fonts', f)).toString('base64')}`;

const css = `
@font-face { font-family: Baloo; src: url(${font('Baloo2.ttf')}); font-weight: 400 800; }
@font-face { font-family: Nunito; src: url(${font('Nunito.ttf')}); font-weight: 200 1000; }
:root { --ink: #2b2140; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
.stage { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
.sky { position: absolute; inset: 0; background: linear-gradient(#7db6ef 0%, #c6d8f6 42%, #ffdccb 70%, #ffc3a6 100%); }
.track { position: absolute; left: 0; right: 0; bottom: 0; top: 46%;
  background: linear-gradient(#f9e6da, #fff5ec);
  clip-path: polygon(41% 0, 59% 0, 96% 100%, 4% 100%); }
.rail { position: absolute; left: 0; right: 0; bottom: 0; top: 46%; background: #ff8a7a;
  clip-path: polygon(40% 0, 41.2% 0, 5.5% 100%, 1% 100%, 1% 100%); }
.rail.r { clip-path: polygon(58.8% 0, 60% 0, 99% 100%, 94.5% 100%); }
.gate { position: absolute; display: grid; place-items: center;
  background: rgba(47,124,246,0.86); border: calc(var(--s) * 0.035) solid #9cc4ff; border-radius: calc(var(--s) * 0.09);
  box-shadow: 0 calc(var(--s) * 0.03) 0 rgba(43,33,64,0.35); }
.gate b { font-family: Baloo; font-weight: 800; color: #fff; line-height: 1; font-size: calc(var(--s) * 0.62);
  -webkit-text-stroke: calc(var(--s) * 0.055) var(--ink); paint-order: stroke fill; transform: translateY(4%); }
.post { position: absolute; background: #fff7ef; border-radius: 999px; box-shadow: 0 0 0 calc(var(--s) * 0.012) rgba(43,33,64,0.25); }
.tag { position: absolute; display: grid; place-items: center; background: #ffbe2e; border: calc(var(--t) * 0.07) solid var(--ink);
  border-radius: calc(var(--t) * 0.16); transform: rotate(-12deg); box-shadow: 0 calc(var(--t) * 0.06) 0 var(--ink); }
.tag b { font-family: Nunito; font-weight: 900; color: var(--ink); font-size: calc(var(--t) * 0.62); letter-spacing: 0.04em; line-height: 1; }
.tag::after { content: ""; position: absolute; left: -8%; right: -8%; top: 46%; height: calc(var(--t) * 0.09);
  background: #e8453c; border: calc(var(--t) * 0.03) solid var(--ink); border-radius: 99px; transform: rotate(-14deg); }
.crowd { position: absolute; }
.man { position: absolute; width: var(--m); height: calc(var(--m) * 1.5); }
.man::before { content: ""; position: absolute; left: 14%; right: 14%; top: 34%; bottom: 0; background: #2f7cf6;
  border-radius: 999px 999px 40% 40%; box-shadow: inset 0 calc(var(--m) * -0.12) 0 #1d5bc4; }
.man::after { content: ""; position: absolute; left: 25%; right: 25%; top: 0; height: 40%; background: #ffd6b0; border-radius: 50%; }
.logo { position: absolute; font-family: Baloo; font-weight: 800; color: #fff; text-align: center; line-height: 0.86;
  -webkit-text-stroke: calc(var(--l) * 0.07) var(--ink); paint-order: stroke fill; text-shadow: 0 calc(var(--l) * 0.09) 0 var(--ink);
  transform: rotate(-3deg); font-size: var(--l); }
.logo .strike { position: relative; display: inline-block; color: #e8453c; }
.logo .strike::after { content: ""; position: absolute; left: -4%; right: -4%; top: 52%; height: calc(var(--l) * 0.12);
  background: var(--ink); border-radius: 99px; transform: rotate(-8deg); }
`;

// Places a gate with posts. x,y = center in px, w,h in px.
function gate(x, y, w, h, text) {
  const s = h;
  return `
  <div class="post" style="left:${x - w / 2 - s * 0.05}px;top:${y - h * 0.62}px;width:${s * 0.07}px;height:${h * 1.32}px"></div>
  <div class="post" style="left:${x + w / 2 - s * 0.02}px;top:${y - h * 0.62}px;width:${s * 0.07}px;height:${h * 1.32}px"></div>
  <div class="gate" style="--s:${s}px;left:${x - w / 2}px;top:${y - h / 2}px;width:${w}px;height:${h}px"><b>${text}</b></div>`;
}

function tag(x, y, w) {
  return `<div class="tag" style="--t:${w * 0.5}px;left:${x - w / 2}px;top:${y - w * 0.25}px;width:${w}px;height:${w * 0.5}px"><b>AD</b></div>`;
}

// A loose cluster of little soldiers, back rows smaller.
function crowd(cx, cy, size, n) {
  let html = '';
  const spots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(i + 0.5) * size * 0.42;
    const a = i * 2.39996;
    spots.push({ x: cx + Math.cos(a) * r * 1.5, y: cy + Math.sin(a) * r * 0.55 });
  }
  spots.sort((a, b) => a.y - b.y);
  for (const p of spots) {
    const m = size * (0.82 + ((p.y - cy) / (size * 3)) * 0.4);
    html += `<div class="man" style="--m:${m}px;left:${p.x - m / 2}px;top:${p.y - m * 0.75}px"></div>`;
  }
  return html;
}

function logo(x, y, size) {
  return `<div class="logo" style="--l:${size}px;left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(-3deg)">Not a<br><span class="strike">Fake</span> Ad</div>`;
}

const scene = (inner, { sky = true } = {}) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="stage">${sky ? '<div class="sky"></div><div class="track"></div><div class="rail"></div><div class="rail r"></div>' : ''}${inner}</div></body></html>`;

const S = 1024;
const jobs = [
  // Store icon (App Store 1024 and Play Store 512 come from this).
  { name: 'icon-1024.png', w: S, h: S, html: scene(gate(S * 0.5, S * 0.42, S * 0.62, S * 0.4, 'x2') + tag(S * 0.76, S * 0.14, S * 0.3) + crowd(S * 0.5, S * 0.83, S * 0.1, 11)) },
  // Android adaptive icon: background and foreground layers, content inside the safe circle.
  { name: 'adaptive-background.png', w: S, h: S, html: scene('') },
  { name: 'adaptive-foreground.png', w: S, h: S, transparent: true,
    html: scene(gate(S * 0.5, S * 0.45, S * 0.44, S * 0.29, 'x2') + tag(S * 0.66, S * 0.29, S * 0.2) + crowd(S * 0.5, S * 0.69, S * 0.07, 9), { sky: false }) },
  // Splash screen, centered so any crop works.
  { name: 'splash-2732.png', w: 2732, h: 2732, html: scene(logo(1366, 1250, 300)) },
  // Play Store feature graphic.
  { name: 'feature-graphic-1024x500.png', w: 1024, h: 500,
    html: scene(logo(330, 230, 118) + gate(770, 205, 300, 190, 'x2') + tag(890, 90, 120) + crowd(770, 420, 46, 13)) },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
  await page.setContent(j.html);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(out, j.name), omitBackground: !!j.transparent });
  await page.close();
}
await browser.close();

// Derived sizes.
await sharp(resolve(out, 'icon-1024.png')).resize(512, 512).toFile(resolve(out, 'icon-512-play.png'));
await sharp(resolve(out, 'icon-1024.png')).resize(192, 192).toFile(resolve(out, 'icon-192.png'));
console.log('brand assets written to assets/brand');
