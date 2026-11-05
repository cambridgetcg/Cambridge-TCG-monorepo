import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it, vi } from "vitest";
import { WIDGET_CONFIG_KEY, WIDGET_CONFIG_NAMESPACE } from "~/shopify/widget-config.server";

// Only the metafield's two names are read; the module's database stays unopened
vi.mock("~/db.server", () => ({ default: {} }));

/**
 * The theme app extension as Shopify receives it (spec 3 and 5). The embed
 * survives the switch only with the released identity: the extension's uid
 * and handle, the block file name and its body target.
 */

const EXTENSION = resolve(__dirname, "../../../extensions/rewards-widget");
/** How apps/rewardspro's released shopify.extension.toml begins. */
const RELEASED_TOML_HEAD = `name = "RewardsPro Theme Extension"
type = "theme"
uid = "a58b9b10-e482-42f9-90d4-885a20081116e17dfcf9"

[[extensions]]
type = "theme"
`;
const read = (file: string) => readFileSync(resolve(EXTENSION, file), "utf8");
const bytes = (file: string) => statSync(resolve(EXTENSION, file)).size;

const toml = read("shopify.extension.toml");
const liquid = read("blocks/membership_widget.liquid");
const css = read("assets/rewards-widget.css");
const js = read("assets/rewards-widget.js");
const locale = JSON.parse(read("locales/en.default.json")) as { rewards_widget: Record<string, string> };

