// App icon work: renders icon concepts in 3D with the game's own models,
// then exports the store-ready set for the chosen one.
// Usage: node scripts/icons.mjs [concept]   (writes to assets/icons/)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const sharp = require('/opt/npm-tools/node_modules/sharp');
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const out = resolve(root, 'assets/icons');
mkdirSync(resolve(out, 'concepts'), { recursive: true });

const bundle = (await esbuild.build({
  entryPoints: [resolve(root, 'scripts/icon-scene.js')], bundle: true, format: 'iife', write: false,
  alias: { three: resolve(root, 'vendor/three/three.module.js') },
})).outputFiles[0].text;

const font = (f) => `data:font/ttf;base64,${readFileSync(resolve(root, 'assets/fonts', f)).toString('base64')}`;
const CSS = `
@font-face { font-family: "Baloo 2"; src: url(${font('Baloo2.ttf')}); font-weight: 400 800; }
@font-face { font-family: Nunito; src: url(${font('Nunito.ttf')}); font-weight: 200 1000; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: transparent; overflow: hidden; }
#wrap { position: relative; width: var(--px); height: var(--px); }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.tag { position: absolute; display: grid; place-items: center; background: #ffbe2e; border: calc(var(--t) * 0.075) solid #2b2140;
  border-radius: calc(var(--t) * 0.18); transform: rotate(-12deg); box-shadow: 0 calc(var(--t) * 0.07) 0 #2b2140; }
.tag b { font: 900 calc(var(--t) * 0.6) Nunito; color: #2b2140; letter-spacing: 0.04em; line-height: 1; transform: translateY(4%); }
.tag::after { content: ""; position: absolute; left: -10%; right: -10%; top: 44%; height: calc(var(--t) * 0.13);
  background: #e8453c; border: calc(var(--t) * 0.035) solid #2b2140; border-radius: 99px; transform: rotate(-16deg); }
`;

// Where the crossed-out AD sticker sits for each concept (fractions of the icon).
const STAMP = { doors: [0.77, 0.15, 0.3], pour: [0.78, 0.14, 0.3], hero: [0.79, 0.14, 0.28], versus: [0.78, 0.14, 0.3] };

