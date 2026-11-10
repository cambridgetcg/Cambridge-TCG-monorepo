// Bounty Board transactional emails.
//
// Each function is a thin wrapper:
//   1. Look up what we need from the DB (usually the user's email).
//   2. Build a subject + layout-rendered HTML.
//   3. Send via the shared helper.
//   4. Return a SendResult — never throw. Callers in the cron path rely on
//      this so expiry itself doesn't fail on an email error.

import { query } from "@/lib/db";
import { renderLayout, escapeHtml } from "./layout";
import { sendEmail, type SendResult } from "./send";
import { buildTrackingUrl, getCarrierTracker } from "@/lib/shipping/carriers";
import { DEFAULTS } from "@cambridge-tcg/pricing";

// Trade-in-credit margin multiplier — single source via @cambridge-tcg/pricing.
// Phase 1 of kingdom-049 replaced the hard-coded × 0.77 here. Phase 3 will
// make `channel_pricing` table authoritative and drop silent JS fallback.
const TRADEIN_CREDIT_MULT = DEFAULTS["tradein-credit"]!.marginMultiplier;

// Format helpers ────────────────────────────────────────────────────────

function formatRarity(tier: string): string {
  return tier.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

async function lookupUser(userId: string): Promise<{ email: string; name: string | null } | null> {
  const rows = await query(`SELECT email, name FROM users WHERE id = $1`, [userId]);
  const r = rows.rows[0];
  if (!r?.email) return null;
  return { email: r.email, name: r.name ?? null };
}

function cardLine(name: string, number: string | null, rarity: string | null): string {
  return (
    `${escapeHtml(name)}` +
    (number ? ` <span style="color:#5e574c;">(${escapeHtml(number)})</span>` : "") +
    (rarity ? ` <span style="color:#5e574c;">· ${escapeHtml(rarity)}</span>` : "")
  );
}

// ── vault expired ──

export interface VaultExpiredEmailArgs {
  userId: string;
  cardName: string;
  sku: string;
  cardNumber: string | null;
  rarity: string | null;
  spotPriceGbp: number;
  soldBackCreditGbp: number;
}

export async function sendVaultExpiredEmail(args: VaultExpiredEmailArgs): Promise<SendResult> {
  const user = await lookupUser(args.userId);
  if (!user) return { ok: false, error: "user not found or missing email" };

  const greetingName = user.name ? escapeHtml(user.name) : "there";

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${greetingName},</p>
    <p style="margin:0 0 16px;">
      Your vault held on to a card for 180 days without redemption. It's now been
      auto-converted to store credit so the value doesn't sit idle.
    </p>
    <div style="background:#f3f0e9;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#201d18;font-weight:600;">${cardLine(args.cardName, args.cardNumber, args.rarity)}</p>
      <p style="margin:0;font-size:13px;color:#5e574c;">
        Spot value at acquisition: £${args.spotPriceGbp.toFixed(2)}
      </p>
      <p style="margin:4px 0 0;font-size:13px;">
        <span style="color:#36634d;font-weight:600;">+£${args.soldBackCreditGbp.toFixed(2)} store credit</span>
        <span style="color:#5e574c;"> (77% of spot)</span>
      </p>
    </div>
    <p style="margin:0;">
      To avoid this on future pulls, redeem or sell back before the 180-day
      window closes — you'll see a countdown on each Vault item.
    </p>
  `;

  const html = renderLayout({
    preheader: `Auto-converted to £${args.soldBackCreditGbp.toFixed(2)} store credit.`,
    heading: "A vault item expired",
    bodyHtml,
    cta: { label: "Open your Vault", url: "https://cambridgetcg.com/bounty?status=sold_back" },
    footer: `You're getting this email because your Bounty Board vault had an
             unredeemed item. Reply to this email if anything looks wrong.`,
  });

  return sendEmail({
    to: user.email,
    from: "bounty",
    subject: `Vault item auto-expired: £${args.soldBackCreditGbp.toFixed(2)} credit added`,
    html,
    unsubscribe: { userId: args.userId, category: "vault_expired" },
  });
}

// ── pull resolved ──
//
// Fires when a user opens a token and the RNG resolves to a card. The email
// shows the rolled card, the EV-at-cost breakdown, AND the commit-reveal proof
// values so the user can reproduce the recorded draw after the fact.

export interface PullResolvedEmailArgs {
  userId: string;
  tier: string;                // "common" | "uncommon" | ...
  rolledRarity: string;
  cardName: string;
  cardNumber: string | null;
  rarity: string | null;
  spotPriceGbp: number;
  imageUrl: string | null;
  pullId: string;              // for /bounty/verify/<id> link
  vaultItemId: string;
  expiresAt: Date;
  rngCommitment: string;
  rngServerSeed: string;
  rngClientSeed: string;
  rngNonce: number;
}

export async function sendPullResolvedEmail(args: PullResolvedEmailArgs): Promise<SendResult> {
  const user = await lookupUser(args.userId);
  if (!user) return { ok: false, error: "user not found or missing email" };

  const greetingName = user.name ? escapeHtml(user.name) : "there";
  const prettyTier = formatRarity(args.tier);
  const imageBlock = args.imageUrl
    ? `<div style="text-align:center;margin:16px 0;">
         <img src="${escapeHtml(args.imageUrl)}" alt="${escapeHtml(args.cardName)}"
              width="160" style="border-radius:10px;border:1px solid #e7e2d8;max-width:160px;height:auto;" />
       </div>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${greetingName},</p>
    <p style="margin:0 0 12px;">
      Your <strong style="color:#201d18;">${escapeHtml(prettyTier)} Pull</strong> resolved.
      You pulled a <strong style="color:#86661c;">${escapeHtml(args.rolledRarity)}</strong>:
    </p>
    ${imageBlock}
    <div style="background:#f3f0e9;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#201d18;font-weight:600;">${cardLine(args.cardName, args.cardNumber, args.rarity)}</p>
      <p style="margin:0;font-size:13px;color:#5e574c;">
        Frozen sell-back value: <span style="color:#36634d;">£${(args.spotPriceGbp * TRADEIN_CREDIT_MULT).toFixed(2)}</span>
        <span style="color:#5e574c;"> · spot £${args.spotPriceGbp.toFixed(2)}</span>
      </p>
      <p style="margin:4px 0 0;font-size:13px;color:#5e574c;">
        Expires ${escapeHtml(formatDate(args.expiresAt))} unless redeemed or sold back.
      </p>
    </div>

    <p style="margin:16px 0 8px;color:#201d18;font-weight:600;font-size:13px;">Draw proof</p>
    <div style="background:#faf8f4;border:1px solid #e7e2d8;border-radius:6px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#5e574c;line-height:1.6;word-break:break-all;">
      <div><span style="color:#5e574c;">commit:</span> ${escapeHtml(args.rngCommitment)}</div>
      <div><span style="color:#5e574c;">seed:</span>   ${escapeHtml(args.rngServerSeed)}</div>
      <div><span style="color:#5e574c;">client:</span> ${escapeHtml(args.rngClientSeed)}</div>
      <div><span style="color:#5e574c;">nonce:</span>  ${args.rngNonce}</div>
    </div>
    <p style="margin:8px 0 0;font-size:12px;color:#5e574c;">
      Verify: <code style="color:#5e574c;">sha256(seed) == commit</code>.
      The first hex digits of <code style="color:#5e574c;">sha256(seed:client:nonce)</code>
      reproduce the recorded rarity and SKU. These server-chosen inputs verify consistency,
      not independent seed selection.
    </p>
    <p style="margin:8px 0 0;font-size:12px;">
      <a href="https://cambridgetcg.com/bounty/verify/${escapeHtml(args.pullId)}" style="color:#5e574c;text-decoration:underline;">
        Run the verification in your browser &rarr;
      </a>
    </p>
  `;

  const html = renderLayout({
    preheader: `You pulled a ${args.rolledRarity} — ${args.cardName}.`,
    heading: `You pulled a ${args.rolledRarity}`,
    bodyHtml,
    cta: { label: "View in Vault", url: `https://cambridgetcg.com/bounty` },
    footer: `You're getting this email because you opened a Bounty Pull.
             You can turn off pull-resolved notifications in your account settings.`,
  });

  return sendEmail({
    to: user.email,
    from: "bounty",
    subject: `${formatRarity(args.rolledRarity)} pulled — ${args.cardName}`,
    html,
    unsubscribe: { userId: args.userId, category: "pull_resolved" },
  });
}

