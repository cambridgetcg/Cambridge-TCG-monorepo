import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { recordUnsubscribe, verifyUnsubscribeToken } from "~/services/marketing-consent.server";
import { sanitizeText } from "~/utils/html-sanitizer";

/**
 * One-click unsubscribe from a shop's marketing email (resource route).
 *
 * Every marketing email links here and names it in List-Unsubscribe
 * (services/marketing-email.server.ts). The signed token identifies the
 * shopper; nothing else is trusted. GET (the link) unsubscribes and confirms
 * on a page; POST is RFC 8058 one-click (List-Unsubscribe-Post) from the
 * mail client. Both are idempotent.
 */

async function unsubscribe(request: Request): Promise<{ ok: boolean; storeName: string | null }> {
  const target = verifyUnsubscribeToken(new URL(request.url).searchParams.get("token"));
  if (!target) return { ok: false, storeName: null };
  // A shopper whose data was erased has nothing left to unsubscribe
  await recordUnsubscribe(target.shop, target.customerId);
  const settings = await prisma.shopSettings.findUnique({ where: { shop: target.shop }, select: { storeName: true } });
  return { ok: true, storeName: settings?.storeName || target.shop.replace(/\.myshopify\.com$/, "") };
}

function page(status: number, title: string, message: string): Response {
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
<p>${message}</p>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Frame-Options": "DENY",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { ok, storeName } = await unsubscribe(request);
  if (!ok) {
    return page(400, "Link not valid", "This unsubscribe link is not valid. Use the link in the most recent email you received.");
  }
  const store = sanitizeText(storeName ?? "this store");
  return page(200, "You are unsubscribed", `You will no longer receive marketing emails from ${store}. Emails about your orders and rewards account still arrive.`);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { ok } = await unsubscribe(request);
  return new Response(ok ? "Unsubscribed" : "Invalid token", {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
};
