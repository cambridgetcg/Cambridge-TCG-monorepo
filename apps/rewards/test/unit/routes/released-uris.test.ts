import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

/**
 * At the switch, the released app's webhook subscriptions keep pointing at
 * the same URIs until the trimmed release (spec 7, phase 3), so the new app
 * must answer every one of them. Routes are flat files: the dots in
 * webhooks.orders.paid.tsx are the slashes in /webhooks/orders/paid.
 */

const releasedToml = fileURLToPath(new URL("../../../../rewardspro/shopify.app.toml", import.meta.url));
const routes = fileURLToPath(new URL("../../../app/routes/", import.meta.url));

function releasedUris(): string[] {
  const toml = parse(readFileSync(releasedToml, "utf8")) as { webhooks?: { subscriptions?: Array<{ uri?: string }> } };
  return (toml.webhooks?.subscriptions ?? []).map((subscription) => {
    if (typeof subscription.uri !== "string") throw new Error("A released subscription has no uri");
    return subscription.uri;
  });
}

const routeFile = (uri: string) => ["tsx", "ts"].map((ext) => `${uri.replace(/^\//, "").replaceAll("/", ".")}.${ext}`);

describe("the released app's webhook URIs", () => {
  it("are read from the released toml", () => {
    expect(releasedUris()).toContain("/webhooks/orders/paid");
  });

  it.each(releasedUris())("%s has a route", (uri) => {
    expect(routeFile(uri).some((file) => existsSync(`${routes}${file}`)), `${routeFile(uri)[0]} in app/routes`).toBe(true);
  });
});
