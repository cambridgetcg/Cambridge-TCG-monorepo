/**
 * /cards/[sku] — redirect to the card's detail page.
 *
 * The breadcrumb registry (lib/nav/breadcrumb-registry.ts) emits
 * /cards/:sku as the parent crumb of /cards/:sku/market; until this
 * route existed, that link 404'd. The surviving card page is the
 * read-mirror at /cards/[sku]/market — this route keeps the promise by
 * forwarding there (the retail PDP was removed in the regulator pivot,
 * kingdom-101).
 */

import { redirect } from "next/navigation";

export default async function CardDetailRedirect({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  redirect(`/cards/${sku}/market`);
}
