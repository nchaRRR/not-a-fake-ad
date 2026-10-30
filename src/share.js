// Share a picture of the moment (a funny fail, a cleared level, a record) with a line of text and the
// store link. Phone app: Capacitor Filesystem + Share (the system share sheet). Browser: the Web Share
// API when it can send files, otherwise the image downloads.

const W = 1080;
const H = 1350;

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// An <svg> element on the page → an image (keeps its inline styles and CSS variables).
export function svgToImage(svg, w, h) {
  return new Promise((resolve) => {
    try {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    } catch (e) { resolve(null); }
  });
}

// Builds the share card. shot: canvas / image (optional), title: big line, line: small line,
// logo: ['Not a', 'Fake', 'Ad', 'CHOICES'] style words, colors: { top, bottom }.
export function makeCard({ shot, title, line, logo = 'Not a Fake Ad', sub = '', cta = '', colors = {} }) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const ink = '#2b2140';
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, colors.top || '#ffd34d');
  g.addColorStop(1, colors.bottom || '#ff8a2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // rays
  ctx.save();
  ctx.translate(W / 2, 420);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI / 9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1500, -130); ctx.lineTo(1500, 130); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const font = (px, w = 800) => `${w} ${px}px "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif`;
  // the picture
  const px = 90, py = 90, pw = W - 180, ph = 760;
  ctx.save();
  rounded(ctx, px, py, pw, ph, 46);
  ctx.fillStyle = '#fff7ef';
  ctx.fill();
  ctx.clip();
  if (shot) {
    const sw = shot.width || shot.naturalWidth, sh = shot.height || shot.naturalHeight;
    const s = Math.max(pw / sw, ph / sh);
    ctx.drawImage(shot, px + (pw - sw * s) / 2, py + (ph - sh * s) / 2, sw * s, sh * s);
  }
  ctx.restore();
  ctx.lineWidth = 12;
  ctx.strokeStyle = ink;
  rounded(ctx, px, py, pw, ph, 46);
  ctx.stroke();
  // title + line
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'round';
  ctx.font = font(66);
  let y = py + ph + 100;
  for (const l of wrap(ctx, title, W - 140).slice(0, 2)) {
    ctx.lineWidth = 10; ctx.strokeText(l, W / 2, y); ctx.fillText(l, W / 2, y); y += 74;
  }
  if (line) {
    ctx.font = font(40, 700);
    ctx.fillStyle = ink;
    for (const l of wrap(ctx, line, W - 160).slice(0, 2)) { ctx.fillText(l, W / 2, y + 6); y += 48; }
  }
  // footer: logo + call to action
  ctx.fillStyle = ink;
  rounded(ctx, 0, H - 150, W, 150, 0);
  ctx.fill();
  ctx.font = font(50);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText(logo, 60, H - 82);
  if (sub) { ctx.fillStyle = '#ffbe2e'; ctx.font = font(30, 700); ctx.fillText(sub, 60, H - 38); }
  if (cta) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffbe2e'; ctx.font = font(36, 700); ctx.fillText(cta, W - 60, H - 62); }
  return c;
}

const plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};

export async function shareCanvas(canvas, { text = '', title = '', file = 'nimoriq-share.png' } = {}) {
  const dataUrl = canvas.toDataURL('image/png');
  const P = plugins();
  if (P.Share && P.Filesystem) {
    try {
      const w = await P.Filesystem.writeFile({ path: file, data: dataUrl.split(',')[1], directory: 'CACHE' });
      await P.Share.share({ title, text, files: [w.uri], dialogTitle: title });
      return 'native';
    } catch (e) {
      if (String(e && e.message || e).toLowerCase().includes('cancel')) return 'cancel';
    }
  }
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const f = new File([blob], file, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], text, title });
      return 'web';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancel';
  }
  // last resort: download the picture
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'download';
}
