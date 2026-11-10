#!/usr/bin/env node
// The App Store listing's feature image, 1600x900 (Shopify: "1600px by 900px, .jpg or .png").
//
//   node feature-image.mjs --out <path.png>
//
// Same tools and look as render.mjs: the kit's own lockup path data, tokens from kit/colour, text in
// Inter Regular and SemiBold (as bundled with vectorcraft-cli) outlined to paths, rasterised by sharp.
// The picture is the app's Tiers page redrawn, not a screenshot: two example tiers with their minimum
// spend and cashback rate, as the development store's Tiers page showed them on 10 Nov 2026.
// The PNG is a listing upload, not a served file, so it is written where --out says (keep it outside
// the repo, with the other listing images). Nothing else is written.
//
// Env: VECTORCRAFT_CLI, SHARP (as for render.mjs).

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || 'sharp');
const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '../../kit');
const VC = process.env.VECTORCRAFT_CLI ||
  join(os.homedir(), 'craft-apps/vectorcraft-v0.21.0/vectorcraft-cli-0.21.0-macos-universal/vectorcraft-cli');
const outAt = process.argv.indexOf('--out');
if (outAt < 0 || !process.argv[outAt + 1]) { console.error('usage: node feature-image.mjs --out <path.png>'); process.exit(2); }
const OUT = resolve(process.argv[outAt + 1]);

const W = 1600, H = 900;
// Kit tokens (kit/colour/tokens.css: the light roles, and neutral-50 for the panel)
const C = { bg: '#FFFFFF', text: '#1B1D1F', muted: '#686C70', border: '#D7D9DB', panel: '#F6F7F7',
  primary: '#1A3E5C', accentUi: '#009A97', accent: '#17BEBB' };
// The listing's alt text for this image (the form takes 64 characters)
const ALT = 'Give loyal customers cashback: example tiers at 5% and 10%';
if ([...ALT].length > 64) throw new Error(`alt text is ${[...ALT].length} characters, over 64`);

// Text: [id, x, y, size, weight, fill, text, anchor]
const left = 120, card = { x: 910, w: 560, h: 200 }, cards = [{ y: 280, name: 'Everyone', min: '£0', rate: '5%' },
  { y: 520, name: 'Gold', min: '£300', rate: '10%' }];
const T = [
  ['title-0', left, 404, 64, 600, C.text, 'Give loyal customers'],
  ['title-1', left, 482, 64, 600, C.text, 'cashback to spend'],
  ['title-2', left, 560, 64, 600, C.text, 'in your store'],
  ['label', card.x, 244, 26, 400, C.muted, 'Example tiers'],
];
cards.forEach((c, i) => T.push(
  [`name-${i}`, card.x + 48, c.y + 86, 40, 600, C.text, c.name],
  [`min-${i}`, card.x + 48, c.y + 140, 24, 400, C.muted, `Minimum spend ${c.min}`],
  [`rate-${i}`, card.x + card.w - 40, c.y + 112, 76, 600, C.primary, c.rate, 'end'],
  [`cb-${i}`, card.x + card.w - 40, c.y + 154, 26, 400, C.muted, 'cashback', 'end'],
));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textEl = ([id, x, y, size, weight, fill, s, anchor]) =>
  `<text id="${id}" x="${x}" y="${y}" font-family="Inter" font-weight="${weight}" font-size="${size}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;

// Outline the text with vectorcraft-cli, refusing any font that isn't an exact Inter match.
const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rp-feature-'));
let outlined;
try {
  const inF = join(tmp, 'text.svg'), outF = join(tmp, 'outlined.svg');
  fs.writeFileSync(inF, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${T.map(textEl).join('\n')}\n</svg>\n`);
  for (const f of JSON.parse(execFileSync(VC, ['info', inF], { encoding: 'utf8' })).fonts)
    if (f.family !== 'Inter' || f.status !== 'exact' || f.missing || f.missingGlyphs) throw new Error(`font not exact: ${JSON.stringify(f)}`);
  execFileSync(VC, ['convert', inF, outF, '--outline-text', '--decimals', '3']);
  outlined = fs.readFileSync(outF, 'utf8');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (/<text\b/.test(outlined)) throw new Error('outlined SVG still has <text>');
const body = outlined.slice(outlined.indexOf('>', outlined.indexOf('<svg')) + 1, outlined.lastIndexOf('</svg>'));

// The kit's full-colour horizontal lockup, its own path data, at 64 px tall (clear space 32 px).
const kitLockup = fs.readFileSync(join(KIT, 'logo/lockup-horizontal.svg'), 'utf8');
const g = kitLockup.slice(kitLockup.indexOf('<g id="rewardspro">'), kitLockup.lastIndexOf('</svg>'));
const lockupH = 64, s = lockupH / 96;

const rects = [
  `<rect x="${left}" y="300" width="96" height="10" rx="5" fill="${C.accentUi}"/>`,
  `<rect x="${card.x - 48}" y="180" width="${card.w + 96}" height="600" rx="24" fill="${C.panel}"/>`,
  ...cards.flatMap(c => [
    `<rect x="${card.x}" y="${c.y}" width="${card.w}" height="${card.h}" rx="16" fill="${C.bg}" stroke="${C.border}" stroke-width="2"/>`,
    `<rect x="${card.x}" y="${c.y + 40}" width="8" height="${card.h - 80}" rx="4" fill="${C.accent}"/>`,
  ]),
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
${rects.join('\n')}
${body}
<g transform="translate(${left} ${H - 120 - lockupH}) scale(${s.toFixed(6)})">${g}</g>
</svg>
`;

// Contrast, WCAG 2.2: every text pair 4.5:1 or more.
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
for (const [fg, bg] of [[C.text, C.bg], [C.muted, C.bg], [C.primary, C.bg], [C.muted, C.panel]])
  if (ratio(fg, bg) < 4.5) throw new Error(`${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1`);

const png = await sharp(Buffer.from(svg), { density: 72 }).flatten({ background: C.bg }).withIccProfile('srgb').png().toBuffer();
const meta = await sharp(png).metadata();
if (meta.width !== W || meta.height !== H) throw new Error(`rendered ${meta.width}x${meta.height}`);
fs.writeFileSync(OUT, png);
console.log(`${OUT}: ${W}x${H}, ${png.length} bytes; alt (${[...ALT].length}): ${ALT}`);
