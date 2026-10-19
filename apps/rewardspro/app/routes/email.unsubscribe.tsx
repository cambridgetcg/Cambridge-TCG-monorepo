import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { recordUnsubscribe, verifyUnsubscribeToken } from "~/services/marketing-consent.server";
import { sanitizeText } from "~/utils/html-sanitizer";

/**
 * Unsubscribe from a shop's marketing email (resource route).
 *
 * Every marketing email links here and names it in List-Unsubscribe
 * (services/marketing-email.server.ts). The signed token identifies the
 * shopper; nothing else is trusted. GET (the link) only asks the shopper to
 * confirm, because mail scanners open links on their own; POST unsubscribes,
 * from that page's button or as RFC 8058 one-click (List-Unsubscribe-Post)
 * from the mail client. Unsubscribing is idempotent.
 */

/** The token's shopper, and their shop's name escaped for the page. */
async function targetOf(request: Request): Promise<{ shop: string; customerId: string; storeName: string } | null> {
  const target = verifyUnsubscribeToken(new URL(request.url).searchParams.get("token"));
  if (!target) return null;
  const settings = await prisma.shopSettings.findUnique({ where: { shop: target.shop }, select: { storeName: true } });
  return { ...target, storeName: sanitizeText(settings?.storeName || target.shop.replace(/\.myshopify\.com$/, "")) };
}

function page(status: number, title: string, body: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#202223;line-height:1.5">
<h1 style="font-size:20px">${title}</h1>
${body}
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
      "X-Frame-Options": "DENY",
    },
  });
}

const invalid = () =>
  page(400, "Link not valid", "<p>This unsubscribe link is not valid. Use the link in the most recent email you received.</p>");

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const target = await targetOf(request);
  if (!target) return invalid();
  // The form posts back to this URL, token included
  return page(
    200,
    "Unsubscribe from marketing email",
    `<p>Stop marketing emails from ${target.storeName}? Emails about your orders and rewards account still arrive.</p>
<form method="post"><button type="submit" style="font:inherit;padding:8px 16px;border:1px solid #202223;border-radius:6px;background:#202223;color:#fff;cursor:pointer">Unsubscribe</button></form>`,
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const target = await targetOf(request);
  if (!target) return invalid();
  // A shopper whose data was erased has nothing left to unsubscribe
  await recordUnsubscribe(target.shop, target.customerId);
  return page(
    200,
    "You are unsubscribed",
    `<p>You will no longer receive marketing emails from ${target.storeName}. Emails about your orders and rewards account still arrive.</p>`,
  );
};
