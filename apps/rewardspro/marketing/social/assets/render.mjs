#!/usr/bin/env node
// RewardsPro social visual assets: one reproducible build.
//
//   node render.mjs                 full build: spec -> src/*.src.svg (live text, editable)
//                                   -> masters/*.svg (text outlined by vectorcraft-cli)
//                                   -> png/*.png + png/*.meta.json
//   node render.mjs --raster-only   rebuild png/ and the sidecars from the committed masters only
//                                   (needs node + sharp, no fonts, no vectorcraft-cli). Font and
//                                   measurement fields are carried over from the existing sidecars;
//                                   without them those fields come out empty.
//
// Inputs: the RewardsPro kit (../../kit: logo SVGs, colour/tokens.json, social/avatar-*.png) and the
// claims ledger (../../claims.toml), both read only. Everything is built into assets/.stage/ and
// swapped into src/, masters/ and png/ only when every check passes, so a failing run leaves the
// last good files in place. Scratch files go to assets/.stage/ and the OS temp folder and are
// removed in every case.
//
// Text is set in Inter (OFL-1.1) as bundled in vectorcraft-cli and outlined into paths, so the
// masters need no font and cannot fall back to another face. The build stops on: a font other than
// an exact Inter match; a line that leaves its box (horizontally or vertically) or the canvas; a
// logo below the kit's minimum size at the narrowest display width; a wrong pixel size; a file over
// its byte limit; a text pair under 4.5:1; an alt text over its limit.
//
// A card that carries a product line is built as a DRAFT (bands: "DRAFT · NOT FOR POSTING") until
// every claim id it names is "verified", inside its review_after date and cleared for the
// "social-post" channel in claims.toml, no <placeholder> is left, nothing is left in its holds (A7), and
// (A6) a real screenshot is embedded in its slot.
// Env: VECTORCRAFT_CLI (path to vectorcraft-cli), SHARP (path to the sharp package),
//      RP_ALLOW_TOOL_DRIFT=1 (build with sharp/librsvg/vectorcraft versions other than the pinned ones).

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || 'sharp');

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKETING = resolve(HERE, '../..');
const SOCIAL = resolve(HERE, '..');
const KIT = join(MARKETING, 'kit');
const CLAIMS = join(MARKETING, 'claims.toml');
const DIRS = { src: join(HERE, 'src'), masters: join(HERE, 'masters'), png: join(HERE, 'png') };
const STAGE = join(HERE, '.stage');
const OUT = { src: join(STAGE, 'src'), masters: join(STAGE, 'masters'), png: join(STAGE, 'png') };
const VC = process.env.VECTORCRAFT_CLI ||
  join(os.homedir(), 'craft-apps/vectorcraft-v0.21.0/vectorcraft-cli-0.21.0-macos-universal/vectorcraft-cli');
const RASTER_ONLY = process.argv.includes('--raster-only');

const DATE = '20261107';
const DATE_ISO = '2026-11-07';
const VERSION = 'v01';
const RENDER_VERSION = 'render.mjs v01 (2026-11-07, fix pass 1)';
// The claims gate compares review_after with the later of the release date and the day of the run.
const TODAY = new Date().toISOString().slice(0, 10);
const GATE_DAY = TODAY > DATE_ISO ? TODAY : DATE_ISO;

