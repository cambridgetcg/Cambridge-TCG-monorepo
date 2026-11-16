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

type Setting = { type: string; id?: string; label?: string; info?: string; default?: string; options?: { value: string }[] };
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
/** The stylesheet's rules, each with its selectors and its declarations (comments taken out). */
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  selectors: m[1].split(",").map((s) => s.trim()),
  declarations: [...m[2].matchAll(/([a-z-]+)\s*:\s*([^;]+)/g)].map((d) => ({ property: d[1], value: d[2].trim() })),
}));
/** Every value `property` is given in the rules naming `selector`, in order. */
const declared = (selector: string, property: string) =>
  rules.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.declarations.filter((d) => d.property === property).map((d) => d.value));

/** [classes and attributes, elements] of a simple selector such as `.rw-panel p` or `.rw-panel .rw-label`. */
function specificity(selector: string): [number, number] {
  const parts = selector.split(/\s+/);
  return [parts.filter((p) => p.startsWith(".")).length, parts.filter((p) => /^[a-z]+$/.test(p)).length];
}
/** Whether `selector` (descendant parts only) picks an element `tag.classes` inside `container`. */
function picks(selector: string, element: { tag: string; classes: string[]; container: string }): boolean {
  const parts = selector.split(/\s+/);
  if (parts.some((p) => !/^(\.[a-z-]+|[a-z]+)$/.test(p))) return false;
  const last = parts[parts.length - 1];
  const self = last === element.tag || element.classes.includes(last.slice(1));
  return self && parts.slice(0, -1).every((p) => p === `.${element.container}` || p === ".rw");
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

  // Built for Shopify 4.2.1: the theme editor is US English, and a label says what the setting does
  it("labels its settings in US English, saying what each one changes", () => {
    expect(schemaText).not.toMatch(/colour/i);
    // A choice between Light and Dark
    expect(setting("look")?.label).toBe("Color scheme");
    // The accent also fills the launcher's dot (rewards-widget.css, .rw-dot)
    expect(declared(".rw-dot", "background")).toEqual(["var(--rw-accent, #17BEBB)"]);
    expect(declared(".rw-fill", "background")).toEqual(["var(--rw-accent, #17BEBB)"]);
    expect(setting("accent")?.info).toBe("Fills the dot on the widget's button and the progress bar. Text never uses it.");
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

  // Built for Shopify 4.2.6: the editor previews the widget even with cashback off; a shopper never gets the flag
  it("marks the root as the theme editor's only inside request.design_mode", () => {
    // The markup, without the Liquid comment (which never reaches a page)
    const markup = liquid.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
    const editorOnly = /\{%-?\s*if request\.design_mode\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/.exec(markup);
    expect(editorOnly?.[1]).toMatch(/^\s*data-design-mode\s*$/m);
    expect(editorOnly?.[1]).toContain(`data-t-preview="{{ 'rewards_widget.preview' | t }}"`);
    // Nowhere else, so a storefront page carries neither
    expect(markup.split("data-design-mode")).toHaveLength(2);
    expect(markup.split("data-t-preview")).toHaveLength(2);
    expect(js).toMatch(/hasAttribute\("data-design-mode"\)/);
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

  // Ruling 84 (WIDGET-1): on a phone the launcher covered the cart drawer's Check out and caught its taps
  it("sit under a theme's drawers and dialogs (Dawn's are at 1000)", () => {
    const [zIndex] = declared(".rw", "z-index");
    expect(Number(zIndex)).toBeGreaterThan(0);
    expect(Number(zIndex)).toBeLessThan(1000);
  });

  // Ruling 84 (WIDGET-7): a fixed panel taller than a landscape phone can't be scrolled to its top
  it("keep the panel inside the screen, scrolling within itself", () => {
    // The vh line first, for browsers without dvh
    expect(declared(".rw-panel", "max-height")).toEqual(["calc(100vh - 92px)", "calc(100dvh - 92px)"]);
    expect(declared(".rw-panel", "overflow-y")).toEqual(["auto"]);
  });

  // WIDGET-2: a theme's `p { color }` beats an inherited colour, so every text element sets its own
  it("give every text element its colour at a specificity a theme's element rules can't beat", () => {
    const inButton = [...js.matchAll(/button\.appendChild\(el\("(\w+)",\s*(null|"[^"]*"),/g)].map((m) => `${m[1]} ${m[2]}`);
    const texts = [...js.matchAll(/el\("(p|span|a)",\s*(null|"([^"]*)"),/g)].map((m) => ({
      tag: m[1],
      classes: m[3]?.split(" ") ?? [],
      container: inButton.includes(`${m[1]} ${m[2]}`) ? "rw-button" : "rw-panel",
    }));
    expect(texts.length).toBeGreaterThan(5);

    for (const element of texts) {
      // The rule a browser applies: the highest specificity, the later one on a tie
      let winner: { value: string; specificity: [number, number] } | null = null;
      for (const rule of rules) {
        const value = rule.declarations.filter((d) => d.property === "color").pop()?.value;
        if (!value) continue;
        for (const selector of rule.selectors.filter((s) => picks(s, element))) {
          const s = specificity(selector);
          if (!winner || s[0] > winner.specificity[0] || (s[0] === winner.specificity[0] && s[1] >= winner.specificity[1])) {
            winner = { value, specificity: s };
          }
        }
      }
      const muted = element.classes.some((c) => c === "rw-label" || c === "rw-note");
      expect(winner?.value, `${element.tag}.${element.classes.join(".")}`).toBe(muted ? "var(--rw-muted)" : "var(--rw-text)");
      // At least (0,1,1): above any theme rule on the element alone
      const [classes, tags] = winner!.specificity;
      expect(classes * 10 + tags, `${element.tag}.${element.classes.join(".")}`).toBeGreaterThanOrEqual(11);
    }
  });

  it("pin the panel's and the button's type, so a theme's p and button rules can't distort it", () => {
    for (const selector of [".rw-panel p", ".rw-button"]) {
      for (const property of ["font-size", "line-height", "letter-spacing", "text-transform"]) {
        expect(declared(selector, property), `${selector} ${property}`).toHaveLength(1);
      }
    }
  });

  // WIDGET-5: a ring drawn beside the widget's edge, in its own two colours, shows on any page
  it("draw a two-tone focus ring at offset 0", () => {
    for (const selector of [".rw-button:focus-visible", ".rw-panel .rw-cta:focus-visible"]) {
      expect(declared(selector, "outline")).toEqual(["2px solid var(--rw-text)"]);
      expect(declared(selector, "outline-offset")).toEqual(["0"]);
      expect(declared(selector, "box-shadow").join(" ")).toMatch(/^0 0 0 4px var\(--rw-bg\)/);
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