async function render(browser, concept, { px = 2048, stamp = true, transparent = false, size = 1024, stampAt, zoomOut = 1, scene = true } = {}) {
  const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  const [sx, sy, sw] = stampAt || STAMP[concept];
  const tag = stamp ? `<div class="tag" style="--t:${px * sw * 0.5}px;left:${px * (sx - sw / 2)}px;top:${px * (sy - sw * 0.25)}px;width:${px * sw}px;height:${px * sw * 0.5}px"><b>AD</b></div>` : '';
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body><div id="wrap" style="--px:${px}px"><canvas id="c"></canvas>${tag}</div>
    <span style="font:800 20px 'Baloo 2';position:absolute;opacity:0">x2</span><span style="font:900 20px Nunito;position:absolute;opacity:0">AD</span></body></html>`);
  await page.evaluate(async () => { await document.fonts.load('800 100px "Baloo 2"'); await document.fonts.load('900 100px Nunito'); });
  if (scene) {
    await page.evaluate((p) => { window.ICON = p; }, { concept, px, transparent, zoomOut });
    await page.addScriptTag({ content: bundle });
    await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
  }
  const buf = await page.locator('#wrap').screenshot({ omitBackground: transparent });
  await page.close();
  return sharp(buf).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
}

// iOS-style rounded mask, for previews only (the stores apply their own).
const mask = (s, r = 0.2237) => Buffer.from(`<svg width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${s * r}" ry="${s * r}"/></svg>`);
const rounded = async (buf, s) => sharp(await sharp(buf).resize(s, s).png().toBuffer()).composite([{ input: mask(s), blend: 'dest-in' }]).png().toBuffer();

const CONCEPTS = ['doors', 'pour', 'versus'];
const pick = process.argv[2];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

if (!pick) {
  // Concept sheet: each concept big, plus how it reads at home-screen sizes.
  const shots = {};
  for (const c of CONCEPTS) {
    shots[c] = await render(browser, c);
    writeFileSync(resolve(out, 'concepts', `${c}.png`), shots[c]);
    console.log('rendered', c);
  }
  const W = 560, pad = 40;
  const comps = [];
  for (const [i, c] of CONCEPTS.entries()) {
    const x = pad + i * (W + pad);
    comps.push({ input: await rounded(shots[c], W), left: x, top: pad });
    let sx = x;
    for (const s of [180, 120, 87, 60]) {
      comps.push({ input: await rounded(shots[c], s), left: sx, top: pad + W + 40 + (180 - s) });
      sx += s + 24;
    }
  }
  const sheetW = pad + CONCEPTS.length * (W + pad);
  await sharp({ create: { width: sheetW, height: pad + W + 40 + 180 + pad, channels: 4, background: '#1b1b2a' } })
    .composite(comps).png().toFile(resolve(out, 'concepts-sheet.png'));
  console.log('sheet written');
} else {
  // Full export for the chosen concept.
  const ios = resolve(out, 'ios/AppIcon.appiconset');
  const android = resolve(out, 'android');
  mkdirSync(ios, { recursive: true });
  const master = await render(browser, pick, { px: 2048, size: 1024 });
  // App Store / Xcode: one 1024 icon, no transparency, no rounded corners.
  await sharp(master).flatten({ background: '#7db6ef' }).removeAlpha().png().toFile(resolve(ios, 'AppIcon-1024.png'));
  writeFileSync(resolve(ios, 'Contents.json'), JSON.stringify({
    images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2));
  // Google Play listing icon: 512x512, 32-bit PNG.
  await sharp(master).resize(512, 512).png().toFile(resolve(out, 'play-store-512.png'));
  // Android adaptive icon (108dp layers, only the middle ~66% is always visible):
  // background = the same shot pulled back so it fills the bleed, foreground = the AD sticker alone,
  // monochrome = the sticker as a single-colour glyph for Android 13+ themed icons.
  const SAFE = 72 / 108;
  const bg = await render(browser, pick, { px: 1536, size: 432, stamp: false, zoomOut: 1 / SAFE });
  // The sticker has to sit fully inside the safe circle, so it moves in from the corner.
  const fg = await render(browser, pick, { px: 1024, size: 432, transparent: true, scene: false, stampAt: [0.6, 0.31, 0.18] });
  // Themed icon: the sticker alone, big and centred; its dark ink becomes see-through.
  const big = await render(browser, pick, { px: 1024, size: 432, transparent: true, scene: false, stampAt: [0.5, 0.52, 0.5] });
  const { data, info } = await sharp(big).raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    alpha[i] = lum > 0.45 ? a : 0;
  }
  const mono = await sharp({ create: { width: 432, height: 432, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha, { raw: { width: 432, height: 432, channels: 1 } }).png().toBuffer();
  // On Android, the plain launcher icon is the full art shrunk into the safe area over the background.
  const combined = await sharp(bg).composite([{ input: fg }]).png().toBuffer();
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = resolve(android, `mipmap-${d}`);
    mkdirSync(dir, { recursive: true });
    const a = Math.round(108 * k);
    await sharp(bg).resize(a, a).png().toFile(resolve(dir, 'ic_launcher_background.png'));
    await sharp(fg).resize(a, a).png().toFile(resolve(dir, 'ic_launcher_foreground.png'));
    await sharp(mono).resize(a, a).png().toFile(resolve(dir, 'ic_launcher_monochrome.png'));
    const l = Math.round(48 * k);
    await sharp(await rounded(master, 512)).resize(l, l).png().toFile(resolve(dir, 'ic_launcher.png'));
    const circle = Buffer.from(`<svg width="432" height="432"><circle cx="216" cy="216" r="216"/></svg>`);
    await sharp(await sharp(combined).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer()).resize(l, l).png().toFile(resolve(dir, 'ic_launcher_round.png'));
  }
  const anyDpi = resolve(android, 'mipmap-anydpi-v26');
  mkdirSync(anyDpi, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  writeFileSync(resolve(anyDpi, 'ic_launcher.xml'), xml);
  writeFileSync(resolve(anyDpi, 'ic_launcher_round.xml'), xml);
  // Web / in-game sizes.
  await sharp(master).resize(192, 192).png().toFile(resolve(out, 'icon-192.png'));
  await sharp(master).resize(1024, 1024).png().toFile(resolve(out, 'icon-1024.png'));
  console.log('exported', pick);
}
await browser.close();