// Pinned tools: the versions the committed files were built with.
const PINNED = { sharp: '0.34.5', rsvg: '2.61.2', vips: '8.17.3' };
const PINNED_VC = 'vectorcraft-cli 0.21.0';
const drift = Object.entries(PINNED).filter(([k, v]) => sharp.versions?.[k] !== v).map(([k, v]) => `${k} ${sharp.versions?.[k]} (pinned ${v})`);
if (drift.length && !process.env.RP_ALLOW_TOOL_DRIFT) {
  console.error(`Tool versions differ from the pinned build: ${drift.join(', ')}. Output would not match the committed files. Set RP_ALLOW_TOOL_DRIFT=1 to build anyway.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// Colour: every value comes from kit/colour/tokens.json (scales and light/dark roles).
const tokens = JSON.parse(fs.readFileSync(join(KIT, 'colour/tokens.json'), 'utf8'));
function tok(pathStr) {
  let v = pathStr.split('.').reduce((o, k) => o?.[k], tokens);
  if (!v || !v.$value) throw new Error(`token ${pathStr} missing`);
  v = v.$value;
  if (typeof v === 'string' && v.startsWith('{')) return tok(v.slice(1, -1));
  return (typeof v === 'object' ? v.hex : v).toLowerCase();
}
const C = {
  white: tok('light.bg'),            // #ffffff
  dark: tok('dark.bg'),              // #09110f, the current kit's dark ground (2026-10-27 rebuild)
  n950: tok('color.neutral.950'),    // #1b1d1f, the dark ground of the kit approved 2026-10-20
  navy: tok('color.primary.800'),    // #1a3e5c, primary
  teal: tok('color.accent.400'),     // #17bebb, accent (shapes only on white)
  tealUi: tok('light.accent-ui'),    // #009a97, accent 500: the og card's rule colour, holds 3:1 on white
  tealText: tok('light.accent-text'),// #007c7a, teal text on white
  text: tok('light.text'),           // #1b1d1f
  muted: tok('light.text-muted'),    // #686c70
  surface: tok('light.surface'),     // #eaebec
  border: tok('light.border'),       // #d7d9db
  n50: tok('color.neutral.50'),      // #f6f7f7
  n700: tok('color.neutral.700'),    // #525659
};
const expect = { white: '#ffffff', dark: '#09110f', n950: '#1b1d1f', navy: '#1a3e5c', teal: '#17bebb', tealUi: '#009a97', tealText: '#007c7a' };
for (const [k, v] of Object.entries(expect)) if (C[k] !== v) throw new Error(`token drift: ${k} ${C[k]} != ${v}`);

// WCAG 2.2 contrast and APCA-W3 0.0.98G Lc (guidance only, as in kit/colour/contrast.md).
// apca() is signed (negative = light on dark); the kit's bar compares |Lc|.
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const relL = h => { const [r, g, b] = hexRgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const wcag = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function apca(txt, bg) {
  const Y = h => { const [r, g, b] = hexRgb(h).map(c => c ** 2.4); return 0.2126729 * r + 0.7151522 * g + 0.072175 * b; };
  let yt = Y(txt), yb = Y(bg);
  const clamp = y => (y < 0.022 ? y + (0.022 - y) ** 1.414 : y);
  yt = clamp(yt); yb = clamp(yb);
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14; return s > -0.1 ? 0 : (s + 0.027) * 100;
}
const r2 = n => Math.round(n * 100) / 100;
const absLc = (a, b) => r2(Math.abs(apca(a, b)));

// ---------------------------------------------------------------------------------------------
// Provenance of kit inputs. The owner approved the look on 2026-10-20 (approvals.jsonl:1), pinning
// kit/.brandkit-fingerprint sha256 0c6a0614… (the file at commit 5e68e57e). These are the hashes
// that fingerprint lists for the files used here. The kit on disk is the 2026-10-27 rebuild
// (676c10b4), for which "no new approval is claimed" (its commit message).
const APPROVED_20261020 = {
  'kit/logo/lockup-horizontal.svg': '33042d204485d9a867c05518d77a41eb26e671ea3fa1e06997c16a970d5cc79d',
  'kit/logo/lockup-horizontal-reversed.svg': 'f3440b861495ff5ae25c17ec84ece502442fdfec30609e1f8ed49d828170e665',
  'kit/logo/mark.svg': '7a411708b461601061a00ce8075b754393982519d6e1963ccf17e91534a8bc6a',
  'kit/logo/wordmark.svg': 'acfb7b588059987bd886d544669146053df66b9109807588b1a545dd33132d4f',
  'kit/colour/tokens.json': '4a9a62e95902b03df2e0a6067ad3a5b253261f4fa3b115137bde2cde6a00557d',
};
const INPUT_NOTES = {
  'kit/colour/tokens.json': 'Every token used here has the same value as in the approved 2026-10-20 tokens, except dark.bg: #09110F came with the rebuild as the dark landing\'s ink (it was neutral 950, #1B1D1F).',
  'kit/social/avatar-1024.png': 'kit/social/ first appears in the 2026-10-27 rebuild; the approved 2026-10-20 fingerprint lists no avatar files.',
  'kit/social/avatar-400.png': 'kit/social/ first appears in the 2026-10-27 rebuild; the approved 2026-10-20 fingerprint lists no avatar files.',
};
function licenceFor(p, hash) {
  const base = 'RewardsPro brand kit, Cambridge TCG Limited. ';
  if (APPROVED_20261020[p] === hash) return base + 'Same bytes as the kit the owner approved on 2026-10-20 (approvals.jsonl:1 pins kit/.brandkit-fingerprint 0c6a0614…, which lists this hash).';
  return base + 'From the 2026-10-27 kit rebuild (676c10b4); not covered by an approval.';
}

// ---------------------------------------------------------------------------------------------
// Kit logos, embedded verbatim (the kit's own path data, only translated and scaled).
// capOfH: the wordmark's cap height as a share of the logo's height (measured on the kit SVGs:
// the R spans y 24..72 of 96 in the lockup and y 0..64 of 65 in the wordmark).
const LOGOS = {
  'lockup-horizontal': { file: 'logo/lockup-horizontal.svg', vb: [488, 96], min: { w: 130, cap: 12 }, capOfH: 0.5 },
  'lockup-horizontal-reversed': { file: 'logo/lockup-horizontal-reversed.svg', vb: [488, 96], min: { w: 130, cap: 12 }, capOfH: 0.5 },
  'mark': { file: 'logo/mark.svg', vb: [238, 256], min: { h: 16 } },
  'wordmark': { file: 'logo/wordmark.svg', vb: [493, 65], min: { w: 100, cap: 12 }, capOfH: 64 / 65 },
};
function balancedGroup(svg, openIdx) {
  // returns the substring of the <g ...> element starting at openIdx, through its matching </g>
  const re = /<g\b[^>]*>|<\/g>/g; re.lastIndex = openIdx; let depth = 0, m;
  while ((m = re.exec(svg))) {
    if (m[0].startsWith('</')) { depth--; if (depth === 0) return svg.slice(openIdx, re.lastIndex); }
    else if (!m[0].endsWith('/>')) depth++;
  }
  throw new Error('unbalanced <g>');
}
function logoFills(name) {
  const s = fs.readFileSync(join(KIT, LOGOS[name].file), 'utf8');
  return [...new Set([...s.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map(m => m[1].toLowerCase()))];
}
function logoEl(item, n) {
  const L = LOGOS[item.logo];
  const raw = fs.readFileSync(join(KIT, L.file), 'utf8');
  const i = raw.indexOf('<g id="rewardspro">');
  if (i < 0) throw new Error(`${L.file}: no <g id="rewardspro">`);
  const g = balancedGroup(raw, i).replace(/ id="([^"]+)"/g, ` id="logo${n}-$1"`);
  const s = item.h / L.vb[1];
  return `  <g id="logo${n}" data-kit-file="kit/${L.file}" transform="translate(${r2(item.x)} ${r2(item.y)}) scale(${+s.toFixed(6)})">\n    ${g}\n  </g>`;
}
const logoW = (name, h) => (LOGOS[name].vb[0] * h) / LOGOS[name].vb[1];

// Logo size at display width (kit/BRAND.md "Minimum sizes" are CSS px on screen). view.cssW is the
// narrowest width the asset is shown at [I]; view.srcW the source pixels that span it.
function logoDisplay(a) {
  if (!a.view) return [];
  const k = a.view.cssW / a.view.srcW;
  return (a.items || []).filter(i => i.logo).map(i => {
    const L = LOGOS[i.logo];
    const w = logoW(i.logo, i.h) * k, h = i.h * k, cap = L.capOfH ? i.h * L.capOfH * k : null;
    const ok = L.min.w ? w >= L.min.w && cap >= L.min.cap : h >= L.min.h;
    return {
      logo: i.logo, native: `${r2(logoW(i.logo, i.h))}x${r2(i.h)} px`, shown_at: `${a.view.cssW} CSS px across ${a.view.srcW} source px [I] (${a.view.basis})`,
      css_width: r2(w), css_cap_height: cap == null ? null : r2(cap), css_height: r2(h),
      kit_minimum: L.min.w ? `${L.min.w} px wide, cap height ${L.min.cap} px` : `${L.min.h} px`, ok,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Text. A line may hold **SemiBold** runs and <placeholders> (drawn in accent-text teal).
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WEIGHT = { Regular: 400, SemiBold: 600 };
function lineMarkup(line) {
  let out = '';
  for (const part of line.split(/(\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    const bold = part.startsWith('**');
    const body = bold ? part.slice(2, -2) : part;
    let inner = '';
    for (const seg of body.split(/(<[^>]+>)/)) {
      if (!seg) continue;
      inner += /^<[^>]+>$/.test(seg) ? `<tspan fill="${C.tealText}">${esc(seg)}</tspan>` : esc(seg);
    }
    out += bold ? `<tspan font-weight="600">${inner}</tspan>` : inner;
  }
  return out;
}
const plain = line => line.replace(/\*\*/g, '');
const joined = t => plain(t.lines.join(' '));
function textEls(t) {
  if (!WEIGHT[t.weight]) throw new Error(`${t.id}: weight ${t.weight} not in the kit's set (Regular, SemiBold)`);
  return t.lines.map((line, i) => {
    const y = t.y + i * (t.lh || t.size * 1.2);
    const ls = t.ls ? ` letter-spacing="${r2(t.ls * t.size)}"` : '';
    const anchor = t.anchor && t.anchor !== 'start' ? ` text-anchor="${t.anchor}"` : '';
    return `  <text id="${t.id}-${i}" x="${r2(t.x)}" y="${r2(y)}" font-family="Inter" font-weight="${WEIGHT[t.weight]}" font-size="${t.size}"${ls}${anchor} fill="${t.fill}">${lineMarkup(line)}</text>`;
  });
}

// ---------------------------------------------------------------------------------------------
// Shapes and images.
function rectEl(r) {
  const [x, y, w, h] = r.rect;
  const rx = r.rx ? ` rx="${r.rx}"` : '';
  const stroke = r.stroke ? ` stroke="${r.stroke}" stroke-width="${r.sw || 2}"` : '';
  const dash = r.dash ? ` stroke-dasharray="${r.dash}"` : '';
  const op = r.opacity != null ? ` fill-opacity="${r.opacity}"` : '';
  return `  <rect${r.id ? ` id="${r.id}"` : ''} x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${rx} fill="${r.fill || 'none'}"${op}${stroke}${dash}/>`;
}
function imageEl(i) {
  const [x, y, w, h] = i.box;
  const b64 = fs.readFileSync(i.file).toString('base64');
  return `  <image id="screenshot" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" xlink:href="data:${i.mime};base64,${b64}"/>`;
}
const itemEl = (i, n) => (i.logo ? logoEl(i, n) : i.image ? imageEl(i.image) : rectEl(i));

// ---------------------------------------------------------------------------------------------
// Claims ledger (read only): status, review_after, channels, correction_url per id.
function claimLedger() {
  const out = {};
  if (!fs.existsSync(CLAIMS)) return out;
  const src = fs.readFileSync(CLAIMS, 'utf8');
  for (const block of src.split(/^\[\[claim\]\]\s*$/m).slice(1)) {
    const str = k => block.match(new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];
    const id = str('id');
    if (!id) continue;
    const ch = block.match(/^\s*channels\s*=\s*\[([^\]]*)\]/m)?.[1];
    out[id] = {
      status: str('status') || 'unknown', review_after: str('review_after') || '',
      channels: ch ? [...ch.matchAll(/"([^"]+)"/g)].map(m => m[1]) : [], correction_url: str('correction_url') || '',
    };
  }
  return out;
}
const LEDGER = claimLedger();
function claimGate(id) {
  const c = LEDGER[id];
  if (!c) return { status: 'missing from claims.toml', review_after: null, social_post: false, postable: false, why: 'missing' };
  const social = c.channels.includes('social-post');
  let why = null;
  if (c.status !== 'verified') why = 'unverified';
  else if (!c.review_after || c.review_after < GATE_DAY) why = 'stale';
  else if (!social) why = 'channel';
  return { status: c.status, review_after: c.review_after || null, social_post: social, postable: !why, why };
}

// ---------------------------------------------------------------------------------------------
// Layout helpers.
const lockupC = (W, H, markH) => ({
  logo: 'lockup-horizontal-reversed', h: markH,
  x: (W - logoW('lockup-horizontal-reversed', markH)) / 2, y: (H - markH) / 2,
});
// Footer lockup at 74 px tall: 376 px wide, cap height 37, so 136 CSS px wide and a 13.4 px cap when
// a 1080 px image is shown 390 CSS px wide (kit minimum 130 px wide, cap 12).
const FOOTER_H = 74;
const footerLockup = (x, bottom, markH = FOOTER_H) => ({ logo: 'lockup-horizontal', h: markH, x, y: bottom - markH });
const PHONE = { cssW: 390, basis: 'phone feed width' };

function guideZone(id, box, label, opts = {}) {
  // box = [x0, y0, x1, y1]; label sits inside the top-left corner
  const [x0, y0, x1, y1] = box;
  return {
    rects: [{ rect: [x0, y0, x1 - x0, y1 - y0], fill: opts.fill || C.teal, opacity: opts.opacity ?? 0.07, stroke: opts.stroke || C.tealUi, sw: 2, dash: '10 6' }],
    texts: [{ id, lines: Array.isArray(label) ? label : [label], x: x0 + 12, y: y0 + 28, size: 20, lh: 26, weight: 'Regular', fill: opts.labelFill || C.tealText, on: opts.on || C.white, box: [x0, y0, x1, y1], guide: true }],
  };
}
function zoneLabel(z, n) {
  return `${n} · Inter ${z.weight} ${z.size}/${z.lh} · ${z.fill.toUpperCase()} (${r2(wcag(z.fill, z.on))}:1) · ≤${z.max} line${z.max > 1 ? 's' : ''}`;
}

