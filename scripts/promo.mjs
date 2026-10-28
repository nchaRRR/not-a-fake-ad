// Splash screen and Play Store feature graphic, rendered in 3D like the icon.
// Usage: node scripts/promo.mjs   (writes to assets/brand/)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const sharp = require('/opt/npm-tools/node_modules/sharp');
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const out = resolve(root, 'assets/brand');

const bundle = (await esbuild.build({
  entryPoints: [resolve(root, 'scripts/icon-scene.js')], bundle: true, format: 'iife', write: false,
  alias: { three: resolve(root, 'vendor/three/three.module.js') },
})).outputFiles[0].text;
const font = (f) => `data:font/ttf;base64,${readFileSync(resolve(root, 'assets/fonts', f)).toString('base64')}`;
const CSS = `
@font-face { font-family: "Baloo 2"; src: url(${font('Baloo2.ttf')}); font-weight: 400 800; }
@font-face { font-family: Nunito; src: url(${font('Nunito.ttf')}); font-weight: 200 1000; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { overflow: hidden; }
#wrap { position: relative; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.logo { position: absolute; font-family: "Baloo 2"; font-weight: 800; color: #fff; text-align: center; line-height: 0.86;
  -webkit-text-stroke: calc(var(--l) * 0.07) #2b2140; paint-order: stroke fill; text-shadow: 0 calc(var(--l) * 0.09) 0 #2b2140;
  font-size: var(--l); transform: translate(-50%, -50%) rotate(-3deg); white-space: nowrap; }
.logo .strike { position: relative; display: inline-block; color: #e8453c; }
.logo .strike::after { content: ""; position: absolute; left: -4%; right: -4%; top: 52%; height: calc(var(--l) * 0.12);
  background: #2b2140; border-radius: 99px; transform: rotate(-8deg); }
.sub { position: absolute; transform: translate(-50%, 0) rotate(-3deg); font: 900 var(--s) Nunito; color: #2b2140;
  background: #ffbe2e; border: calc(var(--s) * 0.14) solid #2b2140; border-radius: 999px; padding: 0.25em 0.8em 0.2em;
  box-shadow: 0 calc(var(--s) * 0.16) 0 #2b2140; white-space: nowrap; }
`;

async function shot(browser, { concept, w, h, scale = 1, overlay }) {
  const page = await browser.newPage({ viewport: { width: w * scale, height: h * scale } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body><div id="wrap" style="width:${w * scale}px;height:${h * scale}px"><canvas id="c"></canvas>${overlay(scale)}</div></body></html>`);
  await page.evaluate(async () => { await document.fonts.load('800 100px "Baloo 2"'); await document.fonts.load('900 100px Nunito'); });
  await page.evaluate((p) => { window.ICON = p; }, { concept, w: w * scale, h: h * scale });
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.__done, null, { timeout: 180000 });
  const buf = await page.locator('#wrap').screenshot();
  await page.close();
  return sharp(buf).resize(w, h, { kernel: 'lanczos3' }).flatten({ background: '#7db6ef' }).removeAlpha();
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const logo = (x, y, l) => `<div class="logo" style="--l:${l}px;left:${x}px;top:${y}px">Not a<br><span class="strike">Fake</span> Ad</div>`;
const sub = (x, y, s, text) => `<div class="sub" style="--s:${s}px;left:${x}px;top:${y}px">${text}</div>`;

// Play feature graphic: 1024x500, logo on the left, the door choice on the right.
await (await shot(browser, { concept: 'feature', w: 1024, h: 500, scale: 2,
  overlay: (k) => logo(255 * k, 215 * k, 104 * k) + sub(255 * k, 360 * k, 30 * k, 'The game from those ads') })).png().toFile(resolve(out, 'feature-graphic-1024x500.png'));
console.log('feature graphic');
// Splash: 2732 square; phones crop it from the sides, so everything sits in the middle.
await (await shot(browser, { concept: 'splash', w: 2732, h: 2732, scale: 1,
  overlay: () => logo(1366, 820, 300) })).png().toFile(resolve(out, 'splash-2732.png'));
console.log('splash');
await browser.close();
