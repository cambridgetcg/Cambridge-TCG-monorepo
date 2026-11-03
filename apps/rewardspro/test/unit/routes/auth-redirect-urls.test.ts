import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shopify sends a merchant back after OAuth only to a URL listed in
 * shopify.app.toml's [auth] redirect_urls. The app installs through token
 * exchange (unstable_newEmbeddedAuthStrategy), which needs no redirect;
 * the auth-code flow, if it ever runs, handles the callback only at
 * `${authPathPrefix}/callback` (app/routes/auth.$.tsx). Any other listed
 * URL is a dead end, even one under the auth prefix, so each must be
 * exactly that path.
 */

const APP_ROOT = resolve(__dirname, "../../..");

function redirectPaths(): string[] {
  const toml = readFileSync(resolve(APP_ROOT, "shopify.app.toml"), "utf8");
  const list = toml.match(/^\[auth\][^[]*?^redirect_urls\s*=\s*\[([^\]]*)\]/m)?.[1];
  if (!list) throw new Error("shopify.app.toml has no [auth] redirect_urls");
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => new URL(m[1]).pathname);
}

function authPathPrefix(): string {
  const server = readFileSync(resolve(APP_ROOT, "app/shopify.server.ts"), "utf8");
  const prefix = server.match(/authPathPrefix:\s*"([^"]+)"/)?.[1];
  if (!prefix) throw new Error("app/shopify.server.ts sets no authPathPrefix");
  return prefix;
}

describe("OAuth redirect URLs", () => {
  const paths = redirectPaths();

  it("lists at least one", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  it.each(paths)("%s is the OAuth callback the auth route serves", (path) => {
    expect(path).toBe(`${authPathPrefix()}/callback`);
    expect(existsSync(resolve(APP_ROOT, "app/routes/auth.$.tsx"))).toBe(true);
  });
});