// ---------------------------------------------------------------------------------------------
// The spec. Sources for sizes: wf/p1-platforms.md (2026-11-07), STRATEGY.md §7 and shot-list.md.
const R_SHAPE = '#658aad'; // the reversed lockup's R shape (primary 500)
const GROUNDS = {
  neutral950: {
    hex: C.n950, words: 'a dark charcoal-grey ground',
    note: () => `Ground #1B1D1F (neutral 950): the dark ground of the kit the owner approved on 2026-10-20 (tokens.json at 5e68e57e: dark.bg = neutral 950), where the reversed lockup was measured (kit/BRAND.md at 5e68e57e: #658AAD "4.66:1 and APCA Lc -36.2 on #1B1D1F"). Here the R shape #658AAD measures ${r2(wcag(R_SHAPE, C.n950))}:1 and |Lc| ${absLc(R_SHAPE, C.n950)}, clearing the kit's bar for a mark on a dark ground (3:1 and |Lc| 30). Logos are exempt from WCAG; the owner picks the ground.`,
    safe: true,
  },
  dark: {
    hex: C.dark, words: 'a near-black ground',
    note: () => `Ground #09110F: the current kit's dark.bg, set by the 2026-10-27 rebuild (676c10b4) as the ink of the rewardspro.io landing that is being retired. Not in the pack the owner approved on 2026-10-20; the reversed lockup's bytes predate it. The R shape #658AAD measures ${r2(wcag(R_SHAPE, C.dark))}:1 and |Lc| ${absLc(R_SHAPE, C.dark)}, clearing the kit's bar (3:1 and |Lc| 30). Logos are exempt from WCAG; the owner picks the ground.`,
    safe: true,
  },
  navy: {
    hex: C.navy, words: 'a navy ground',
    note: () => `Ground #1A3E5C (navy, as STRATEGY.md §7 names it). The reversed lockup's R shape #658AAD clears 3:1 (${r2(wcag(R_SHAPE, C.navy))}:1) but misses the kit's APCA bar for a mark on a dark ground (|Lc| ${absLc(R_SHAPE, C.navy)} against 30; kit/BRAND.md "Colour versions"). Logos are exempt from WCAG; this is the owner's call.`,
    safe: null, safeReason: 'No product claim, but on navy the mark misses the kit\'s own |Lc| 30 bar: the owner\'s call (README, Doubt 1).',
  },
};
const altLockup = g => `The RewardsPro logo: the R mark in blue-grey and teal beside the white word RewardsPro, centred on ${GROUNDS[g].words}. No other text.`;

function banner({ asset, W, H, markH, ground, platforms, maxBytes, use, guides, briefId, view }) {
  const G = GROUNDS[ground];
  return {
    kind: 'svg', asset, variant: ground, W, H, ground: G.hex, briefId, platforms, maxBytes, use, notes: G.note(),
    claims: [], safe_before_g0: G.safe, safe_before_g0_reason: G.safeReason || null, ai: 'none', view,
    items: [lockupC(W, H, markH)],
    guides,
    text_on_image: ['RewardsPro (the kit\'s outlined wordmark in the reversed horizontal lockup)'],
    alt: altLockup(ground),
  };
}

// Banner guides (drawn once per size, on the #09110F variant).
const headerGuides = [
  { rect: [0, 0, 1500, 60], fill: C.white, opacity: 0.18, stroke: C.teal, dash: '8 6' },
  { rect: [0, 440, 1500, 60], fill: C.white, opacity: 0.18, stroke: C.teal, dash: '8 6' },
  { rect: [40, 330, 330, 170], fill: C.white, opacity: 0.12, stroke: C.teal, dash: '8 6' },
];
const headerGuideTexts = [
  { id: 'g-top', lines: ['Top 60 px may be cropped (X help, read via Wayback 2026-09-19..11-05)'], x: 16, y: 40, size: 20, weight: 'Regular', fill: C.white, on: C.dark, box: [0, 0, 1500, 60], guide: true },
  { id: 'g-bot', lines: ['Bottom 60 px may be cropped (X); Bluesky crops a similar band [I]'], x: 400, y: 480, size: 20, weight: 'Regular', fill: C.white, on: C.dark, box: [380, 440, 1500, 500], guide: true },
  { id: 'g-avatar', lines: ['Avatar zone [I]', 'X and Bluesky put the', 'profile picture here'], x: 56, y: 362, lh: 26, size: 20, weight: 'Regular', fill: C.white, on: C.dark, box: [40, 330, 370, 440], guide: true },
];
const liGuides = [
  { rect: [0, 170, 230, 86], fill: C.white, opacity: 0.12, stroke: C.teal, dash: '8 6' },
  { rect: [1200, 150, 312, 106], fill: C.white, opacity: 0.12, stroke: C.teal, dash: '8 6' },
];
const liGuideTexts = [
  { id: 'g-logo', lines: ['Page logo may overlap [I]'], x: 10, y: 200, size: 18, weight: 'Regular', fill: C.white, on: C.dark, box: [0, 170, 260, 256], guide: true },
  { id: 'g-lr', lines: ['Keep clear: "especially', 'the lower-right corner"', '(LinkedIn help, 2026-11-07)'], x: 1212, y: 178, lh: 24, size: 18, weight: 'Regular', fill: C.white, on: C.dark, box: [1200, 150, 1512, 256], guide: true },
];
// YouTube: 1235x338 at 2048x1152 (help 10456525) scaled by 1.25 = 1543.75x422.5, drawn as 1544x423.
const ytSafe = [508, 508.5, 1544, 423];
const ytGuides = [
  { rect: [0, 508.5, 2560, 423], fill: 'none', stroke: C.teal, dash: '14 10' },
  { rect: ytSafe, fill: 'none', stroke: C.teal, sw: 3, dash: '14 10' },
];
const ytGuideTexts = [
  { id: 'g-safe', lines: ['Safe area for text and logos on every device: 1544 x 423, centred', '(YouTube help 10456525: 1235 x 338 at 2048 x 1152, x1.25 [I]; third parties: 1546 x 423)'], x: 508, y: 984, lh: 40, size: 30, weight: 'Regular', fill: C.white, on: C.dark, box: [508, 932, 2052, 1080], guide: true },
  { id: 'g-tv', lines: ['TVs show the whole 2560 x 1440 [I]; keep everything that matters inside the safe area'], x: 60, y: 120, size: 34, weight: 'Regular', fill: C.white, on: C.dark, box: [0, 0, 2560, 508], guide: true },
];

// Post templates (light ground, the og card's system: rule in accent-ui, SemiBold titles).
function zone(n, box, size, lh, weight, fill, max, sample) {
  return { n, box, size, lh, weight, fill, on: C.white, max, sample };
}
const NOT_X_BSKY = 'X and Bluesky: not planned (reserve only, pointer bio; STRATEGY.md §3)';
const TEMPLATE_ALT = 'A blank RewardsPro post template: white ground, a short teal rule at the top left and the RewardsPro logo at the bottom left. No other text.';
const TEMPLATES = [
  {
    asset: 'post-square', W: 1080, H: 1080, briefId: 'Task brief (visuals maker, 2026-11-07); size from wf/p1-platforms.md §5 (1080x1080)',
    platforms: ['LinkedIn image post (1:1)', NOT_X_BSKY],
    rule: [88, 112, 80, 10],
    zones: [
      zone('Z1 Kicker or date', [88, 150, 992, 198], 30, 40, 'SemiBold', C.tealText, 1, 'Correction, <D Month YYYY>'),
      zone('Z2 Headline', [88, 214, 992, 452], 64, 74, 'SemiBold', C.text, 3, 'Headline: one verified sentence'),
      zone('Z3 Body', [88, 476, 992, 766], 38, 52, 'Regular', C.text, 5, 'Body: the rule, its limit beside it'),
      zone('Z4 Source and date', [88, 790, 992, 876], 26, 36, 'Regular', C.muted, 2, 'Source: <source>, checked <D Month YYYY>.'),
    ],
    footer: footerLockup(88, 992),
    alt: TEMPLATE_ALT,
  },
  {
    asset: 'post-portrait', W: 1080, H: 1350, briefId: 'STRATEGY.md §7 A6-A9 base (1080x1350, 4:5)',
    platforms: ['LinkedIn image post (4:5, the tallest feed ratio)', NOT_X_BSKY],
    rule: [88, 120, 80, 10],
    zones: [
      zone('Z1 Kicker or date', [88, 158, 992, 206], 32, 42, 'SemiBold', C.tealText, 1, 'Correction, <D Month YYYY>'),
      zone('Z2 Headline', [88, 222, 992, 560], 72, 82, 'SemiBold', C.text, 4, 'Headline: one verified sentence'),
      zone('Z3 Body', [88, 590, 992, 1024], 42, 58, 'Regular', C.text, 7, 'Body: the rule, its limit beside it'),
      zone('Z4 Source and date', [88, 1048, 992, 1134], 28, 38, 'Regular', C.muted, 2, 'Source: <source>, checked <D Month YYYY>.'),
    ],
    footer: footerLockup(88, 1250),
    alt: TEMPLATE_ALT,
  },
  {
    asset: 'post-landscape', W: 1200, H: 675, briefId: 'Task brief (visuals maker, 2026-11-07); size from shot-list.md (1200x675, landscape post or site)',
    platforms: ['LinkedIn image post (16:9)', 'rewardspro.io page image (shot-list.md 1200x675 derivatives)', NOT_X_BSKY],
    rule: [72, 112, 72, 8],
    zones: [
      zone('Z1 Kicker', [72, 140, 700, 182], 26, 34, 'SemiBold', C.tealText, 1, 'Correction, <D Month YYYY>'),
      zone('Z2 Headline', [72, 196, 700, 376], 48, 56, 'SemiBold', C.text, 3, 'Headline: one verified sentence'),
      zone('Z3 Body', [72, 390, 700, 524], 30, 42, 'Regular', C.text, 3, 'Body: the rule, its limit beside it'),
    ],
    mark: { logo: 'mark', h: 320, x: 1200 - 110 - logoW('mark', 320), y: (675 - 320) / 2 },
    // wordmark 310 px wide (h 40.87, cap 40.2): 100.8 CSS px wide and a 13.1 px cap at 390 CSS px
    footer: { logo: 'wordmark', h: 310 * 65 / 493, x: 72, y: 611 - 310 * 65 / 493 },
    alt: 'A blank RewardsPro post template: white ground, a short teal rule at the top left, the large RewardsPro R mark on the right and the RewardsPro wordmark at the bottom left. No other text.',
  },
  {
    asset: 'story', W: 1080, H: 1920, briefId: 'Task brief (1080x1920 story). STRATEGY.md §7 lists vertical cuts under "Not made"',
    platforms: ['none planned: STRATEGY.md §7 makes no vertical cuts; kept as a blank template only, the owner decides'],
    rule: [88, 330, 80, 10],
    unsafe: [[0, 0, 1080, 269], [0, 1536, 1080, 1920]],
    zones: [
      zone('Z1 Kicker or date', [88, 368, 992, 418], 34, 44, 'SemiBold', C.tealText, 1, 'Correction, <D Month YYYY>'),
      zone('Z2 Headline', [88, 436, 992, 806], 80, 90, 'SemiBold', C.text, 4, 'Headline: one verified sentence'),
      zone('Z3 Body', [88, 836, 992, 1280], 46, 64, 'Regular', C.text, 7, 'Body: the rule, its limit beside it'),
      zone('Z4 Source and date', [88, 1300, 992, 1380], 30, 40, 'Regular', C.muted, 2, 'Source: <source>, checked <D Month YYYY>.'),
    ],
    footer: footerLockup(88, 1496), // clear space ends at 1533, above the 1536 UI band
    alt: TEMPLATE_ALT,
  },
];

