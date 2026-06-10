/**
 * Contract tests for the shared storefront stylesheet.
 *
 * Guarantees that:
 *   1. rp-shared.css exports the canonical design tokens every widget
 *      expects (typography in rem, spacing in px, semantic + state colors).
 *   2. No widget CSS file still declares those shared tokens locally — the
 *      consolidation completed (otherwise merchants who override one
 *      widget's token wouldn't affect the others).
 *   3. The shared empty-state + skeleton classes are exposed.
 *   4. The dark-mode block targets `:root` (not the widget-root scope) so
 *      the overrides cascade through every widget.
 *   5. All widget-root selectors are included in the isolation rules.
 *
 * These are source-level checks — no browser needed. They prevent the
 * "I added a token locally and forgot the others" regression.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ASSETS = path.resolve(
  __dirname,
  "../../extensions/theme-app-extension-rewardspro/assets"
);

const SHARED = fs.readFileSync(path.join(ASSETS, "rp-shared.css"), "utf-8");

describe("rp-shared.css — token surface", () => {
  it("declares every shared design token", () => {
    const required = [
      // Spacing
      "--rp-space-xs", "--rp-space-sm", "--rp-space-md",
      "--rp-space-lg", "--rp-space-xl", "--rp-space-2xl",
      // Typography (must be in rem for user-font scaling)
      "--rp-font-xs", "--rp-font-sm", "--rp-font-md",
      "--rp-font-lg", "--rp-font-xl", "--rp-font-2xl",
      // Radius
      "--rp-radius-sm", "--rp-radius-md", "--rp-radius-lg", "--rp-radius-full",
      // Shadow
      "--rp-shadow-sm", "--rp-shadow-md", "--rp-shadow-lg", "--rp-shadow-xl",
      // Motion
      "--rp-duration-fast", "--rp-duration-normal", "--rp-duration-slow", "--rp-easing",
      // Semantic
      "--rp-text-color", "--rp-text-secondary",
      "--rp-background-color", "--rp-background-subtle",
      "--rp-card-bg", "--rp-border-color",
      // State
      "--rp-color-success", "--rp-color-error", "--rp-color-warning",
      // Rarity
      "--rp-rarity-common", "--rp-rarity-uncommon", "--rp-rarity-rare",
      "--rp-rarity-epic", "--rp-rarity-legendary",
      // Viewport
      "--rp-100dvh",
    ];
    for (const token of required) {
      expect(SHARED, `token ${token} missing from rp-shared.css`).toContain(token + ":");
    }
  });

  it("typography tokens are expressed in rem (not px)", () => {
    // Capture the first declaration of each font token.
    for (const token of ["xs", "sm", "md", "lg", "xl", "2xl"]) {
      const m = SHARED.match(new RegExp(`--rp-font-${token.replace("2xl", "2xl")}:\\s*([^;]+);`));
      expect(m, `no --rp-font-${token} declaration`).not.toBeNull();
      expect(
        m![1],
        `--rp-font-${token} should be in rem (user-font-size scaling) — got "${m![1].trim()}"`
      ).toMatch(/rem/);
    }
  });

  it("exposes dvh-aware viewport helper with vh fallback", () => {
    expect(SHARED).toMatch(/--rp-100dvh:\s*100vh/);
    expect(SHARED).toMatch(/@supports\s*\(height:\s*100dvh\)/);
    expect(SHARED).toMatch(/--rp-100dvh:\s*100dvh/);
  });

  it("dark-mode overrides :root (not widget-root scope)", () => {
    // Overrides must cascade through every widget, including rp-empty-state
    // and skeleton classes.
    const darkBlock = SHARED.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\}/);
    expect(darkBlock, "missing prefers-color-scheme: dark block").not.toBeNull();
    expect(darkBlock![1], "dark block must target :root").toMatch(/:root\s*\{/);
  });

  it("isolation rules enumerate every widget root", () => {
    const roots = [
      ".rp-widget-root",
      ".rp-raffles-root",
      ".rp-mb-root",
      ".rp-missions-root",
      ".rp-missions-section-root",
      ".rp-giftcards-root",
    ];
    for (const r of roots) {
      expect(SHARED, `${r} missing from isolation rules`).toContain(r);
    }
  });

  it("exposes reusable empty/skeleton/link classes", () => {
    for (const cls of [
      ".rp-sr-only",
      ".rp-skel",
      ".rp-skel--bar",
      ".rp-skel--circle",
      ".rp-btn-link",
      ".rp-empty-state",
      ".rp-empty-state__title",
      ".rp-empty-state__message",
      ".rp-empty-state__actions",
    ]) {
      expect(SHARED, `${cls} missing`).toContain(cls);
    }
  });

  it("exposes the coherent button system", () => {
    // One shape, one spacing, one focus ring — all widgets should thread
    // the same `.rp-btn` onto their buttons and let the modifier decide
    // the palette.
    for (const cls of [
      ".rp-btn",
      ".rp-btn--primary",
      ".rp-btn--secondary",
      ".rp-btn--ghost",
      ".rp-btn--sm",
      ".rp-btn--full",
    ]) {
      expect(SHARED, `${cls} missing`).toContain(cls);
    }
  });

  it("button system uses CSS-var override hooks for widget-specific accents", () => {
    // Widgets that want their own primary color (raffle gradient, missions
    // indigo, gift-card gold) scope `--rp-btn-primary-bg` at their root
    // and inherit the shared shape. If these hooks disappear, each widget
    // starts redeclaring `.rp-btn--primary` and the drift comes back.
    expect(SHARED).toMatch(/--rp-btn-primary-bg/);
    expect(SHARED).toMatch(/--rp-btn-secondary-bg/);
  });

  it("`.rp-btn:focus-visible` draws a visible outline", () => {
    // Every button — primary, secondary, ghost, sm, full — inherits this
    // single focus-ring declaration. If a widget overrides it locally,
    // keyboard users see inconsistent focus across the page.
    expect(SHARED).toMatch(/\.rp-btn:focus-visible\s*\{[\s\S]*outline:/);
  });

  it("`.rp-btn` meets the 44px touch-target floor", () => {
    expect(SHARED).toMatch(/\.rp-btn\s*\{[\s\S]*min-height:\s*44px/);
  });

  it("exposes a coherent .rp-card primitive", () => {
    for (const cls of [".rp-card"]) {
      expect(SHARED, `${cls} missing`).toContain(cls);
    }
  });

  it("exposes .rp-pill status chip with semantic tones", () => {
    for (const cls of [
      ".rp-pill",
      ".rp-pill--success",
      ".rp-pill--error",
      ".rp-pill--warning",
    ]) {
      expect(SHARED, `${cls} missing`).toContain(cls);
    }
  });

  it("exposes .rp-section-title for widget headings", () => {
    expect(SHARED).toContain(".rp-section-title");
  });

  it("exposes the three semantic typography roles", () => {
    // .rp-section-title / .rp-headline / .rp-label / .rp-meta bind a
    // font size + weight + color to an information-hierarchy role so
    // widgets don't re-derive the relationship. DESIGN.md documents
    // the intended usage.
    for (const cls of [".rp-section-title", ".rp-headline", ".rp-label", ".rp-meta"]) {
      expect(SHARED, `${cls} missing`).toContain(cls);
    }
  });

  it("ships a universal focus-visible ring for every widget root", () => {
    // The keyboard-a11y floor: any button/link/tabindex element inside
    // any widget root gets a visible outline. Widgets can still style
    // their own focus MORE specifically — this just prevents "no ring
    // at all" from sneaking in when a new widget adds a button.
    expect(SHARED).toMatch(
      /\.rp-widget-root\s+:is\(a,\s*button,\s*\[tabindex\]\):focus-visible/
    );
    // All six widget roots must be enumerated. Missing one lets that
    // widget's buttons ship without a focus ring.
    for (const root of [
      ".rp-widget-root",
      ".rp-raffles-root",
      ".rp-mb-root",
      ".rp-missions-root",
      ".rp-missions-section-root",
      ".rp-giftcards-root",
    ]) {
      expect(SHARED).toMatch(
        new RegExp(
          root.replace(".", "\\.") +
            "\\s+:is\\(a,\\s*button,\\s*\\[tabindex\\]\\):focus-visible"
        )
      );
    }
  });
});

describe("widget JS renders use the coherent button system for retries", () => {
  // Every widget's empty/error state renders a "Try again" button. They
  // used to use bespoke classes (rp-raffles__retry-btn, rp-mb-btn--secondary,
  // rp-missions-btn--secondary) — now they thread through .rp-btn so the
  // shape + focus ring + tap-target are identical everywhere.
  const ASSET_JS = [
    ["raffles.js", /Try again/],
    ["mystery-boxes-widget.js", /Try again/],
    ["missions-widget.js", /Try again/],
    ["membership-widget.js", /Try Again|Try again/],
  ] as const;

  for (const [file, textMatcher] of ASSET_JS) {
    it(`${file} retry button uses .rp-btn .rp-btn--secondary`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      // Confirm the retry copy still exists and confirm the file uses
      // the shared button class. We don't try to pair the specific
      // element to the specific "Try again" text — some retry buttons
      // open 5+ lines before the copy due to SVG icon markup. A
      // whole-file assertion is more robust and still catches the
      // regression where someone writes a new retry button with a
      // bespoke class.
      expect(
        textMatcher.test(source),
        `${file} should render "Try again" copy somewhere`
      ).toBe(true);
      expect(
        source,
        `${file} must thread .rp-btn .rp-btn--secondary on its retry button`
      ).toMatch(/rp-btn\s+rp-btn--secondary/);
    });
  }
});

describe("widget CSS files — no longer redeclare shared tokens", () => {
  // The spacing token is a reliable canary: every widget used to redefine
  // all six values. Finding `--rp-space-xs:` in a widget file means the
  // consolidation regressed.
  const WIDGETS = [
    "membership-widget.css",
    "raffles.css",
    "mystery-boxes-widget.css",
    "missions-widget.css",
    "gift-cards.css",
  ];

  for (const file of WIDGETS) {
    it(`${file} does not redeclare --rp-space-xs`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      expect(
        source,
        `${file} still declares --rp-space-xs — move to rp-shared.css`
      ).not.toMatch(/--rp-space-xs:\s*[^;]+;/);
    });

    it(`${file} does not redeclare --rp-font-md`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      expect(
        source,
        `${file} still declares --rp-font-md — move to rp-shared.css`
      ).not.toMatch(/--rp-font-md:\s*[^;]+;/);
    });

    it(`${file} does not redeclare --rp-rarity-legendary`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      expect(
        source,
        `${file} still declares --rp-rarity-legendary — move to rp-shared.css`
      ).not.toMatch(/--rp-rarity-legendary:\s*[^;]+;/);
    });
  }
});

describe("widget JS — number formatting routes through RP.format", () => {
  // Before: every widget had its own sprinkling of `.toLocaleString()` and
  // (in gift-cards) a private `Intl.NumberFormat` wrapper. Rendering
  // diverged subtly — gift-cards used the user's browser locale, others
  // used Intl's default — so a French shopper saw `1,234` in one widget
  // and `1 234` in another. All currency + number formatting now routes
  // through `RP.format.currency` and `RP.format.number`, which apply one
  // locale decision per page.
  const ASSET_JS = [
    "raffles.js",
    "mystery-boxes-widget.js",
    "missions-widget.js",
    "membership-widget.js",
    "gift-cards.js",
  ];

  it.each(ASSET_JS)(
    "%s does not call `.toLocaleString()` directly in a render path",
    (file) => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      // Strip `//` and `/* */` comments so the rule doesn't trip on
      // documentation that mentions toLocaleString.
      const cleaned = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      const hits = cleaned.match(/\.toLocaleString\s*\(/g) || [];
      expect(
        hits,
        `${file} still calls .toLocaleString — migrate to RP.format.number so all widgets format numbers with the same locale policy`
      ).toEqual([]);
    }
  );

  it.each(ASSET_JS)(
    "%s does not call `new Intl.NumberFormat(` directly",
    (file) => {
      if (file === "rp-utils.js") return; // RPUtils itself is the canonical home
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      const cleaned = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      const hits = cleaned.match(/new\s+Intl\.NumberFormat\s*\(/g) || [];
      expect(
        hits,
        `${file} should format currency via RP.format.currency, not a local Intl.NumberFormat wrapper`
      ).toEqual([]);
    }
  );
});

describe("widget JS — copy voice is conversational, not technical", () => {
  // The membership widget set the tone: error states reassure ("Your
  // points are safe — try again in a moment.") instead of announcing
  // failure as "Failed to ...". These guards stop that voice from drifting
  // back into the other widgets during future changes.
  const ASSET_JS = [
    "raffles.js",
    "mystery-boxes-widget.js",
    "missions-widget.js",
    "membership-widget.js",
  ];

  // "Failed to X" is the classic terse voice. Search outside comments and
  // console.* calls — those are developer-facing and fine.
  function surfaceCopy(source: string): string {
    // Strip `console.*`, `log.*`, single-line comments, and block comments
    // so we only grep the strings the shopper can see.
    return source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/console\.\w+\([^)]*\)/g, "")
      .replace(/\blog\.\w+\([^)]*\)/g, "");
  }

  it.each(ASSET_JS)("%s avoids 'Failed to ...' user-facing copy", (file) => {
    const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
    const cleaned = surfaceCopy(source);
    const hits = cleaned.match(/["'`]Failed to [^"'`]*["'`]/g) || [];
    expect(
      hits,
      `${file} still has terse 'Failed to ...' strings shown to shoppers: ${hits.join(", ")}`
    ).toEqual([]);
  });

  it.each(ASSET_JS)("%s avoids 'Configuration error' user-facing copy", (file) => {
    const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
    const cleaned = surfaceCopy(source);
    const hits = cleaned.match(/["'`]Configuration error["'`]/g) || [];
    expect(hits, `${file} still has 'Configuration error'`).toEqual([]);
  });

  it.each(ASSET_JS)("%s avoids bare 'Request timed out' copy", (file) => {
    const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
    const cleaned = surfaceCopy(source);
    const hits = cleaned.match(/["'`]Request timed out["'`]/g) || [];
    expect(hits, `${file} still has 'Request timed out'`).toEqual([]);
  });
});

describe("widget CSS files — design rhythm budget", () => {
  // Locks in the current post-tokenization state as a CEILING. Any new
  // hardcoded `border-radius: Npx`, `transition: ...Ns ease`, etc. fails
  // the budget unless the developer also lowers the numbers after
  // migrating to tokens. This is how rhythm stays intact across PRs —
  // drift can't accumulate without showing up red.
  //
  // When you LEGITIMATELY need an off-scale value (a hero section with
  // a 20px radius for visual weight, a 500ms ease-out for a celebration),
  // add a comment explaining why and bump the budget here. Numbers go
  // up; they should not go up without justification.
  const RADIUS_BUDGET: Record<string, number> = {
    "membership-widget.css": 12,
    "raffles.css": 2,
    "mystery-boxes-widget.css": 1,
    "missions-widget.css": 5,
    "gift-cards.css": 0,
  };
  const TRANSITION_BUDGET: Record<string, number> = {
    "membership-widget.css": 2,
    "raffles.css": 1,
    "mystery-boxes-widget.css": 2,
    "missions-widget.css": 3,
    "gift-cards.css": 1,
  };

  for (const [file, budget] of Object.entries(RADIUS_BUDGET)) {
    it(`${file}: hardcoded border-radius count stays ≤ ${budget}`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      const count = (source.match(/border-radius:\s*\d+px/g) || []).length;
      expect(
        count,
        `${file} has ${count} hardcoded border-radius values; budget is ${budget}. Migrate to --rp-radius-* or document why the off-scale value is needed and bump the budget.`
      ).toBeLessThanOrEqual(budget);
    });
  }

  for (const [file, budget] of Object.entries(TRANSITION_BUDGET)) {
    it(`${file}: hardcoded transition durations stay ≤ ${budget}`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      const count = (source.match(/transition:[^;]*\b\d+(\.\d+)?(ms|s)\b/g) || []).length;
      expect(
        count,
        `${file} has ${count} hardcoded transition durations; budget is ${budget}. Migrate to --rp-duration-* or bump the budget with justification.`
      ).toBeLessThanOrEqual(budget);
    });
  }
});

