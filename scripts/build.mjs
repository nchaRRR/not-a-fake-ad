// Bundles the game into one self-contained HTML file.
//   dist/not-a-fake-ad.html  -> page body only (for the shareable web preview)
//   dist/app/index.html    -> full document (what Capacitor will wrap for Play / App Store)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  esbuild = require('/opt/npm-tools/node_modules/esbuild');
}

// __CLOUD__: the phone app talks to Supabase; the web preview uses the in-browser stand-in.
async function bundle(cloud) {
  const result = await esbuild.build({
    entryPoints: [resolve(root, 'src/main.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    write: false,
    legalComments: 'none',
    define: { __CLOUD__: String(cloud), __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version) },
    alias: { three: resolve(root, 'vendor/three/three.module.js') },
    loader: { '.webp': 'dataurl' },
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return page.replace('<!--GAME_SCRIPT-->', () => `<script>${js}</script>`);
}
const page = readFileSync(resolve(root, 'src/index.html'), 'utf8');
const body = await bundle(false);
const appPage = await bundle(true);

mkdirSync(resolve(root, 'dist/app/fonts'), { recursive: true });
writeFileSync(resolve(root, 'dist/not-a-fake-ad.html'), body);

// The packaged app must work offline: swap Google Fonts for the bundled files.
const fontFace = `<style>
@font-face { font-family: "Baloo 2"; src: url("fonts/Baloo2.ttf") format("truetype"); font-weight: 400 800; font-display: swap; }
@font-face { font-family: "Nunito"; src: url("fonts/Nunito.ttf") format("truetype"); font-weight: 200 1000; font-display: swap; }
</style>`;
const appBody = appPage
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, fontFace);
for (const f of ['Baloo2.ttf', 'Nunito.ttf', 'OFL-Baloo2.txt', 'OFL-Nunito.txt']) {
  copyFileSync(resolve(root, 'assets/fonts', f), resolve(root, 'dist/app/fonts', f));
}
try {
  copyFileSync(resolve(root, 'assets/brand/icon-192.png'), resolve(root, 'dist/app/icon-192.png'));
} catch { /* brand assets not rendered yet */ }
writeFileSync(
  resolve(root, 'dist/app/index.html'),
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#ffd9c4">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
</head>
<body>
${appBody}
</body>
</html>
`
);

const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
console.log(`built dist/not-a-fake-ad.html (${kb} KB) and dist/app/index.html`);