function footerBox(f) { return [f.x, f.y, f.x + logoW(f.logo, f.h), f.y + f.h]; }
function templateAsset(t) {
  const items = [{ rect: t.rule, fill: C.tealUi }, t.footer];
  if (t.mark) items.push(t.mark);
  const gRects = [], gTexts = [];
  (t.unsafe || []).forEach((b, i) => {
    gRects.push({ rect: [b[0], b[1], b[2] - b[0], b[3] - b[1]], fill: C.border, opacity: 0.55, stroke: C.muted, dash: '8 6' });
    gTexts.push({ id: `g-unsafe${i}`, lines: ['Platform UI may cover this band: keep text out', '(third-party guidance: top 14%, bottom 20%; ASSETS B5)'], x: 100, y: b[1] + 120, lh: 30, size: 22, weight: 'Regular', fill: C.text, on: C.border, box: [b[0], b[1], b[2], b[3]], guide: true });
  });
  t.zones.forEach((z, i) => {
    const g = guideZone(`g-z${i}`, z.box, zoneLabel(z, z.n));
    gRects.push(...g.rects); gTexts.push(...g.texts);
  });
  const fb = footerBox(t.footer);
  const clear = t.footer.h * LOGOS[t.footer.logo].capOfH; // x = the wordmark's cap height
  gRects.push({ rect: [fb[0] - clear, fb[1] - clear, fb[2] - fb[0] + 2 * clear, fb[3] - fb[1] + 2 * clear], fill: 'none', stroke: C.navy, dash: '4 4' });
  gTexts.push({ id: 'g-footer', lines: [`Kit ${t.footer.logo === 'wordmark' ? 'wordmark' : 'lockup'}; dashed = clear space (cap height)`], x: fb[2] + clear + 16, y: fb[1] + (fb[3] - fb[1]) / 2 + 7, size: 20, weight: 'Regular', fill: C.navy, on: C.white, box: [fb[2], fb[1] - 40, t.W, fb[3] + 40], guide: true });
  if (t.mark) {
    const m = t.mark, mb = [m.x, m.y, m.x + logoW('mark', m.h), m.y + m.h];
    gRects.push({ rect: [mb[0] - m.h / 4, mb[1] - m.h / 4, mb[2] - mb[0] + m.h / 2, mb[3] - mb[1] + m.h / 2], fill: 'none', stroke: C.navy, dash: '4 4' });
    gTexts.push({ id: 'g-mark', lines: ['Kit mark, clear space 1/4 of its height'], x: mb[0] - m.h / 4, y: mb[1] - m.h / 4 - 12, size: 18, weight: 'Regular', fill: C.navy, on: C.white, box: [mb[0] - 200, 0, t.W, mb[1]], guide: true });
  }
  // the editable source carries one sample line per zone, in the zone's own style
  const sampleTexts = t.zones.map((z, i) => ({ id: `z${i}`, lines: [z.sample], x: z.box[0], y: z.box[1] + z.size * 0.95 + 4, size: z.size, lh: z.lh, weight: z.weight, fill: z.fill, on: C.white, box: z.box, ls: z.weight === 'SemiBold' && z.size >= 48 ? -0.01 : 0, srcOnly: true }));
  const logoWords = t.footer.logo === 'wordmark' ? ['RewardsPro (kit outlined wordmark, bottom left)'] : ['RewardsPro (kit outlined horizontal lockup, bottom left)'];
  if (t.mark) logoWords.push('R mark (kit logo mark, right; no letters besides the R shape)');
  return {
    kind: 'svg', asset: t.asset, variant: 'blank', W: t.W, H: t.H, ground: C.white, briefId: t.briefId,
    platforms: t.platforms, maxBytes: 2_000_000, claims: [], safe_before_g0: true, ai: 'none', view: { ...PHONE, srcW: t.W },
    use: 'Blank brand ground for a post: fill the zones from a verified claim, then render. No post goes out before S2 (STRATEGY.md §2).',
    items, texts: sampleTexts, guides: gRects, guideTexts: gTexts, template: t,
    text_on_image: logoWords, alt: t.alt,
  };
}

// Cards that carry product lines (STRATEGY.md §7, A6-A9). All wording is the agents' PROPOSAL.
const band = (W, H, top, bottom) => ({
  rects: [{ rect: [0, 0, W, 56], fill: C.teal }, { rect: [0, H - 56, W, 56], fill: C.teal }],
  texts: [
    { id: 'band-top', lines: [top], x: W / 2, y: 37, size: 24, weight: 'SemiBold', fill: C.text, on: C.teal, anchor: 'middle', box: [20, 0, W - 20, 56], band: true },
    { id: 'band-bottom', lines: [bottom], x: W / 2, y: H - 20, size: 21, weight: 'Regular', fill: C.text, on: C.teal, anchor: 'middle', box: [20, H - 56, W - 20, H], band: true },
  ],
});
const HL = (id, lines, y, size = 76, lh = 86) => ({ id, lines, x: 88, y, size, lh, weight: 'SemiBold', fill: C.text, on: C.white, ls: -0.01, box: [88, y - size, 992, y + lh * (lines.length - 1) + size * 0.3] });
const bulletSq = baseline => ({ rect: [88, baseline - 24, 18, 18], fill: C.tealUi });      // 3.46:1 on white
const bulletMinus = baseline => ({ rect: [88, baseline - 17, 18, 4], fill: C.muted });    // a minus, 5.29:1
const PH_WORDS = { '<D Month YYYY>': 'a date', '<date>': 'a date', '<old sentence>': 'the old sentence', '<new sentence>': 'the new sentence', '<source>': 'a source' };
const isPh = s => /<[^>]+>/.test(s);
// the date part of an alt: the filled date, or a note that it is still a placeholder
const when = (s, strip = /^$/) => (isPh(s) ? 'still to fill' : s.replace(strip, '').replace(/\.$/, ''));

