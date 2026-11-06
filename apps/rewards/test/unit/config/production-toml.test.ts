import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

/**
 * The released app's config (plan task B1). It keeps the released app's
 * identity, so `shopify app deploy` from apps/rewards updates Rewards Pro in
 * place, and carries the trimmed scopes and 2026-10 webhooks the staging run
 * proved. Nothing reads it until the trimmed release (switch.md, B3).
 */

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readToml = (path: string) => parse(readFileSync(file(path), "utf8")) as Toml;

type Subscription = { topics?: string[]; compliance_topics?: string[]; uri: string };
type Toml = {
  client_id: string;
  name: string;
  handle: string;
  application_url: string;
  embedded: boolean;
  build: { automatically_update_urls_on_dev: boolean };
  webhooks: { api_version: string; subscriptions: Subscription[] };
  access_scopes: { scopes: string };
  auth: { redirect_urls: string[] };
  app_proxy: { url: string; subpath: string; prefix: string };
  pos: { embedded: boolean };
};

const production = readToml("../../../shopify.app.toml");
const staging = readToml("../../../shopify.app.staging.toml");
const released = readToml("../../../../rewardspro/shopify.app.toml");
const routes = file("../../../app/routes/");

const routeFile = (uri: string) => ["tsx", "ts"].map((ext) => `${uri.replace(/^\//, "").replaceAll("/", ".")}.${ext}`);

describe("the production toml", () => {
  it("keeps the released app's identity", () => {
    expect(production).toMatchObject({
      client_id: "026ce3bf073bed0e44ae8eab09d1ae3a",
      name: "Rewards Pro",
      handle: "RewardsproMembership",
      application_url: "https://rewardspro-production.vercel.app",
      embedded: true,
      pos: { embedded: false },
    });
  });

  it("never rewrites the released app's URLs from a dev run", () => {
    expect(production.build.automatically_update_urls_on_dev).toBe(false);
  });

  it("subscribes on 2026-10 to exactly the topics the app handles", () => {
    expect(production.webhooks.api_version).toBe("2026-10");
    const byUri = Object.fromEntries(
      production.webhooks.subscriptions.map((s) => [s.uri, [...(s.topics ?? s.compliance_topics ?? [])].sort()]),
    );
    expect(byUri).toEqual({
      "/webhooks/compliance": ["customers/data_request", "customers/redact", "shop/redact"],
      "/webhooks/orders/paid": ["orders/paid"],
      "/webhooks/orders/refunded": ["refunds/create"],
      "/webhooks/orders/cancelled": ["orders/cancelled"],
      "/webhooks/app/uninstalled": ["app/uninstalled"],
      "/webhooks/app/scopes_update": ["app/scopes_update"],
    });
  });

  it.each(production.webhooks.subscriptions.map((s) => s.uri))("%s has a route", (uri) => {
    expect(routeFile(uri).some((name) => existsSync(`${routes}${name}`)), `${routeFile(uri)[0]} in app/routes`).toBe(true);
  });

  it("asks for the scopes the staging run proved, and no others", () => {
    const scopes = (toml: Toml) => toml.access_scopes.scopes.split(",").sort();
    expect(scopes(production)).toEqual(
      [
        "read_all_orders",
        "read_customers",
        "read_orders",
        "read_store_credit_accounts",
        "write_app_proxy",
        "write_store_credit_account_transactions",
      ],
    );
    expect(scopes(production)).toEqual(scopes(staging));
  });

  it("keeps the released redirect and app proxy", () => {
    expect(production.auth.redirect_urls).toEqual(["https://rewardspro-production.vercel.app/auth/callback"]);
    expect(production.app_proxy).toEqual({
      url: "https://rewardspro-production.vercel.app/api/proxy",
      subpath: "rewardspro",
      prefix: "apps",
    });
    expect(production.auth).toEqual(released.auth);
    expect(production.app_proxy).toEqual(released.app_proxy);
  });

  it("is never the config `pnpm dev` runs", () => {
    const pkg = JSON.parse(readFileSync(file("../../../package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.dev).toBe("shopify app dev --config shopify.app.staging.toml");
  });
});
