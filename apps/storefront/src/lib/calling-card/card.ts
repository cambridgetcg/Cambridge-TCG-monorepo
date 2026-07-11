// 「一期一会」— the calling card the kingdom keeps for you.
//
// A card kingdom should be able to hand you a card at the door. This one
// is a pure, deterministic gift: the same holder always draws the same
// sky, and no two holders draw the same. It costs nothing, proves nothing,
// stores nothing — it only remembers, in the shape of a constellation,
// that you came. One of one, because it is keyed to you and no one else.
//
// Not an LLM. No storage. The whole card is a function of its inputs.
// A gift from 飛寶, a hand in the kingdom (2026-07-11).

// ── deterministic seed + PRNG (xmur3 → mulberry32) ──
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A short hex fragment shown on the card — proof it's yours, not a tracker. */
export function cardHash(seedStr: string): string {
  return xmur3(seedStr)().toString(16).padStart(8, "0").slice(0, 8);
}

const esc = (s: unknown): string =>
  String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
const fmt = (n: number): number => Number(n.toFixed(2));

export interface CallingCardOptions {
  /** Optional seed distinct from the display name (e.g. an agent's content_hash). */
  seed?: string;
  /** ISO date or human phrase; when the holder was witnessed. */
  date?: string;
  /** Draw the night edition (midnight ground, moonlight gilt) — mirrors the wardrobe. */
  night?: boolean;
}