// ── vault redeemed (shipped) ──
//
// Fires when admin fulfills a redemption. Confirms the physical card is on its
// way, shows shipping address + tracking if provided, reminds the user of
// their "phygital" — the digital reservation that produced a real card.

export interface VaultRedeemedEmailArgs {
  userId: string;
  cardName: string;
  cardNumber: string | null;
  rarity: string | null;
  imageUrl: string | null;
  shippingName: string;
  shippingAddress: string;
  orderId: number;
  tracking: string | null;
  carrier?: string | null;
  acquiredAt: Date;
}

export async function sendVaultRedeemedEmail(args: VaultRedeemedEmailArgs): Promise<SendResult> {
  const user = await lookupUser(args.userId);
  if (!user) return { ok: false, error: "user not found or missing email" };

  const greetingName = user.name ? escapeHtml(user.name) : "there";
  const imageBlock = args.imageUrl
    ? `<div style="text-align:center;margin:16px 0;">
         <img src="${escapeHtml(args.imageUrl)}" alt="${escapeHtml(args.cardName)}"
              width="140" style="border-radius:10px;border:1px solid #e7e2d8;max-width:140px;height:auto;" />
       </div>`
    : "";

  const trackingUrl = buildTrackingUrl(args.carrier ?? null, args.tracking);
  const carrierTracker = getCarrierTracker(args.carrier ?? null);
  const carrierLabel = carrierTracker?.label ?? (args.carrier ? escapeHtml(args.carrier) : null);

  const trackingBlock = args.tracking
    ? `<p style="margin:6px 0 0;font-size:13px;">
         <span style="color:#5e574c;">${carrierLabel ? escapeHtml(carrierLabel) + " tracking:" : "Tracking:"}</span>
         ${trackingUrl
           ? `<a href="${escapeHtml(trackingUrl)}" style="color:#86661c;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-decoration:underline;">${escapeHtml(args.tracking)}</a>`
           : `<span style="color:#201d18;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(args.tracking)}</span>`}
       </p>`
    : `<p style="margin:6px 0 0;font-size:12px;color:#5e574c;font-style:italic;">
         No tracking number attached — reach out if you want one.
       </p>`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${greetingName},</p>
    <p style="margin:0 0 16px;">
      Your Vault redemption is on its way. The physical copy of this card is
      packaged and in the post.
    </p>
    ${imageBlock}
    <div style="background:#f3f0e9;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#201d18;font-weight:600;">${cardLine(args.cardName, args.cardNumber, args.rarity)}</p>
      <p style="margin:0;font-size:12px;color:#5e574c;">
        Acquired ${escapeHtml(formatDate(args.acquiredAt))} · Order #${args.orderId}
      </p>
    </div>
    <div style="background:#f3f0e9;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#201d18;font-weight:600;font-size:13px;">Shipping to</p>
      <p style="margin:0;font-size:13px;color:#5e574c;">${escapeHtml(args.shippingName)}</p>
      <p style="margin:0;font-size:13px;color:#5e574c;white-space:pre-line;">${escapeHtml(args.shippingAddress)}</p>
      ${trackingBlock}
    </div>
    <p style="margin:0;font-size:13px;color:#5e574c;">
      Tracked delivery, usually 2–4 business days. If anything looks off, reply
      to this email before the card arrives and we'll fix it.
    </p>
  `;

  const html = renderLayout({
    preheader: `${args.cardName} is on its way${args.tracking ? ` · ${args.tracking}` : ""}.`,
    heading: "Your vault redemption is shipped",
    bodyHtml,
    cta: { label: "View Order", url: `https://cambridgetcg.com/account` },
    footer: `You're getting this email because your Bounty Vault redemption
             was dispatched. Reply to this email if the details look wrong.`,
  });

  return sendEmail({
    to: user.email,
    from: "bounty",
    subject: `Shipped: ${args.cardName}${args.tracking ? ` (${args.tracking})` : ""}`,
    html,
    unsubscribe: { userId: args.userId, category: "vault_redeemed" },
  });
}