type Setting = { type: string; id?: string; default?: string; options?: { value: string }[] };
const schemaText = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/.exec(liquid)?.[1];
const schema = JSON.parse(schemaText ?? "null") as { target: string; stylesheet?: string; settings: Setting[] };
const setting = (id: string) => schema.settings.find((s) => s.id === id);

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** The colour tokens one CSS rule sets, by name. */
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.[\]"=]/g, (c) => `\\${c}`);
  const body = new RegExp(`(?:^|\\}|\\*\\/)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/--rw-([a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

describe("the widget's identity", () => {
  it("keeps the released extension's uid and handle inside [[extensions]], with no top-level keys", () => {
    expect(toml).toMatch(/^\[\[extensions\]\]/m);
    // No uid line before [[extensions]]: the released file's dead top-level uid
    const uidBeforeExtensions = /^uid\s*=[^\n]*\n[\s\S]*^\[\[extensions\]\]/m;
    expect(RELEASED_TOML_HEAD).toMatch(uidBeforeExtensions);
    expect(toml).not.toMatch(uidBeforeExtensions);
    const parsed = parse(toml) as { extensions: Record<string, unknown>[] };
    expect(Object.keys(parsed)).toEqual(["extensions"]);
    expect(parsed.extensions).toHaveLength(1);
    expect(parsed.extensions[0]).toEqual({
      type: "theme",
      name: "RewardsPro Theme Extension",
      handle: "rewardspro-theme-extension",
      uid: "de76c331-60b3-32cf-27d1-40ec03d229db8af03050",
    });
  });

  it("is one app embed on the body, with the guest settings kept and the look added", () => {
    expect(schema.target).toBe("body");
    expect(schema.settings.map((s) => s.id).filter(Boolean)).toEqual(["guest_message", "guest_cta_text", "guest_cta_url", "look", "accent"]);
    for (const id of ["guest_message", "guest_cta_text", "guest_cta_url"]) {
      expect(setting(id)).toMatchObject({ type: "text" });
      // Left empty, the widget's own copy shows
      expect(setting(id)).not.toHaveProperty("default");
    }
    expect(setting("look")).toMatchObject({ type: "select", default: "light" });
    expect(setting("look")?.options?.map((o) => o.value)).toEqual(["light", "dark"]);
    expect(setting("accent")).toMatchObject({ type: "color", default: "#17BEBB" });
  });
});

describe("the block's Liquid", () => {
  it("prints nothing about the buyer", () => {
    expect(liquid).not.toMatch(/customer\.(email|first_name|last_name|tags)/);
    // Not even the id: the proxy learns the buyer from Shopify's signature
    expect(liquid).not.toMatch(/customer\./);
  });

  it("points a signed-in buyer's widget at the proxy, in the cart's currency", () => {
    expect(liquid).toMatch(/\{%-?\s*if customer\s*-?%\}/);
    expect(liquid).toContain('data-endpoint="/apps/rewardspro/membership"');
    expect(liquid).toContain('data-currency="{{ cart.currency.iso_code }}"');
  });

  it("gives a guest the rate from the app's widget metafield", () => {
    const path = `app.metafields.${WIDGET_CONFIG_NAMESPACE}.${WIDGET_CONFIG_KEY}.value`;
    expect(path).toBe("app.metafields.rewards.config.value");
    expect(liquid).toContain(`data-running="{{ ${path}.running }}"`);
    expect(liquid).toContain(`data-base-percent="{{ ${path}.basePercent }}"`);
  });

  it("passes the merchant's guest copy through escaped", () => {
    expect(liquid).toContain('data-message="{{ block.settings.guest_message | escape }}"');
    expect(liquid).toContain('data-cta-text="{{ block.settings.guest_cta_text | escape }}"');
    expect(liquid).toContain('data-cta-url="{{ block.settings.guest_cta_url | escape }}"');
    expect(liquid).toContain('data-login-url="{{ routes.account_login_url }}"');
  });

  it("prints the accent colour escaped", () => {
    expect(liquid).toContain('style="--rw-accent: {{ rewards_accent | escape }}"');
  });

  it("loads the script with defer and the stylesheet once", () => {
    expect(liquid).toMatch(/<script src="\{\{ 'rewards-widget\.js' \| asset_url \}\}" defer><\/script>/);
    expect(schema.stylesheet).toBe("rewards-widget.css");
  });

  it("passes every locale string to the script", () => {
    const keys = Object.keys(locale.rewards_widget);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(liquid).toContain(`data-t-${key.replaceAll("_", "-")}="{{ 'rewards_widget.${key}' | t }}"`);
    }
  });
});

describe("the locale", () => {
  it("is English, speaks of store credit and never of points", () => {
    const strings = Object.values(locale.rewards_widget);
    expect(strings).toContain("Sign in to see your rewards");
    expect(strings).toContain("Earn {percent}% back as store credit");
    expect(strings).toContain("Your store credit shows at checkout");
    expect(strings).toContain("Sign in and choose Apply store credit at checkout");
    for (const s of strings) {
      expect(s).not.toMatch(/points?\b/i);
      // Safe as an attribute value however Shopify escapes it
      expect(s).not.toMatch(/[&<>"']/);
    }
  });
});

describe("the assets", () => {
  it("are under 30 KB of JS and CSS together", () => {
    expect(bytes("assets/rewards-widget.js") + bytes("assets/rewards-widget.css")).toBeLessThan(30_000);
  });

  it("never draw text in the accent, and keep AA contrast in Light and Dark", () => {
    // Every text colour is one of the two text tokens, never the accent
    const colours = [...css.matchAll(/(?:^|[;{\s])color\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(["var(--rw-text)", "var(--rw-muted)"]).toContain(c);

    for (const look of [tokens(".rw"), tokens('.rw[data-look="dark"]')]) {
      expect(contrast(look.text, look.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(look.muted, look.bg)).toBeGreaterThanOrEqual(4.5);
      // Borders and the progress track's edge, as UI parts
      expect(contrast(look.edge, look.bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it("start the accent at teal and use no emoji", () => {
    expect(css).toMatch(/var\(--rw-accent,\s*#17BEBB\)/);
    for (const text of [js, css, liquid, JSON.stringify(locale)]) {
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("send no shop or buyer id of their own", () => {
    expect(js).not.toMatch(/logged_in_customer_id|[?&]shop=/);
  });
});