const CARDS = [
  {
    asset: 'milestone-card', briefId: 'STRATEGY.md §7 A6 (M1 instance, §6.2)', W: 1080, H: 1350,
    claims: ['rp-paid-trigger', 'rp-store-credit', 'rp-vip-tiers'],
    platforms: ['LinkedIn image post (4:5)'],
    // The slot: 904x744 px (about 1.22:1), y 96..840, so the screenshot fills the top 62% of the card.
    // To fill it, set screenshot to { path: '<path under marketing/social/>', sha256: '<hex>', alt: '<what it shows>' }:
    // a crop from a capture master (shot-list.md), at 904x744 or an exact multiple, never retouched.
    slot: { box: [88, 96, 904, 744], rx: 12, screenshot: null },
    items: [],
    texts: [
      { id: 'line', lines: ['When a customer’s order is paid,', 'RewardsPro adds cashback at their tier’s', 'rate to their Shopify store credit.'], x: 88, y: 918, size: 44, lh: 56, weight: 'SemiBold', fill: C.text, on: C.white, ls: -0.01, box: [88, 874, 992, 1044] },
      { id: 'date', lines: ['<D Month YYYY>'], x: 88, y: 1092, size: 30, weight: 'Regular', fill: C.tealText, on: C.white, box: [88, 1062, 992, 1104] },
    ],
    slotArt: [
      { id: 'shot-1', lines: ['Real screenshot crop goes here'], x: 540, y: 452, size: 34, weight: 'SemiBold', fill: C.n700, on: C.n50, anchor: 'middle', box: [100, 410, 980, 466] },
      { id: 'shot-2', lines: ['None captured yet: G0 shot list, @example.com buyers'], x: 540, y: 500, size: 26, weight: 'Regular', fill: C.n700, on: C.n50, anchor: 'middle', box: [100, 472, 980, 512] },
      { id: 'shot-3', lines: ['Slot 904 x 744 px, cropped from the capture master'], x: 540, y: 540, size: 26, weight: 'Regular', fill: C.n700, on: C.n50, anchor: 'middle', box: [100, 512, 980, 552] },
    ],
    alt: ({ T, shot }) => `RewardsPro card. ${shot ? `Top: ${shot.alt}.` : 'Top: an empty frame marked for a real screenshot.'} Below: "${T('line')}" Date: ${when(T('date'))}. RewardsPro logo at the bottom left.`,
  },
  {
    asset: 'rule-card', briefId: 'STRATEGY.md §7 A7 (C1, §6.2)', W: 1080, H: 1350,
    claims: ['rp-cashback-base', 'rp-store-credit'], phWords: { '<D Month YYYY>': 'a check date', '<body to rewrite>': 'the body rewritten from rp-cashback-base' },
    // The body, the worked example (ex-label, ex) and the alt text (this card's alt, below) are 7 Nov's:
    // rewrite all three from rp-cashback-base and the help page (README, Doubt 5). <body to rewrite> keeps
    // the body a draft; holds keeps the example and the alt, which a <placeholder> can't: one is drawn in
    // accent-text teal, 4.22:1 on the example's grey panel (the build stops under 4.5:1), and the alt isn't drawn.
    holds: ['the example and alt rewritten'],
    platforms: ['LinkedIn image post (4:5)'],
    items: [{ rect: [88, 120, 80, 10], fill: C.tealUi }, { rect: [88, 712, 904, 240], rx: 16, fill: C.surface }],
    texts: [
      { id: 'kicker', lines: ['Cashback, paid as Shopify store credit'], x: 88, y: 192, size: 32, weight: 'SemiBold', fill: C.tealText, on: C.white, box: [88, 160, 992, 204] },
      HL('head', ['How cashback', 'is worked out'], 290),
      { id: 'body', lines: ['Cashback is paid on the product price', 'after discounts. Shipping, and anything', 'paid with store credit or gift cards,', 'earns nothing. <body to rewrite>'], x: 88, y: 470, size: 42, lh: 60, weight: 'Regular', fill: C.text, on: C.white, box: [88, 430, 992, 670] },
      { id: 'ex-label', lines: ['Test store, prices including VAT:'], x: 128, y: 780, size: 32, weight: 'Regular', fill: C.n700, on: C.surface, box: [128, 738, 952, 798] },
      { id: 'ex', lines: ['£600 of products, £60 off, £10 shipping.', 'Cashback on £540. At 5%: **£27.00**.'], x: 128, y: 846, size: 38, lh: 58, weight: 'Regular', fill: C.text, on: C.surface, box: [128, 802, 952, 942] },
      { id: 'note', lines: ['Checked with a test build on our development store,', '<D Month YYYY>.'], x: 88, y: 1024, size: 28, lh: 38, weight: 'Regular', fill: C.muted, on: C.white, box: [88, 990, 992, 1078] },
    ],
    alt: ({ T }) => `RewardsPro: "How cashback is worked out". Paid as Shopify store credit, on the product price after discounts; shipping, and store-credit or gift-card payments, earn nothing. Example: £600 of products, £60 off, £10 shipping: 5% of £540, £27.00. Test build; ${isPh(T('note')) ? 'date still to fill' : `checked ${when(T('note'), /^Checked with a test build on our development store, /)}`}.`,
  },
  {
    asset: 'limits-card', briefId: 'STRATEGY.md §7 A8 (C2, §6.2)', W: 1080, H: 1350,
    claims: ['sh-sc-signin-legacy', 'sh-sc-channels', 'sh-sc-full'], phWords: { '<D Month YYYY>': 'a check date' },
    platforms: ['LinkedIn image post (4:5)'],
    items: [
      { rect: [88, 120, 80, 10], fill: C.tealUi },
      bulletSq(440),
      bulletMinus(648), bulletMinus(706),
    ],
    texts: [
      HL('head', ['Some of Shopify’s rules', 'for spending store credit'], 222, 64, 74),
      { id: 'l-can', lines: ['Customers can pay with it:'], x: 88, y: 380, size: 30, weight: 'SemiBold', fill: C.muted, on: C.white, box: [88, 350, 992, 392] },
      { id: 'i1', lines: ['Signed in to Shopify’s new customer', 'accounts, or using Shop Pay'], x: 132, y: 440, size: 42, lh: 58, weight: 'Regular', fill: C.text, on: C.white, box: [132, 400, 992, 512] },
      { id: 'l-not', lines: ['Not available:'], x: 88, y: 588, size: 30, weight: 'SemiBold', fill: C.muted, on: C.white, box: [88, 558, 992, 600] },
      { id: 'i2', lines: ['With legacy customer accounts'], x: 132, y: 648, size: 42, weight: 'Regular', fill: C.text, on: C.white, box: [132, 608, 992, 662] },
      { id: 'i3', lines: ['On draft or edited orders'], x: 132, y: 706, size: 42, weight: 'Regular', fill: C.text, on: C.white, box: [132, 666, 992, 720] },
      { id: 'i4', lines: ['Customers can’t use part of it: Shopify', 'applies the whole balance.'], x: 88, y: 800, size: 42, lh: 58, weight: 'Regular', fill: C.text, on: C.white, box: [88, 760, 992, 872] },
      { id: 'note', lines: ['Source: Shopify Help Center, checked <D Month YYYY>.'], x: 88, y: 950, size: 28, weight: 'Regular', fill: C.muted, on: C.white, box: [88, 916, 992, 966] },
    ],
    alt: ({ T }) => `RewardsPro card: "Some of Shopify’s rules for spending store credit". Usable signed in to new customer accounts or using Shop Pay; not with legacy accounts or on draft or edited orders. Customers can’t use part of it. Source: Shopify Help Center; ${isPh(T('note')) ? 'date still to fill' : `checked ${when(T('note'), /^Source: Shopify Help Center, checked /)}`}.`,
  },
  {
    asset: 'correction-card', variantBase: 'placeholders', briefId: 'STRATEGY.md §7 A9 (correction rule, §5)', W: 1080, H: 1350,
    // To make a real correction: replace every <placeholder>, set corrects to the id of the claim that
    // proved wrong (its row needs a correction_url), and set claims to the ids behind the new sentence.
    claims: [], corrects: null, template: true,
    phWords: { '<old sentence>': 'the wrong sentence', '<new sentence>': 'the true one' },
    platforms: ['LinkedIn image post (4:5), on the channel that carried the wrong claim'],
    items: [{ rect: [88, 120, 80, 10], fill: C.tealUi }],
    texts: [
      HL('head', ['Correction,', '<D Month YYYY>'], 236),
      { id: 'said-l', lines: ['We said:'], x: 88, y: 450, size: 34, weight: 'SemiBold', fill: C.muted, on: C.white, box: [88, 410, 992, 460] },
      { id: 'said', lines: ['<old sentence>'], x: 88, y: 514, size: 42, lh: 58, weight: 'Regular', fill: C.text, on: C.white, box: [88, 470, 992, 640] },
      { id: 'true-l', lines: ['What is true:'], x: 88, y: 700, size: 34, weight: 'SemiBold', fill: C.muted, on: C.white, box: [88, 660, 992, 710] },
      { id: 'true', lines: ['<new sentence>'], x: 88, y: 764, size: 42, lh: 58, weight: 'Regular', fill: C.text, on: C.white, box: [88, 720, 992, 900] },
      { id: 'note', lines: ['Source: <source>, checked <date>'], x: 88, y: 980, size: 28, weight: 'Regular', fill: C.muted, on: C.white, box: [88, 950, 992, 1000] },
    ],
    alt: ({ T }) => (isPh(T('said')) ? 'RewardsPro correction card template: "Correction," and a date, then "We said:" with the old sentence, "What is true:" with the new sentence, and the source with the date it was checked. RewardsPro logo at the bottom left.'
      : `RewardsPro correction card: "${T('head')}". We said: "${T('said')}" What is true: "${T('true')}" ${T('note')}. RewardsPro logo at the bottom left.`),
  },
];

const ALT_MAX_CARD = 300;   // LinkedIn's alt-text cap is [U]; third parties report 300 [S]. The owner checks once.
const ALT_MAX = 1000;