describe("DESIGN.md — the principles document exists and covers the rules", () => {
  const DESIGN_MD = path.resolve(
    __dirname,
    "../../extensions/theme-app-extension-rewardspro/DESIGN.md"
  );

  it("is committed", () => {
    expect(fs.existsSync(DESIGN_MD), "DESIGN.md must be committed").toBe(true);
  });

  it("covers the core principles by name", () => {
    const md = fs.readFileSync(DESIGN_MD, "utf-8");
    for (const principle of [
      "Quiet by default",
      "Shopper-first voice",
      "Theme before brand",
      "One page, one rhythm",
      "Rhythm",
      "Motion",
      "Elevation",
    ]) {
      expect(md, `DESIGN.md missing "${principle}"`).toContain(principle);
    }
  });

  it("references every token scale", () => {
    const md = fs.readFileSync(DESIGN_MD, "utf-8");
    for (const token of [
      "--rp-space-",
      "--rp-font-",
      "--rp-radius-",
      "--rp-duration-",
      "--rp-shadow-",
    ]) {
      expect(md, `DESIGN.md should mention ${token}`).toContain(token);
    }
  });
});

describe("widget CSS files — no 9/10px font sizes (WCAG floor)", () => {
  const WIDGETS = [
    "membership-widget.css",
    "raffles.css",
    "mystery-boxes-widget.css",
    "missions-widget.css",
    "gift-cards.css",
  ];

  for (const file of WIDGETS) {
    it(`${file} uses no font-size: 9px or 10px`, () => {
      const source = fs.readFileSync(path.join(ASSETS, file), "utf-8");
      const tiny = source.match(/font-size:\s*(9|10)px/g) || [];
      expect(tiny, `${file} has tiny text: ${tiny.join(", ")}`).toEqual([]);
    });
  }
});