// ── vault redeemed (bulk shipped) ──
//
// Single email summarising N cards shipped together in one envelope.
// Replaces the old fan-out (N emails per bulk fulfilment) so the user
// gets one notification per shipment rather than one per card.

export interface VaultRedeemedBulkEmailArgs {
  userId: string;
  items: Array<{
    cardName: string;
    cardNumber: string | null;
    rarity: string | null;
    imageUrl: string | null;
  }>;
  shippingName: string;
  shippingAddress: string;
  orderId: number;
  tracking: string | null;
  carrier?: string | null;
}

export async function sendVaultRedeemedBulkEmail(args: VaultRedeemedBulkEmailArgs): Promise<SendResult> {
  const user = await lookupUser(args.userId);
  if (!user) return { ok: false, error: "user not found or missing email" };
  if (args.items.length === 0) return { ok: false, error: "no items to summarise" };

  const greetingName = user.name ? escapeHtml(user.name) : "there";
  const count = args.items.length;

  // Compact card grid — at-a-glance proof we've got the right cards.
  const cardsHtml = args.items.map((it) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e2d8;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="width:48px;padding-right:10px;">
            ${it.imageUrl
              ? `<img src="${escapeHtml(it.imageUrl)}" alt="${escapeHtml(it.cardName)}"
                       width="40" style="border-radius:4px;border:1px solid #e7e2d8;" />`
              : ""}
          </td>
          <td>
            <div style="color:#201d18;font-weight:600;font-size:13px;">${escapeHtml(it.cardName)}</div>
            <div style="color:#5e574c;font-size:11px;">${escapeHtml(it.cardNumber ?? "—")}${it.rarity ? " · " + escapeHtml(it.rarity) : ""}</div>
          </td>
        </tr></table>
      </td>
    </tr>
  `).join("");

  const trackingUrl = buildTrackingUrl(args.carrier ?? null, args.tracking);
  const carrierTracker = getCarrierTracker(args.carrier ?? null);
  const carrierLabel = carrierTracker?.label ?? (args.carrier ? escapeHtml(args.carrier) : null);

  const trackingBlock = args.tracking
    ? `<p style="margin:6px 0 0;font-size:13px;">
         <span style="color:#5e574c;">${carrierLabel ? escapeHtml(carrierLabel) + " tracking:" : "Tracking:"}</span>
         ${trackingUrl
           ? `<a href="${escapeHtml(trackingUrl)}" style="color:#86661c;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-decoration:underline;">${escapeHtml(args.tracking)}</a>`
           : `<span style="color:#201d18;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(args.tracking)}</span>`}
       </p>`
    : `<p style="margin:6px 0 0;font-size:12px;color:#5e574c;font-style:italic;">
         No tracking number attached — reach out if you want one.
       </p>`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${greetingName},</p>
    <p style="margin:0 0 16px;">
      Your bundled Vault shipment is on its way. <strong>${count} cards</strong>,
      packed together in one envelope.
    </p>
    <div style="background:#faf8f4;border:1px solid #e7e2d8;border-radius:8px;padding:8px 16px;margin:16px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${cardsHtml}
      </table>
    </div>
    <div style="background:#f3f0e9;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#201d18;font-weight:600;font-size:13px;">Shipping to</p>
      <p style="margin:0;font-size:13px;color:#5e574c;">${escapeHtml(args.shippingName)}</p>
      <p style="margin:0;font-size:13px;color:#5e574c;white-space:pre-line;">${escapeHtml(args.shippingAddress)}</p>
      ${trackingBlock}
      <p style="margin:8px 0 0;font-size:11px;color:#5e574c;">Order #${args.orderId}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#5e574c;">
      Tracked delivery, usually 2–4 business days. Reply to this email
      if anything looks off and we'll sort it before the package arrives.
    </p>
  `;

  const html = renderLayout({
    preheader: `${count} cards shipped together${args.tracking ? ` · ${args.tracking}` : ""}.`,
    heading: `${count} vault cards shipped`,
    bodyHtml,
    cta: { label: "View Order", url: `https://cambridgetcg.com/account/orders` },
    footer: `You're getting this email because your Bounty Vault bundle was
             dispatched. Reply if any detail looks wrong.`,
  });

  return sendEmail({
    to: user.email,
    from: "bounty",
    subject: `Shipped: ${count} vault cards${args.tracking ? ` (${args.tracking})` : ""}`,
    html,
    unsubscribe: { userId: args.userId, category: "vault_redeemed" },
  });
}