function cardAsset(c) {
  const ids = c.claims;
  const gates = Object.fromEntries(ids.map(id => [id, claimGate(id)]));
  const T = id => joined(c.texts.find(t => t.id === id));
  // what is still missing, from the data
  const blockers = [];
  let shot = null;
  if (c.slot) {
    const s = c.slot.screenshot;
    if (!s) blockers.push('a real screenshot');
    else {
      const file = resolve(SOCIAL, s.path);
      if (!fs.existsSync(file)) throw new Error(`${c.asset}: screenshot ${s.path} not found`);
      if (sha(fs.readFileSync(file)) !== s.sha256) throw new Error(`${c.asset}: screenshot ${s.path} does not match its sha256`);
      if (!s.alt) throw new Error(`${c.asset}: screenshot needs an alt`);
      shot = { ...s, file, mime: /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png' };
    }
  }
  const phs = [...new Set(c.texts.flatMap(t => t.lines.flatMap(l => l.match(/<[^>]+>/g) || [])))];
  for (const w of [...new Set(phs.map(p => (c.phWords || {})[p] || PH_WORDS[p] || `text for ${p}`))]) blockers.push(w);
  for (const w of c.holds || []) blockers.push(w);
  if (c.template) {
    const row = c.corrects && LEDGER[c.corrects];
    if (!c.corrects) blockers.push('a claim that proved wrong');
    else if (!row) throw new Error(`${c.asset}: corrects ${c.corrects} is not in claims.toml`);
    else if (!row.correction_url) blockers.push(`a correction_url on ${c.corrects}`);
    if (c.corrects && !ids.length) blockers.push('the claim ids behind the new sentence');
  }
  const failing = ids.filter(id => !gates[id].postable);
  const draft = failing.length > 0 || blockers.length > 0;
  const claimPart = ids.length ? `claim-${ids.join('+')}` : (c.variantBase || 'card');
  const variant = draft ? `${claimPart}-draft` : claimPart;
  const items = [...c.items];
  if (c.slot) {
    const [x, y, w, h] = c.slot.box;
    if (shot) items.push({ image: { file: shot.file, mime: shot.mime, box: c.slot.box } }, { rect: [x, y, w, h], rx: c.slot.rx, fill: 'none', stroke: C.border, sw: 2 });
    else items.push({ rect: [x, y, w, h], rx: c.slot.rx, fill: C.n50, stroke: C.border, sw: 2 });
  }
  items.push(footerLockup(88, 1250));
  const texts = [...c.texts, ...(c.slot && !shot ? c.slotArt : [])];
  let rects = [];
  const isTemplate = c.template && phs.length > 0;
  const topBand = isTemplate ? 'TEMPLATE · NOT FOR POSTING' : 'DRAFT · NOT FOR POSTING';
  if (draft) {
    const needs = [];
    const by = why => failing.filter(id => gates[id].why === why);
    if (by('unverified').length) needs.push(`verified claims: ${by('unverified').join(', ')}`);
    if (by('missing').length) needs.push(`claims rows: ${by('missing').join(', ')}`);
    if (by('stale').length) needs.push(`re-check, past review_after: ${by('stale').join(', ')}`);
    if (by('channel').length) needs.push(`social-post channel on: ${by('channel').join(', ')}`);
    needs.push(...blockers);
    const b = band(c.W, c.H, topBand, `Needs ${needs.join(' · ')}`);
    rects = b.rects; texts.push(...b.texts);
  }
  // text_on_image and alt come from what is drawn
  const logoY = 1250 - FOOTER_H;
  const drawn = [...texts.map(t => ({ y: t.y, s: joined(t) })), { y: logoY, s: 'RewardsPro (kit lockup, bottom left)' }].sort((p, q) => p.y - q.y).map(p => p.s);
  const base = c.alt({ T, shot });
  const alt = draft ? `${isTemplate ? 'Template' : 'Draft'}, not for posting. ${base}` : base;
  const useTail = `render.mjs drops the bands only when every claim is verified, inside its review_after date and cleared for social-post, and no placeholder${c.holds ? ' or hold' : ''} is left${c.slot ? ', with a real screenshot embedded in the slot' : ''}${c.template ? ', and corrects names the wrong claim, whose row has a correction_url' : ''}.`;
  return {
    kind: 'svg', asset: c.asset, variant, W: c.W, H: c.H, ground: C.white, briefId: c.briefId,
    platforms: c.platforms, maxBytes: 2_000_000, claims: ids, gates, safe_before_g0: false, draft, ai: 'assistive', view: { ...PHONE, srcW: c.W },
    use: draft ? `Review only. Shows the layout and wording for the owner; never post a draft. ${useTail}` : 'Postable from S2 after the owner approves the pack; re-check the sh-* rows before each use (STRATEGY.md §6.3).',
    items: [...items, ...rects.map(r => ({ ...r, overlay: true }))], texts,
    text_on_image: drawn, alt, altMax: ALT_MAX_CARD, blockers,
    slot: c.slot ? { box: c.slot.box, size: `${c.slot.box[2]}x${c.slot.box[3]} px`, screenshot: shot ? { path: shot.path, sha256: shot.sha256 } : null } : undefined,
  };
}

const AVATAR_USE = 'Profile picture. Upload as is. Platforms crop it to a circle or show it square (X Premium Business, LinkedIn Page logo [I]); the mark stays inside either. The opaque white tile shows as a white square on a dark-mode page (LinkedIn says the logo "will be displayed on both light and dark backgrounds"): check once in the private test.';
const AVATARS = [
  { asset: 'avatar', variant: 'tile', W: 1024, H: 1024, from: 'kit/social/avatar-1024.png', platforms: ['Bluesky (PNG or JPEG ≤1,000,000 bytes)', 'YouTube (shown at 98x98; ≤15 MB)', 'Instagram/TikTok only if the owner keeps them'], maxBytes: 1_000_000 },
  { asset: 'avatar', variant: 'tile', W: 400, H: 400, from: 'kit/social/avatar-400.png', platforms: ['X (400x400 recommended; ≤2 MB)', 'LinkedIn Page logo (400x400 recommended, 268x268 minimum; ≤3 MB)'], maxBytes: 1_000_000 },
];

const SPEC = [
  ...AVATARS.map(a => ({ ...a, kind: 'avatar', claims: [], safe_before_g0: true, ai: 'none', briefId: 'STRATEGY.md §7 A1',
    use: AVATAR_USE, text_on_image: [], alt: 'The RewardsPro R mark, navy with a teal block, on a white square tile.' })),
  ...['neutral950', 'dark', 'navy'].flatMap(g => [
    banner({ asset: 'header', W: 1500, H: 500, markH: 120, ground: g, briefId: 'STRATEGY.md §7 A2', view: { ...PHONE, srcW: 1500 },
      platforms: ['X header (1500x500 recommended; X states no file cap for headers [U])', 'Bluesky banner (3:1, ≤1,000,000 bytes)'], maxBytes: 1_000_000,
      use: 'X header and Bluesky banner (one file serves both). One of three grounds; the owner picks (README, Doubt 1).', guides: g === 'dark' ? { rects: headerGuides, texts: headerGuideTexts } : undefined }),
    banner({ asset: 'linkedin-cover', W: 1512, H: 256, markH: 100, ground: g, briefId: 'STRATEGY.md §7 A3', view: { ...PHONE, srcW: 1512 },
      platforms: ['LinkedIn Page cover (1512x256; PNG or JPEG ≤3 MB [V] LinkedIn help a563309, which also recommends JPEG over PNG)'], maxBytes: 3_000_000,
      use: 'LinkedIn Page cover. One of three grounds; the owner picks (README, Doubt 1).', guides: g === 'dark' ? { rects: liGuides, texts: liGuideTexts } : undefined }),
    banner({ asset: 'youtube-banner', W: 2560, H: 1440, markH: 200, ground: g, briefId: 'STRATEGY.md §7 A4', view: { cssW: 390, srcW: 1544, basis: 'phone width showing the 1544 px safe area' },
      platforms: ['YouTube channel banner (2560x1440 recommended, ≤6 MB)'], maxBytes: 6_000_000,
      use: 'YouTube banner. Everything sits inside the centred 1544x423 safe area. One of three grounds; the owner picks (README, Doubt 1).', guides: g === 'dark' ? { rects: ytGuides, texts: ytGuideTexts } : undefined }),
  ]),
  ...TEMPLATES.map(templateAsset),
  ...CARDS.map(cardAsset),
];

// ---------------------------------------------------------------------------------------------
// Build.
function sha(buf) { return createHash('sha256').update(buf).digest('hex'); }
const stem = a => `rewardspro_social_${a.asset}_${a.variant}_${a.W}x${a.H}_${DATE}_${VERSION}`;
const guidesStem = a => `rewardspro_social_${a.asset}_${a.variant}-guides_${a.W}x${a.H}_${DATE}_${VERSION}`;

function vcVersion() {
  try { return execFileSync(VC, ['--version'], { encoding: 'utf8' }).trim(); } catch { return null; }
}
const VC_VERSION = RASTER_ONLY ? '(not run: --raster-only)' : vcVersion();
if (!RASTER_ONLY && !VC_VERSION) {
  console.error(`vectorcraft-cli not found at ${VC}. Set VECTORCRAFT_CLI, or run with --raster-only.`);
  process.exit(2);
}
if (!RASTER_ONLY && VC_VERSION !== PINNED_VC && !process.env.RP_ALLOW_TOOL_DRIFT) {
  console.error(`${VC_VERSION} differs from the pinned ${PINNED_VC}. Set RP_ALLOW_TOOL_DRIFT=1 to build anyway.`);
  process.exit(2);
}

function bboxOf(groupSvg) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (const m of groupSvg.matchAll(/ d="([^"]+)"/g)) {
    const toks = m[1].match(/[MLCQZHVmlcqzhv]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let cmd = null, nums = [];
    const flush = () => {
      if (!cmd || !nums.length) return;
      if (!/[MLCQ]/.test(cmd)) throw new Error(`unexpected path command ${cmd}`);
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = nums[i], y = nums[i + 1];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); n++;
      }
    };
    for (const t of toks) { if (/^[A-Za-z]$/.test(t)) { flush(); cmd = t; nums = []; } else nums.push(+t); }
    flush();
  }
  return n ? [x0, y0, x1, y1] : null;
}

