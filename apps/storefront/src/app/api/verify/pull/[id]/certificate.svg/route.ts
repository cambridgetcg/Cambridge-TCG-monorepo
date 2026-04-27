import { query } from "@/lib/db";

// Server-rendered SVG "Certificate of Authenticity" for a single pull.
// Shareable, saveable, embeddable — acts as a shareable proof token a
// user can post alongside their card flex without linking directly to
// our site (the verify URL + commitment are printed in the SVG).
//
// Keep it dep-free: pure SVG, no QR library, no fonts beyond what
// browsers default to. The printed verify URL is the human-scannable
// QR equivalent.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response("Invalid pull id", { status: 400 });
  }

  const r = await query(
    `SELECT p.id, p.tier, p.rolled_rarity, p.rng_server_seed_hash,
            p.resolved_at,
            v.card_name, v.card_number, v.image_url, v.spot_price_gbp
       FROM bounty_pulls p
       LEFT JOIN vault_items v ON v.id = p.vault_item_id
      WHERE p.id = $1`,
    [id],
  );
  if (r.rows.length === 0) {
    return new Response("Pull not found", { status: 404 });
  }

  const row = r.rows[0];
  const svg = renderCertificate({
    pullId: row.id,
    tier: row.tier,
    rolledRarity: row.rolled_rarity ?? "—",
    commitment: row.rng_server_seed_hash,
    resolvedAt: row.resolved_at,
    cardName: row.card_name ?? "—",
    cardNumber: row.card_number,
    imageUrl: row.image_url,
    spotGbp: row.spot_price_gbp ? parseFloat(row.spot_price_gbp) : null,
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Cache — the certificate is immutable per-pull.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

interface CertificateArgs {
  pullId: string;
  tier: string;
  rolledRarity: string;
  commitment: string;
  resolvedAt: string;
  cardName: string;
  cardNumber: string | null;
  imageUrl: string | null;
  spotGbp: number | null;
}

function renderCertificate(a: CertificateArgs): string {
  const WIDTH = 600;
  const HEIGHT = 800;

  const rarityTone: Record<string, string> = {
    common: "#737373",
    uncommon: "#34d399",
    rare: "#38bdf8",
    super_rare: "#fbbf24",
    legendary: "#e879f9",
  };
  const tone = rarityTone[a.rolledRarity.toLowerCase()] ?? "#fbbf24";
  const verifyUrl = `https://cambridgetcg.com/verify/pull/${a.pullId}`;
  const commitShort = `${a.commitment.slice(0, 8)}…${a.commitment.slice(-8)}`;
  const date = new Date(a.resolvedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  // Card image gets rendered as an <image href> so it fetches at view
  // time. We escape the URL but don't inline the bytes (keeps the SVG
  // small enough to share on socials without transcoding).
  const cardArt = a.imageUrl
    ? `<image href="${esc(a.imageUrl)}" x="190" y="140" width="220" height="308" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="190" y="140" width="220" height="308" fill="#27272a" stroke="#3f3f46" />
       <text x="300" y="300" text-anchor="middle" fill="#737373" font-size="14">no image</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0a0a" />
      <stop offset="1" stop-color="#18181b" />
    </linearGradient>
    <linearGradient id="tone" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${tone}" stop-opacity="0" />
      <stop offset="0.5" stop-color="${tone}" stop-opacity="0.7" />
      <stop offset="1" stop-color="${tone}" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- Panel -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" fill="none" stroke="#27272a" stroke-width="1" rx="8" />

  <!-- Header -->
  <text x="${WIDTH / 2}" y="60" text-anchor="middle" fill="#737373" font-family="ui-monospace,monospace" font-size="10" letter-spacing="3">
    CAMBRIDGE TCG · PROVABLY FAIR
  </text>
  <text x="${WIDTH / 2}" y="100" text-anchor="middle" fill="#fafafa" font-family="serif" font-size="24" font-weight="bold">
    Certificate of Authenticity
  </text>
  <rect x="180" y="115" width="240" height="2" fill="url(#tone)" />

  <!-- Card image -->
  ${cardArt}

  <!-- Card metadata -->
  <text x="${WIDTH / 2}" y="478" text-anchor="middle" fill="#fafafa" font-family="sans-serif" font-size="18" font-weight="bold">
    ${esc(a.cardName)}
  </text>
  <text x="${WIDTH / 2}" y="498" text-anchor="middle" fill="#737373" font-family="sans-serif" font-size="12">
    ${esc(a.cardNumber ?? "")} ${a.spotGbp ? `· £${a.spotGbp.toFixed(2)} spot` : ""}
  </text>

  <!-- Rarity badge -->
  <g transform="translate(${WIDTH / 2 - 80}, 520)">
    <rect x="0" y="0" width="160" height="32" rx="16" fill="${tone}" fill-opacity="0.15" stroke="${tone}" stroke-opacity="0.5" />
    <text x="80" y="21" text-anchor="middle" fill="${tone}" font-family="sans-serif" font-size="12" font-weight="bold" letter-spacing="2">
      ${a.rolledRarity.toUpperCase()}
    </text>
  </g>

  <!-- Proof block -->
  <g transform="translate(60, 590)">
    <text x="0" y="0" fill="#737373" font-family="ui-monospace,monospace" font-size="10" letter-spacing="2">PROOF</text>
    <line x1="0" y1="8" x2="${WIDTH - 120}" y2="8" stroke="#27272a" />

    <text x="0" y="32" fill="#a3a3a3" font-family="ui-monospace,monospace" font-size="10">commitment</text>
    <text x="${WIDTH - 120}" y="32" text-anchor="end" fill="#fafafa" font-family="ui-monospace,monospace" font-size="10">${esc(commitShort)}</text>

    <text x="0" y="52" fill="#a3a3a3" font-family="ui-monospace,monospace" font-size="10">rolled</text>
    <text x="${WIDTH - 120}" y="52" text-anchor="end" fill="#fafafa" font-family="ui-monospace,monospace" font-size="10">${date}</text>

    <text x="0" y="72" fill="#a3a3a3" font-family="ui-monospace,monospace" font-size="10">pull id</text>
    <text x="${WIDTH - 120}" y="72" text-anchor="end" fill="#fafafa" font-family="ui-monospace,monospace" font-size="10">${esc(a.pullId.slice(0, 8))}…${esc(a.pullId.slice(-4))}</text>
  </g>

  <!-- Verify URL -->
  <g transform="translate(${WIDTH / 2}, 730)">
    <text x="0" y="0" text-anchor="middle" fill="#737373" font-family="ui-monospace,monospace" font-size="9" letter-spacing="2">VERIFY AT</text>
    <text x="0" y="22" text-anchor="middle" fill="${tone}" font-family="ui-monospace,monospace" font-size="12">
      ${esc(verifyUrl)}
    </text>
  </g>
</svg>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