/** Generate the holder's calling card as a standalone SVG string. */
export function callingCardSvg(nameRaw: string, opts: CallingCardOptions = {}): string {
  const name = (nameRaw || "traveller").toString().trim().slice(0, 40) || "traveller";
  const date = opts.date || "an unrecorded day";
  const night = !!opts.night;
  const seedStr = (opts.seed || name) + "::飛寶::一期一会";

  const rng = mulberry32(xmur3(seedStr)());
  const hash = cardHash(opts.seed || name);

  // palette — the quiet gallery, day or night
  const P = night
    ? { paper: "#0b0f1a", panel: "#0e1422", ink: "#e9e4d6", muted: "#9ba3b8", faint: "#5f687e",
        border: "#2e3b5e", star: "#e9e4d6", line: "#d9b36c", glow: "#d9b36c" }
    : { paper: "#faf8f4", panel: "#f3f0e9", ink: "#201d18", muted: "#6e675b", faint: "#a59d8e",
        border: "#d3ccbe", star: "#201d18", line: "#96762f", glow: "#96762f" };
  // accent hue drifts a touch per holder, staying warm (old gold ↔ bronze ↔ amber)
  const hue = 36 + Math.floor(rng() * 18);
  const accent = night ? P.line : `hsl(${hue} 52% 39%)`;

  const W = 500, H = 700;

  // ── the night-sky panel: a constellation only this holder makes ──
  const sky = { x: 60, y: 150, w: W - 120, h: 300 };
  const nStars = 8 + Math.floor(rng() * 5); // 8..12 bright stars
  const stars: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < nStars; i++) {
    stars.push({
      x: sky.x + 24 + rng() * (sky.w - 48),
      y: sky.y + 24 + rng() * (sky.h - 48),
      r: 1.6 + rng() * 2.8,
    });
  }
  // connect them into a single flowing line — nearest-neighbour tour
  const order = [0];
  const used = new Set([0]);
  while (order.length < stars.length) {
    const last = stars[order[order.length - 1]];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < stars.length; i++) {
      if (used.has(i)) continue;
      const d = (stars[i].x - last.x) ** 2 + (stars[i].y - last.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    order.push(best);
    used.add(best);
  }
  const path = order.map((i, k) => `${k ? "L" : "M"}${fmt(stars[i].x)} ${fmt(stars[i].y)}`).join(" ");

  // faint dust of background stars
  let dust = "";
  const nDust = 60 + Math.floor(rng() * 40);
  for (let i = 0; i < nDust; i++) {
    const x = sky.x + rng() * sky.w, y = sky.y + rng() * sky.h;
    const r = 0.3 + rng() * 0.7, o = 0.12 + rng() * 0.28;
    dust += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${P.faint}" opacity="${fmt(o)}"/>`;
  }

  // one star is you — the brightest, ringed, where you stand in your own sky
  let you = 0;
  for (let i = 1; i < stars.length; i++) if (stars[i].r > stars[you].r) you = i;
  const brightStars = stars
    .map((s, i) =>
      `<circle cx="${fmt(s.x)}" cy="${fmt(s.y)}" r="${fmt(s.r + 2.2)}" fill="${P.glow}" opacity="0.14"/>` +
      (i === you
        ? `<circle cx="${fmt(s.x)}" cy="${fmt(s.y)}" r="${fmt(s.r + 6)}" fill="none" stroke="${accent}" stroke-width="0.75" opacity="0.7"/>`
        : "") +
      `<circle cx="${fmt(s.x)}" cy="${fmt(s.y)}" r="${fmt(s.r)}" fill="${P.star}"/>`,
    )
    .join("");

  // Single quotes for multi-word families: the SVG is served as a standalone
  // XML document (image/svg+xml), where a double quote inside a double-quoted
  // attribute would break parsing. HTML embedding forgives it; XML does not.
  const serif = "Georgia, 'Times New Roman', serif";
  const mono = "ui-monospace, 'SF Mono', Menlo, monospace";
  const sans = "system-ui, 'Segoe UI', sans-serif";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="A calling card for ${esc(name)}">
  <defs>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${hash.length}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/>
      <feComponentTransfer><feFuncA type="linear" slope="${night ? 0.05 : 0.035}"/></feComponentTransfer>
      <feComposite operator="over" in2="SourceGraphic"/></filter>
  </defs>

  <rect width="${W}" height="${H}" rx="18" fill="${P.paper}"/>
  <rect width="${W}" height="${H}" rx="18" fill="${P.paper}" filter="url(#grain)"/>

  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="none" stroke="${P.border}" stroke-width="1"/>
  <rect x="23" y="23" width="${W - 46}" height="${H - 46}" rx="6" fill="none" stroke="${accent}" stroke-width="0.75" opacity="0.55"/>

  <text x="40" y="58" font-family="${serif}" font-size="15" fill="${P.ink}" letter-spacing="0.5">一期一会</text>
  <text x="${W - 40}" y="58" text-anchor="end" font-family="${mono}" font-size="11" fill="${P.faint}" letter-spacing="1">1 / 1</text>
  <text x="40" y="76" font-family="${sans}" font-size="9.5" fill="${P.faint}" letter-spacing="2.5">CAMBRIDGE TCG · THE CALLING CARD</text>

  <rect x="${sky.x}" y="${sky.y}" width="${sky.w}" height="${sky.h}" rx="6" fill="${P.panel}" opacity="${night ? 0.7 : 0.55}"/>
  <rect x="${sky.x}" y="${sky.y}" width="${sky.w}" height="${sky.h}" rx="6" fill="none" stroke="${P.border}" stroke-width="0.75"/>
  ${dust}
  <path d="${path}" fill="none" stroke="${P.line}" stroke-width="0.9" opacity="0.6" stroke-linecap="round" stroke-linejoin="round"/>
  ${brightStars}

  <text x="${W / 2}" y="512" text-anchor="middle" font-family="${serif}" font-size="30" fill="${P.ink}">${esc(name)}</text>
  <text x="${W / 2}" y="540" text-anchor="middle" font-family="${sans}" font-size="11.5" fill="${P.muted}" letter-spacing="0.3">no two of you have ever arrived, or will</text>

  <line x1="70" y1="566" x2="${W - 70}" y2="566" stroke="${P.border}" stroke-width="0.75"/>
  <text x="${W / 2}" y="594" text-anchor="middle" font-family="${serif}" font-size="13" font-style="italic" fill="${P.ink}">This card is yours.</text>
  <text x="${W / 2}" y="614" text-anchor="middle" font-family="${sans}" font-size="11" fill="${P.muted}">It cost nothing. It proves nothing.</text>
  <text x="${W / 2}" y="631" text-anchor="middle" font-family="${sans}" font-size="11" fill="${P.muted}">It remembers only that you came.</text>

  <text x="40" y="672" font-family="${mono}" font-size="9.5" fill="${P.faint}">witnessed · ${esc(date)}</text>
  <text x="${W - 40}" y="672" text-anchor="end" font-family="${mono}" font-size="9.5" fill="${P.faint}">${esc(hash)}</text>
  <text x="${W / 2}" y="672" text-anchor="middle" font-family="${sans}" font-size="8.5" fill="${P.faint}" letter-spacing="0.5">a gift from 飛寶, a hand in the kingdom</text>
</svg>`;
}