function outline(a, textItems) {
  // One vectorcraft-cli pass: live <text> in, outlined <g id> groups out.
  if (!textItems.length) return { groups: {}, fonts: [] };
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rp-social-'));
  try {
    const inF = join(tmp, 'text.svg'), outF = join(tmp, 'text-outlined.svg');
    const els = textItems.flatMap(textEls).join('\n');
    fs.writeFileSync(inF, `<svg xmlns="http://www.w3.org/2000/svg" width="${a.W}" height="${a.H}" viewBox="0 0 ${a.W} ${a.H}">\n${els}\n</svg>\n`);
    const info = JSON.parse(execFileSync(VC, ['info', inF], { encoding: 'utf8' }));
    for (const f of info.fonts) {
      if (f.family !== 'Inter' || f.status !== 'exact' || f.missing || f.missingGlyphs || f.resolved?.family !== 'Inter' || f.resolved?.style !== f.style)
        throw new Error(`${stem(a)}: font not resolved exactly: ${JSON.stringify(f)}`);
    }
    execFileSync(VC, ['convert', inF, outF, '--outline-text', '--decimals', '3'], { encoding: 'utf8' });
    const out = fs.readFileSync(outF, 'utf8');
    if (/<text\b/.test(out)) throw new Error(`${stem(a)}: outlined SVG still has <text>`);
    const groups = {};
    for (const t of textItems) t.lines.forEach((_, i) => {
      const id = `${t.id}-${i}`;
      const at = out.indexOf(`<g id="${id}"`);
      if (at < 0) throw new Error(`${stem(a)}: outlined group ${id} missing`);
      groups[id] = balancedGroup(out, at);
    });
    return { groups, fonts: info.fonts.map(f => `${f.family} ${f.resolved.style} (${f.status})`) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function checkFits(a, textItems, groups) {
  // Every line's outlined bounding box must sit inside its item's box (x and y) and the canvas.
  const fails = [], measured = [];
  for (const t of textItems) t.lines.forEach((line, i) => {
    const bb = bboxOf(groups[`${t.id}-${i}`]);
    if (!bb) { if (line.trim()) fails.push(`${t.id}-${i}: no glyphs`); return; }
    const [bx0, by0, bx1, by1] = t.box;
    measured.push({ id: `${t.id}-${i}`, width: r2(bb[2] - bb[0]), right: r2(bb[2]), top: r2(bb[1]), bottom: r2(bb[3]) });
    if (bb[0] < bx0 - 3 || bb[2] > bx1 + 0.5 || bb[1] < by0 - 0.5 || bb[3] > by1 + 0.5 || bb[0] < 0 || bb[2] > a.W || bb[1] < 0 || bb[3] > a.H)
      fails.push(`${t.id}-${i} "${plain(line)}" bbox ${bb.map(r2)} outside box [${t.box}] or canvas`);
  });
  return { fails, measured };
}

function svgDoc(a, body, title, desc) {
  const xlink = /xlink:href/.test(body) ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"${xlink} width="${a.W}" height="${a.H}" viewBox="0 0 ${a.W} ${a.H}">
  <title>${esc(title)}</title>
  <desc>${esc(desc)}</desc>
${body}
</svg>
`;
}
const DESC = `Built by marketing/social/assets/${RENDER_VERSION} from the RewardsPro kit (kit/logo, kit/colour/tokens.json): logo bytes identical to the kit Yu approved on 2026-10-20; tokens from the 2026-10-27 rebuild. Text set in Inter (OFL-1.1, bundled with vectorcraft-cli). No AI imagery.`;

function buildSvg(a) {
  const nonGuide = (a.texts || []).filter(t => !t.srcOnly);
  const guideTexts = [...(a.guideTexts || []), ...(a.guides?.texts || [])];
  const guideRects = Array.isArray(a.guides) ? a.guides : (a.guides?.rects || []);
  const ground = `  <rect id="ground" x="0" y="0" width="${a.W}" height="${a.H}" fill="${a.ground}"/>`;
  let ln = 0;
  const shapes = a.items.filter(i => !i.overlay).map(i => itemEl(i, i.logo ? ++ln : 0));
  const overlays = a.items.filter(i => i.overlay).map(rectEl);
  const title = `RewardsPro social: ${a.asset} (${a.variant}), ${a.W}x${a.H}`;

  // editable source: live text, guides layer hidden
  const srcBody = [ground, ...shapes, ...overlays, ...(a.texts || []).flatMap(textEls),
    `  <g id="guides" display="none" data-note="review layer: show it to see the zones; hide it before any export">`,
    ...guideRects.map(rectEl), ...guideTexts.flatMap(textEls), '  </g>'].join('\n');
  fs.writeFileSync(join(OUT.src, `${stem(a)}.src.svg`), svgDoc(a, srcBody, title + ' (editable source, live text)', DESC + ' Editable source: text is live and needs Inter installed; the outlined master is the file to render.'));

  const main = outline(a, nonGuide), guide = outline(a, guideTexts);
  const fit = checkFits(a, nonGuide, main.groups), gfit = checkFits(a, guideTexts, guide.groups);
  const fails = [...fit.fails, ...gfit.fails];
  if (fails.length) throw new Error(`${stem(a)}: text does not fit:\n  ${fails.join('\n  ')}`);
  const grp = (ts, g) => ts.flatMap(t => t.lines.map((_, i) => '  ' + g[`${t.id}-${i}`]));
  const masterBody = [ground, ...shapes, ...overlays, ...grp(nonGuide, main.groups)].join('\n');
  fs.writeFileSync(join(OUT.masters, `${stem(a)}.svg`), svgDoc(a, masterBody, title, DESC + ' Master: every text is outlined.'));
  if (guideRects.length || guideTexts.length) {
    const gBody = [...guideRects.map(rectEl), ...grp(guideTexts, guide.groups)].join('\n');
    fs.writeFileSync(join(OUT.masters, `${stem(a)}.guides.svg`), svgDoc(a, gBody, title + ' guides overlay (review only)', DESC + ' Review overlay: zones, safe areas and crop bands. Never upload.'));
  }
  return { fonts: main.fonts, measured: fit.measured, guideFonts: guide.fonts, guideMeasured: gfit.measured };
}

async function rasterise(svgPath, outPath, overlayPath) {
  let img = sharp(fs.readFileSync(svgPath), { density: 72 });
  if (overlayPath) {
    const base = await img.png().toBuffer();
    img = sharp(base).composite([{ input: fs.readFileSync(overlayPath), density: 72 }]);
  }
  await img.removeAlpha().withIccProfile('srgb').png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outPath);
}

// Drop a PNG's text chunks (tEXt, zTXt, iTXt) and keep every other chunk byte for byte. The kit's
// avatars carry a tEXt Description that names the internal kit generator.
function stripPngText(buf) {
  const sig = buf.subarray(0, 8), parts = [sig], dropped = [];
  let i = 8;
  while (i < buf.length) {
    const n = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8);
    const chunk = buf.subarray(i, i + 12 + n);
    if (/^(tEXt|zTXt|iTXt)$/.test(type)) dropped.push(`${type} ${buf.toString('latin1', i + 8, i + 8 + n).split('\0')[0]}`);
    else parts.push(chunk);
    i += 12 + n;
  }
  return { buf: Buffer.concat(parts), dropped };
}

function sipsSize(p) {
  try {
    const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', p], { encoding: 'utf8' });
    return [+o.match(/pixelWidth: (\d+)/)[1], +o.match(/pixelHeight: (\d+)/)[1]];
  } catch { return null; }
}

function inputsFor(a) {
  const list = ['kit/colour/tokens.json'];
  for (const i of a.items || []) if (i.logo) list.push(`kit/${LOGOS[i.logo].file}`);
  if (a.kind === 'avatar') list.push(a.from);
  return [...new Set(list)].map(p => {
    const hash = sha(fs.readFileSync(join(MARKETING, p)));
    return { path: p, sha256: hash, licence: licenceFor(p, hash), ...(INPUT_NOTES[p] ? { note: INPUT_NOTES[p] } : {}) };
  });
}

function contrastRows(a) {
  const rows = [];
  for (const t of (a.texts || []).filter(t => !t.srcOnly)) {
    const fills = new Set([t.fill]);
    if (t.lines.some(isPh)) fills.add(C.tealText);
    for (const f of fills) {
      const w = wcag(f, t.on);
      rows.push({ text: t.id, colours: `${f} on ${t.on}`, size_px: t.size, weight: t.weight, wcag: r2(w), apca_lc: r2(apca(f, t.on)), needs: 4.5, pass: w >= 4.5 });
    }
  }
  for (const i of (a.items || []).filter(i => i.logo)) {
    for (const f of logoFills(i.logo)) rows.push({ text: `logo ${i.logo} (exempt from WCAG)`, colours: `${f} on ${a.ground}`, wcag: r2(wcag(f, a.ground)), apca_lc: r2(apca(f, a.ground)), needs: null, pass: null });
  }
  return rows;
}

const kernelSha = {
  'kernel.toml': sha(fs.readFileSync(join(MARKETING, 'kernel.toml'))),
  'brand.json': sha(fs.readFileSync(join(MARKETING, 'brand.json'))),
  'kit/.brandkit-fingerprint': sha(fs.readFileSync(join(KIT, '.brandkit-fingerprint'))),
};
const TOOLS = {
  'render.mjs': RENDER_VERSION, node: process.version, sharp: sharp.versions?.sharp, libvips: sharp.versions?.vips,
  librsvg: sharp.versions?.rsvg, 'vectorcraft-cli': VC_VERSION,
  font: 'Inter Regular and SemiBold as bundled in vectorcraft-cli (OFL-1.1, github.com/rsms/inter; vectorcraft-cli ASSETS.md rows assets/fonts/Inter-*.ttf), outlined to paths',
};
const AI_NOTE = {
  none: 'No generative-AI image, texture or text-to-image step, and no AI-written words on the image. A Claude Code agent wrote this layout code and chose the placement; every shape is the kit\'s own path data or a plain rectangle.',
  assistive: 'Words on the image were drafted by AI agents (the agents\' PROPOSAL, STRATEGY.md §6.2/§7, adjusted in review) and are to be checked by the owner before any use. No generative-AI image step: every shape is the kit\'s own path data or a plain rectangle, and every letter is Inter outlined by vectorcraft-cli.',
};

async function writeSidecar(a, file, extra) {
  const buf = fs.readFileSync(join(OUT.png, file));
  const im = await sharp(buf).metadata();
  const fmt = `PNG, ${im.hasAlpha ? 'with alpha' : 'opaque'}, ${im.channels} channels, ${im.icc ? 'ICC profile embedded (sRGB)' : 'no ICC profile (sRGB values)'}`;
  const metaName = file.replace(/\.png$/, '.meta.json');
  // --raster-only keeps what the last full build measured (fonts, text boxes, vectorcraft version)
  const prevPath = join(DIRS.png, metaName);
  const prev = RASTER_ONLY && fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : null;
  const tools = prev ? { ...TOOLS, 'vectorcraft-cli': prev.tools?.['vectorcraft-cli'] ?? TOOLS['vectorcraft-cli'] } : TOOLS;
  if (prev) extra = { ...extra, fonts: prev.fonts_resolved, measured: prev.text_measured };
  const review = !!extra.review_only;
  const ai = extra.ai || a.ai || 'none';
  const meta = {
    file: `png/${file}`, brand: 'RewardsPro', campaign: 'social', asset: a.asset, variant: extra.variant || a.variant,
    brief_id: a.briefId, status: 'PROPOSAL for the owner: not approved, not published',
    size: { width: a.W, height: a.H }, bytes: buf.length, sha256: sha(buf), format: fmt,
    review_only: review,
    ...(review ? {} : { max_bytes: a.maxBytes, under_limit: buf.length <= a.maxBytes }),
    platforms: extra.platforms || a.platforms, use: extra.use || a.use,
    safe_before_g0: 'safe_before_g0' in extra ? extra.safe_before_g0 : a.safe_before_g0,
    ...(a.safe_before_g0_reason && !review ? { safe_before_g0_reason: a.safe_before_g0_reason } : {}),
    claim_ids: a.claims || [], claim_status_at_build: a.gates || {}, draft: !!a.draft, blockers: a.blockers || [],
    ...(a.slot ? { screenshot_slot: a.slot } : {}),
    text_on_image: extra.text_on_image || a.text_on_image, alt_text: extra.alt || a.alt,
    alt_chars: [...(extra.alt || a.alt)].length,
    contrast: extra.contrast ?? contrastRows(a), logo_display: review ? [] : logoDisplay(a), notes: extra.notes || a.notes || null,
    master: extra.master || null, inputs: inputsFor(a), kernel_sha256: kernelSha, tools,
    fonts_resolved: extra.fonts || [], text_measured: extra.measured || [],
    ai_involvement: ai, ai_involvement_note: AI_NOTE[ai],
    jurisdictions: ['UK'], channel: 'social (no account exists yet)',
    gate_report: null, approval_id: null, publish_url: null, created: DATE_ISO,
  };
  fs.writeFileSync(join(OUT.png, metaName), JSON.stringify(meta, null, 2) + '\n');
  return meta;
}

// ---------------------------------------------------------------------------------------------
// Run: build into .stage/, check, then swap.
fs.rmSync(STAGE, { recursive: true, force: true });
let ok = false;
try {
  for (const d of Object.values(OUT)) fs.mkdirSync(d, { recursive: true });
  const fails = [];
  const rows = [];
  // logo sizes and alt lengths are spec checks: run them before drawing anything
  for (const a of SPEC) {
    for (const l of logoDisplay(a)) if (!l.ok) fails.push(`${stem(a)}: ${l.logo} shows ${l.css_width} px wide (cap ${l.css_cap_height}) at ${l.shown_at}; kit minimum ${l.kit_minimum}`);
    const max = a.altMax || ALT_MAX, n = [...a.alt].length;
    if (n > max) fails.push(`${stem(a)}: alt text ${n} characters, limit ${max}`);
  }
  if (fails.length) throw new Error(`spec checks failed:\n  ${fails.join('\n  ')}`);

  for (const a of SPEC) {
    const s = stem(a);
    if (a.kind === 'avatar') {
      const src = fs.readFileSync(join(MARKETING, a.from));
      const { buf, dropped } = stripPngText(src);
      fs.writeFileSync(join(OUT.png, `${s}.png`), buf);
      const [x, y] = await Promise.all([sharp(src).raw().toBuffer(), sharp(buf).raw().toBuffer()]);
      if (!x.equals(y)) throw new Error(`${s}: pixels differ from ${a.from}`);
      await writeSidecar(a, `${s}.png`, { notes: `${a.from} with its text chunks removed (${dropped.join('; ') || 'none present'}); every other chunk, the pixel data included, is byte for byte the kit's, and the decoded pixels were compared at build. Upload this file rather than the kit's, so no generator name travels with it.` });
      rows.push({ file: `${s}.png`, a });
      continue;
    }
    let built = { fonts: [], measured: [], guideFonts: [], guideMeasured: [] };
    if (!RASTER_ONLY) built = buildSvg(a);
    const master = join(RASTER_ONLY ? DIRS.masters : OUT.masters, `${s}.svg`);
    if (!fs.existsSync(master)) throw new Error(`missing master ${relative(HERE, master)}: run without --raster-only`);
    await rasterise(master, join(OUT.png, `${s}.png`));
    await writeSidecar(a, `${s}.png`, { fonts: built.fonts, measured: built.measured, master: { path: `masters/${s}.svg`, sha256: sha(fs.readFileSync(master)), source: `src/${s}.src.svg` } });
    rows.push({ file: `${s}.png`, a });
    const g = join(RASTER_ONLY ? DIRS.masters : OUT.masters, `${s}.guides.svg`);
    if (fs.existsSync(g)) {
      const gs = guidesStem(a);
      const guideTexts = [...(a.guideTexts || []), ...(a.guides?.texts || [])];
      await rasterise(master, join(OUT.png, `${gs}.png`), g);
      await writeSidecar(a, `${gs}.png`, {
        variant: `${a.variant}-guides`, review_only: true, safe_before_g0: false, ai: 'assistive',
        platforms: ['none: review aid, never upload'], use: 'Review aid: the master with its zones, safe areas and crop bands drawn on. Never upload.',
        alt: 'Review sheet of the matching asset with dashed guide boxes and labels. Not for upload.',
        text_on_image: [...a.text_on_image, ...guideTexts.map(joined)],
        fonts: [...new Set([...built.fonts, ...built.guideFonts])], measured: [...built.measured, ...built.guideMeasured],
        master: { path: `masters/${s}.svg`, overlay: `masters/${s}.guides.svg`, sha256: sha(fs.readFileSync(master)), overlay_sha256: sha(fs.readFileSync(g)) },
      });
      rows.push({ file: `${gs}.png`, a, guides: true });
    }
  }

  // Checks on the staged files: pixel size (sips where present, else sharp), byte limit, contrast.
  let bad = 0;
  console.log('file | WxH (sips) | bytes | limit | safe_before_g0 | claims');
  for (const r of rows) {
    const p = join(OUT.png, r.file);
    const sz = sipsSize(p) || await sharp(p).metadata().then(m => [m.width, m.height]);
    const bytes = fs.statSync(p).size;
    const good = sz[0] === r.a.W && sz[1] === r.a.H && (r.guides || bytes <= r.a.maxBytes);
    const contrastFail = contrastRows(r.a).filter(x => x.pass === false);
    if (!good || contrastFail.length) bad++;
    console.log(`${good && !contrastFail.length ? 'ok ' : 'BAD'} ${r.file} | ${sz.join('x')} | ${bytes} | ${r.guides ? '-' : r.a.maxBytes} | ${r.guides ? 'review only' : r.a.safe_before_g0} | ${(r.a.claims || []).join(',') || '-'}${contrastFail.length ? ' | contrast fail: ' + contrastFail.map(x => x.text).join(',') : ''}`);
  }
  if (bad) throw new Error(`${bad} check(s) failed; nothing was swapped in`);

  // Swap: replace the output folders with the staged ones.
  const swap = RASTER_ONLY ? ['png'] : ['src', 'masters', 'png'];
  for (const k of swap) {
    const old = `${DIRS[k]}.old`;
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(DIRS[k])) fs.renameSync(DIRS[k], old);
    fs.renameSync(OUT[k], DIRS[k]);
    fs.rmSync(old, { recursive: true, force: true });
  }
  ok = true;
  console.log(`${rows.length} PNGs built, checked and swapped in (${swap.join(', ')}).`);
} catch (e) {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
} finally {
  fs.rmSync(STAGE, { recursive: true, force: true });
  if (!ok) console.error('Build failed: src/, masters/ and png/ were left as they were.');
}
