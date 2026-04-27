// Renders email templates to /tmp/*.html for eyeballing in a browser.
// Usage: npx tsx scripts/preview-email.mts
//        open /tmp/vault-expired.html
//        open /tmp/pull-resolved.html
//        open /tmp/vault-redeemed.html

import { writeFileSync } from "node:fs";
// tsc dislikes .ts extensions in imports without allowImportingTsExtensions;
// tsx is fine without the extension at runtime.
const { renderLayout, escapeHtml } = await import("../src/lib/email/layout");

// Shared inline helpers (kept separate from the real senders so preview doesn't
// need a DB — copy-paste of the smallest bit of logic is cheaper here than
// factoring a DB-free variant out of bounty.ts).
function cardLine(name: string, number: string | null, rarity: string | null): string {
  return (
    `${escapeHtml(name)}` +
    (number ? ` <span style="color:#737373;">(${escapeHtml(number)})</span>` : "") +
    (rarity ? ` <span style="color:#737373;">· ${escapeHtml(rarity)}</span>` : "")
  );
}
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ── vault expired ──────────────────────────────────────────────────────
writeFileSync("/tmp/vault-expired.html", renderLayout({
  preheader: `Auto-converted to £7.70 store credit.`,
  heading: "A vault item expired",
  bodyHtml: `
    <p style="margin:0 0 12px;">Hi Asha,</p>
    <p style="margin:0 0 16px;">
      Your vault held on to a card for 180 days without redemption. It's now been
      auto-converted to store credit so the value doesn't sit idle.
    </p>
    <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#fff;font-weight:600;">${cardLine("Portgas D. Ace", "OP01-013", "SR")}</p>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">Spot value at acquisition: £10.00</p>
      <p style="margin:4px 0 0;font-size:13px;">
        <span style="color:#34d399;font-weight:600;">+£7.70 store credit</span>
        <span style="color:#737373;"> (77% of spot)</span>
      </p>
    </div>
    <p style="margin:0;">To avoid this on future pulls, redeem or sell back before the 180-day window closes.</p>
  `,
  cta: { label: "Open your Vault", url: "https://cambridgetcg.com/bounty?status=sold_back" },
  footer: `You're getting this email because your Bounty Board vault had an unredeemed item.`,
}));

// ── pull resolved ──────────────────────────────────────────────────────
writeFileSync("/tmp/pull-resolved.html", renderLayout({
  preheader: `You pulled a SR — Shanks.`,
  heading: "You pulled a SR",
  bodyHtml: `
    <p style="margin:0 0 12px;">Hi Asha,</p>
    <p style="margin:0 0 12px;">
      Your <strong style="color:#fff;">Super Rare Pull</strong> resolved.
      You pulled a <strong style="color:#f59e0b;">SR</strong>:
    </p>
    <div style="text-align:center;margin:16px 0;">
      <img src="https://wholesaletcgdirect.com/img/OP01-120.jpg" alt="Shanks"
           width="160" style="border-radius:10px;border:2px solid #f59e0b;max-width:160px;height:auto;" />
    </div>
    <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#fff;font-weight:600;">${cardLine("Shanks", "OP01-120", "SR")}</p>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">
        Frozen sell-back value: <span style="color:#34d399;">£23.10</span>
        <span style="color:#737373;"> · spot £30.00</span>
      </p>
      <p style="margin:4px 0 0;font-size:13px;color:#a3a3a3;">
        Expires ${fmtDate(new Date(Date.now() + 180 * 86400000))} unless redeemed or sold back.
      </p>
    </div>

    <p style="margin:16px 0 8px;color:#fff;font-weight:600;font-size:13px;">Provably fair</p>
    <div style="background:#0f0f0f;border:1px solid #262626;border-radius:6px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#a3a3a3;line-height:1.6;word-break:break-all;">
      <div><span style="color:#737373;">commit:</span> 3f9e21a4c7b6d8e9f012a3b4c5d6e7f8091a2b3c4d5e6f7081920a1b2c3d4e5f</div>
      <div><span style="color:#737373;">seed:</span>   e8a9b0c1d2e3f4051627384950a1b2c3d4e5f60718293a4b5c6d7e8f9001122</div>
      <div><span style="color:#737373;">client:</span> 688e7b81-2492-40df-8823-365dfe5a7701</div>
      <div><span style="color:#737373;">nonce:</span>  1745446830124</div>
    </div>
    <p style="margin:8px 0 0;font-size:12px;color:#737373;">
      Verify: <code style="color:#a3a3a3;">sha256(seed) == commit</code>.
      The first hex digits of <code style="color:#a3a3a3;">sha256(seed:client:nonce)</code>
      determined the rarity and the SKU — independent of us.
    </p>
  `,
  cta: { label: "View in Vault", url: "https://cambridgetcg.com/bounty" },
  footer: `You're getting this email because you opened a Bounty Pull.`,
}));

// ── vault redeemed ──────────────────────────────────────────────────────
writeFileSync("/tmp/vault-redeemed.html", renderLayout({
  preheader: `Shanks is on its way · RM123456789GB.`,
  heading: "Your vault redemption is shipped",
  bodyHtml: `
    <p style="margin:0 0 12px;">Hi Asha,</p>
    <p style="margin:0 0 16px;">
      Your Vault redemption is on its way. The physical copy of this card is
      packaged and in the post.
    </p>
    <div style="text-align:center;margin:16px 0;">
      <img src="https://wholesaletcgdirect.com/img/OP01-120.jpg" alt="Shanks"
           width="140" style="border-radius:10px;border:2px solid #34d399;max-width:140px;height:auto;" />
    </div>
    <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#fff;font-weight:600;">${cardLine("Shanks", "OP01-120", "SR")}</p>
      <p style="margin:0;font-size:12px;color:#737373;">Acquired ${fmtDate(new Date(Date.now() - 6 * 86400000))} · Order #4281</p>
    </div>
    <div style="background:#262626;border-radius:8px;padding:14px 16px;margin:16px 0;">
      <p style="margin:0 0 6px;color:#fff;font-weight:600;font-size:13px;">Shipping to</p>
      <p style="margin:0;font-size:13px;color:#a3a3a3;">Asha Veridian</p>
      <p style="margin:0;font-size:13px;color:#a3a3a3;white-space:pre-line;">12 Backs Lane
Cambridge
CB1 0PD</p>
      <p style="margin:6px 0 0;font-size:13px;">
        <span style="color:#a3a3a3;">Tracking:</span>
        <span style="color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">RM123456789GB</span>
      </p>
    </div>
    <p style="margin:0;font-size:13px;color:#a3a3a3;">
      Tracked delivery, usually 2–4 business days. If anything looks off, reply
      to this email before the card arrives and we'll fix it.
    </p>
  `,
  cta: { label: "View Order", url: "https://cambridgetcg.com/account" },
  footer: `You're getting this email because your Bounty Vault redemption was dispatched.`,
}));

console.log("wrote 3 preview files:");
console.log("  open /tmp/vault-expired.html");
console.log("  open /tmp/pull-resolved.html");
console.log("  open /tmp/vault-redeemed.html");
