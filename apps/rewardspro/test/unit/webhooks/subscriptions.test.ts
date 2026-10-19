import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * shopify.app.toml is the only place webhooks are subscribed. A handler with
 * no subscription never runs (refunds went unreversed that way), and a
 * subscription with no handler fails every delivery, so the two must pair.
 */

const APP_ROOT = resolve(__dirname, "../../..");
const ROUTES_DIR = resolve(APP_ROOT, "app/routes");

/** webhooks.* routes that are deliberately not Shopify subscriptions. */
const NOT_SUBSCRIBED: Record<string, string> = {
  // SendGrid's signed event webhook, configured in SendGrid
  "/webhooks/sendgrid": "not a Shopify webhook",
  // Billing webhooks: whether to subscribe them waits on the owner's decision
  // about restoring paid plans (legacy charges are unconfirmed)
  "/webhooks/app-subscriptions-update": "billing decision pending",
  "/webhooks/subscriptions/approaching-cap": "billing decision pending",
};

type Subscription = { uri: string; topics: string[] };

/** The [[webhooks.subscriptions]] tables of shopify.app.toml. */
function tomlSubscriptions(): Subscription[] {
  const toml = readFileSync(resolve(APP_ROOT, "shopify.app.toml"), "utf8");
  return toml
    .split("[[webhooks.subscriptions]]")
    .slice(1)
    .map((block) => block.split(/^\s*\[/m)[0])
    .map((block) => {
      const uri = block.match(/^\s*uri\s*=\s*"([^"]+)"/m)?.[1];
      const lists = [...block.matchAll(/^\s*(?:compliance_)?topics\s*=\s*\[([^\]]*)\]/gm)];
      const topics = lists.flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((t) => t[1]));
      if (!uri) throw new Error(`Subscription without a uri: ${block.trim()}`);
      return { uri, topics };
    });
}

/** URL path of each app/routes/webhooks.* module (flat routes: dots are slashes). */
function webhookRoutes(): Map<string, string> {
  return new Map(
    readdirSync(ROUTES_DIR)
      .filter((file) => file.startsWith("webhooks.") && /\.tsx?$/.test(file))
      .map((file) => [`/${file.replace(/\.tsx?$/, "").split(".").join("/")}`, file]),
  );
}

describe("webhook subscriptions", () => {
  const subscriptions = tomlSubscriptions();
  const routes = webhookRoutes();

  it("parses the subscriptions", () => {
    expect(subscriptions.length).toBeGreaterThan(5);
    for (const s of subscriptions) expect(s.topics.length, s.uri).toBeGreaterThan(0);
  });

  it("gives every subscription a route", () => {
    const missing = subscriptions.filter((s) => !routes.has(s.uri)).map((s) => `${s.uri} (${s.topics.join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("subscribes every webhook route", () => {
    const subscribed = new Set(subscriptions.map((s) => s.uri));
    const unsubscribed = [...routes.keys()].filter((uri) => !subscribed.has(uri) && !(uri in NOT_SUBSCRIBED));
    expect(unsubscribed).toEqual([]);
  });

  it("lists only exceptions that still exist", () => {
    for (const uri of Object.keys(NOT_SUBSCRIBED)) expect(routes.has(uri), uri).toBe(true);
  });

  it("subscribes each topic once", () => {
    const topics = subscriptions.flatMap((s) => s.topics);
    expect(topics.length).toBe(new Set(topics).size);
  });

  it("delivers refunds to the cashback reversal handler", () => {
    const refunds = subscriptions.find((s) => s.topics.includes("refunds/create"));
    expect(refunds?.uri).toBe("/webhooks/orders/refunded");
    const source = readFileSync(resolve(ROUTES_DIR, routes.get("/webhooks/orders/refunded")!), "utf8");
    expect(source).toContain('"REFUNDS_CREATE"');
  });

  it("verifies every subscribed route with authenticate.webhook, never a separate secret", () => {
    for (const { uri } of subscriptions) {
      const source = readFileSync(resolve(ROUTES_DIR, routes.get(uri)!), "utf8");
      expect(source, uri).toContain("authenticate.webhook(");
      expect(source, uri).not.toContain("SHOPIFY_WEBHOOK_SECRET");
    }
  });
});
