// Pictures for the first-launch pages (flat SVG, 300 x 300).
const INK = '#2b2140';
const man = (x, y, c = '#2f7cf6', s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-7" y="-22" width="14" height="18" rx="6" fill="${c}" stroke="${INK}" stroke-width="2.5"/><circle cy="-28" r="7" fill="#ffd2b0" stroke="${INK}" stroke-width="2.5"/><rect x="-6" y="-5" width="5" height="7" rx="2" fill="${INK}"/><rect x="1" y="-5" width="5" height="7" rx="2" fill="${INK}"/></g>`;
const squad = (cx, cy, n, c, sp = 16) => {
  let out = '';
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  for (let i = 0; i < n; i++) out += man(cx + ((i % cols) - (cols - 1) / 2) * sp, cy + Math.floor(i / cols) * 12, c);
  return out;
};
const gate = (x, y, w, label, good) => `<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-58" width="${w}" height="58" rx="8" fill="${good ? '#5aaef0' : '#ff6f5e'}" opacity="0.85" stroke="${INK}" stroke-width="4"/><rect x="${-w / 2 - 6}" y="-64" width="8" height="66" rx="3" fill="#9aa6b8" stroke="${INK}" stroke-width="3"/><rect x="${w / 2 - 2}" y="-64" width="8" height="66" rx="3" fill="#9aa6b8" stroke="${INK}" stroke-width="3"/><text y="-20" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="30" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke">${label}</text></g>`;
const road = (bg = '#bfe0ff') => `<rect width="300" height="300" fill="${bg}"/><path d="M110 60 L190 60 L300 300 L0 300 Z" fill="#c8d2e0" stroke="${INK}" stroke-width="4"/><path d="M150 70 V300" stroke="#fff" stroke-width="6" stroke-dasharray="18 16"/><rect y="0" width="300" height="60" fill="#9fe3a0"/>`;

export function nfaArt() {
  const p1 = `<svg viewBox="0 0 300 300">${road()}${gate(95, 150, 96, '×2', true)}${gate(205, 150, 96, '-10', false)}${squad(150, 230, 12, '#2f7cf6')}
    <rect x="14" y="14" width="44" height="24" rx="6" fill="#ffbe2e" stroke="${INK}" stroke-width="3"/><text x="36" y="32" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="15" fill="${INK}">AD</text></svg>`;
  const p2 = `<svg viewBox="0 0 300 300">${road('#ffe0c4')}${gate(85, 130, 90, '+20', true)}${gate(215, 130, 90, '÷2', false)}${squad(110, 215, 9, '#2f7cf6')}
    <path d="M70 262 H230" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M70 262 l14 -10 M70 262 l14 10 M230 262 l-14 -10 M230 262 l-14 10" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><text x="132" y="296" font-size="40">👆</text></svg>`;
  const p3 = `<svg viewBox="0 0 300 300">${road('#d8f4d0')}${gate(150, 120, 120, '-15', false)}
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${126 + i * 12}" y="${150 + (i % 2) * 14}" width="5" height="16" rx="2" fill="#ffd34d" stroke="${INK}" stroke-width="1.5"/>`).join('')}
    ${squad(150, 230, 10, '#2f7cf6')}<path d="M232 84 l26 -10 l-6 18 Z" fill="#ffd34d" stroke="${INK}" stroke-width="3"/><text x="226" y="70" font-family="Baloo 2, sans-serif" font-weight="800" font-size="24" fill="#2eb872" stroke="#fff" stroke-width="4" paint-order="stroke">+15!</text></svg>`;
  const boss = `<g transform="translate(150 150)"><rect x="-38" y="-70" width="76" height="70" rx="22" fill="#e8453c" stroke="${INK}" stroke-width="5"/><circle cy="-92" r="28" fill="#ffd2b0" stroke="${INK}" stroke-width="5"/><path d="M-24 -116 l6 -18 l10 12 l8 -16 l8 16 l10 -12 l6 18 Z" fill="#ffbe2e" stroke="${INK}" stroke-width="4"/><path d="M-14 -96 l10 4 M14 -96 l-10 4" stroke="${INK}" stroke-width="4"/><path d="M-10 -80 q10 -6 20 0" fill="none" stroke="${INK}" stroke-width="4"/><rect x="-60" y="-52" width="22" height="34" rx="10" fill="#e8453c" stroke="${INK}" stroke-width="4"/><rect x="38" y="-52" width="22" height="34" rx="10" fill="#e8453c" stroke="${INK}" stroke-width="4"/></g>`;
  const p4 = `<svg viewBox="0 0 300 300">${road('#ffd9c4')}${boss}<rect x="95" y="160" width="110" height="12" rx="6" fill="#ecd9cb" stroke="${INK}" stroke-width="3"/><rect x="97" y="162" width="40" height="8" rx="4" fill="#e8453c"/>${squad(150, 240, 14, '#2f7cf6')}</svg>`;
  return [p1, p2, p3, p4];
}
