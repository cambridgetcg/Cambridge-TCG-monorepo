// Reward emails — raffle winner notification + future per-feature
// notifications go here. Direct SES path (not the queue) since wins are
// rare and the cron tolerates SES retry latency.

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { buildTrackingUrl, getCarrierTracker } from "@/lib/shipping/carriers";

const ses = new SESClient({
  region: (process.env.AWS_REGION || "us-east-1").trim(),
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
  },
});

const FROM = (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim();
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cambridgetcg.com").trim().replace(/\/+$/, "");

function tpl(title: string, body: string, ctaText: string, ctaUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px;">Cambridge <span style="color:#34d399;">TCG</span></h1>
    <h2 style="color:#fff;font-size:16px;margin:0 0 16px;">${title}</h2>
    <div style="color:#a3a3a3;font-size:14px;line-height:1.6;">${body}</div>
    <a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;margin-top:16px;">${ctaText}</a>
    <p style="color:#525252;font-size:12px;margin:24px 0 0;">Cambridge TCG &mdash; Rewards</p>
  </div>
</body></html>`;
}

export async function sendPrizeShippedEmail(d: {
  email: string;
  name: string | null;
  prizeLabel: string;
  trackingNumber: string | null;
  carrier?: string | null;
}): Promise<void> {
  const url = `${SITE}/account/rewards`;
  const subject = `Shipped: ${d.prizeLabel}`;

  // Carrier-aware tracking — mirrors the vault-shipped email. When we
  // recognise the carrier we link the tracking number to its tracking
  // page; otherwise fall back to plain mono text.
  const trackerUrl = buildTrackingUrl(d.carrier ?? null, d.trackingNumber ?? null);
  const carrierLabel = getCarrierTracker(d.carrier ?? null)?.label
    ?? (d.carrier ? d.carrier : null);

  let trackingHtml: string;
  let trackingText: string;
  if (d.trackingNumber) {
    const prefix = carrierLabel ? `${carrierLabel} tracking` : "Tracking";
    if (trackerUrl) {
      trackingHtml = `${prefix}: <a href="${trackerUrl}" style="color:#fbbf24;font-family:monospace;text-decoration:underline;">${d.trackingNumber}</a>`;
      trackingText = `${prefix}: ${d.trackingNumber} (${trackerUrl})`;
    } else {
      trackingHtml = `${prefix}: <strong style="font-family:monospace;">${d.trackingNumber}</strong>`;
      trackingText = `${prefix}: ${d.trackingNumber}`;
    }
  } else {
    trackingHtml = "It&apos;s on its way without a tracking number — keep an eye on your post.";
    trackingText = "On its way without tracking — watch the post.";
  }

  const text = `Your prize "${d.prizeLabel}" has shipped. ${trackingText}. ${url}`;
  const html = tpl(
    "Your prize is on the way",
    `<p>${d.name ? `Hi ${d.name}, ` : ""}we just shipped <strong>${d.prizeLabel}</strong>.</p>
     <p>${trackingHtml}</p>`,
    "View prize",
    url,
  );
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [d.email] },
    Message: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } },
  }));
}

/**
 * Single email summarising a bundled shipment of N prizes going to the
 * same user at the same address. Replaces the per-prize fan-out so one
 * physical envelope produces one inbox notification.
 */
export async function sendPrizeBundleShippedEmail(d: {
  email: string;
  name: string | null;
  prizeLabels: string[];
  trackingNumber: string | null;
  carrier?: string | null;
}): Promise<void> {
  const url = `${SITE}/account/rewards`;
  const count = d.prizeLabels.length;
  const subject = `Shipped: ${count} prize${count === 1 ? "" : "s"} bundled`;

  const trackerUrl = buildTrackingUrl(d.carrier ?? null, d.trackingNumber ?? null);
  const carrierLabel = getCarrierTracker(d.carrier ?? null)?.label
    ?? (d.carrier ? d.carrier : null);

  let trackingHtml: string;
  let trackingText: string;
  if (d.trackingNumber) {
    const prefix = carrierLabel ? `${carrierLabel} tracking` : "Tracking";
    if (trackerUrl) {
      trackingHtml = `${prefix}: <a href="${trackerUrl}" style="color:#fbbf24;font-family:monospace;text-decoration:underline;">${d.trackingNumber}</a>`;
      trackingText = `${prefix}: ${d.trackingNumber} (${trackerUrl})`;
    } else {
      trackingHtml = `${prefix}: <strong style="font-family:monospace;">${d.trackingNumber}</strong>`;
      trackingText = `${prefix}: ${d.trackingNumber}`;
    }
  } else {
    trackingHtml = "On its way without tracking — keep an eye on your post.";
    trackingText = "On its way without tracking.";
  }

  const prizeListHtml = d.prizeLabels
    .map(l => `<li style="margin:4px 0;">${l}</li>`)
    .join("");
  const prizeListText = d.prizeLabels.map((l, i) => `  ${i + 1}. ${l}`).join("\n");

  const text = `Your bundled shipment is on the way — ${count} prizes in one package:\n${prizeListText}\n${trackingText}. ${url}`;
  const html = tpl(
    "Your prize bundle is on the way",
    `<p>${d.name ? `Hi ${d.name}, ` : ""}we&apos;ve shipped <strong>${count}</strong> prize${count === 1 ? "" : "s"} together in one package:</p>
     <ul style="color:#e5e5e5;padding-left:20px;">${prizeListHtml}</ul>
     <p>${trackingHtml}</p>`,
    "View prizes",
    url,
  );
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [d.email] },
    Message: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } },
  }));
}

export async function sendRaffleWinnerEmail(d: {
  email: string;
  name: string | null;
  raffleTitle: string;
  prizeDescription: string;
}): Promise<void> {
  const url = `${SITE}/account/rewards`;
  const subject = `🎉 You won the ${d.raffleTitle} raffle!`;
  const text = `Congratulations${d.name ? `, ${d.name}` : ""}! You won "${d.raffleTitle}" — prize: ${d.prizeDescription}. Confirm your shipping at ${url}`;
  const html = tpl(
    "You won the raffle!",
    `<p>${d.name ? `Hi ${d.name}, ` : ""}your name was drawn for the <strong>${d.raffleTitle}</strong> raffle.</p>
     <p style="color:#fff;font-size:16px;"><strong>Prize:</strong> ${d.prizeDescription}</p>
     <p>Visit your rewards page to confirm your shipping address. Physical prizes ship within a few business days.</p>`,
    "Claim your prize",
    url,
  );
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [d.email] },
    Message: { Subject: { Data: subject }, Body: { Text: { Data: text }, Html: { Data: html } } },
  }));
}
