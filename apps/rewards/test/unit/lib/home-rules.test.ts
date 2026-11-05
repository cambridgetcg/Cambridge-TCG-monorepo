import { describe, expect, it } from "vitest";
import { daysEnding, homeBanners, importOutcomeShown, parseBaseRate, runningSummary, setupDone, themeEditorUrl, widgetEmbedOn } from "~/lib/home-rules";

describe("Home's rules", () => {
  // A19-F6: no app key is a configuration error, never a link that quietly goes nowhere
  it("links to the widget embed in the theme editor, and refuses to without the app's key", () => {
    expect(themeEditorUrl("a.myshopify.com", "k1")).toBe("https://a.myshopify.com/admin/themes/current/editor?context=apps&activateAppId=k1/membership_widget");
    expect(() => themeEditorUrl("a.myshopify.com", "")).toThrow(/SHOPIFY_API_KEY/);
    expect(() => themeEditorUrl("a.myshopify.com", undefined)).toThrow(/SHOPIFY_API_KEY/);
  });

  it("finds the widget embed among the app's extensions", () => {
    const theme = (status: string) => ({
      type: "theme_app_extension",
      activations: [{ handle: "membership_widget", name: "Rewards widget", target: "body", status, activations: [] }],
    });
    expect(widgetEmbedOn([theme("active")])).toBe(true);
    expect(widgetEmbedOn([theme("available")])).toBe(false);
    expect(widgetEmbedOn([theme("unavailable")])).toBe(false);
    // Nothing to go on: no theme extension, or one without the embed
    expect(widgetEmbedOn([])).toBeNull();
    expect(widgetEmbedOn([{ type: "ui_extension", activations: [{ target: "admin.product-details.block.render" }] }])).toBeNull();
    expect(widgetEmbedOn([{ type: "theme_app_extension", activations: [{ handle: "other_block", status: "active" }] }])).toBeNull();
  });

  it("takes a base rate only as a whole percent from 0 to 100", () => {
    expect(["0", "5", " 12 ", "100"].map(parseBaseRate)).toEqual([0, 5, 12, 100]);
    expect(["4.5", "101", "-1", "", "1e2", "five", null].map(parseBaseRate)).toEqual([null, null, null, null, null, null, null]);
  });

  it("sums the Running card up in one line, claiming nothing the browser hasn't checked", () => {
    expect(runningSummary(true, { storeCredit: true, widget: true, tiers: true })).toBe("Cashback is on. All checks pass.");
    expect(runningSummary(true, { storeCredit: true, widget: null, tiers: true })).toBe("Cashback is on.");
    expect(runningSummary(false, { storeCredit: false, widget: false, tiers: true })).toBe("Cashback is off. 2 checks need you.");
    expect(runningSummary(false, { storeCredit: true, widget: null, tiers: false })).toBe("Cashback is off. 1 check needs you.");
    // Ruling 59: Shopify didn't say whether store credit can be spent, so no check is claimed to pass
    expect(runningSummary(true, { storeCredit: null, widget: true, tiers: true })).toBe("Cashback is on.");
    expect(runningSummary(true, { storeCredit: null, widget: true, tiers: false })).toBe("Cashback is on. 1 check needs you.");
  });

  // Ruling 56: Home counts what Orders counts, orders that need a look
  it("counts the orders that need a look, as the Orders page does", () => {
    const facts = { privacyDueAt: null, spendProblems: [], timezone: "Europe/London", themeEditorUrl: "" };
    expect(homeBanners({ ...facts, needsLook: 1 }, true).map((b) => b.text)).toEqual(["1 order needs a look."]);
    expect(homeBanners({ ...facts, needsLook: 3 }, true).map((b) => b.text)).toEqual(["3 orders need a look."]);
  });

  it("finishes setup with a tier, cashback on, the widget not off and the import ended and its outcome dismissed", () => {
    const done = { hasTiers: true, running: true, widgetOn: true, importState: "done", importDismissed: true };
    expect(setupDone(done)).toBe(true);
    // An import that ends after every other step still shows how it ended
    expect(setupDone({ ...done, importDismissed: false })).toBe(false);
    expect(setupDone({ ...done, importState: "failed", importDismissed: false })).toBe(false);
    expect(setupDone({ ...done, importState: "failed" })).toBe(true);
    expect(setupDone({ ...done, importState: "not_started", importDismissed: false })).toBe(true);
    expect(setupDone({ ...done, widgetOn: null })).toBe(true);
    expect(setupDone({ ...done, widgetOn: false })).toBe(false);
    expect(setupDone({ ...done, running: false })).toBe(false);
    expect(setupDone({ ...done, hasTiers: false })).toBe(false);
    expect(setupDone({ ...done, importState: "running" })).toBe(false);
  });

  it("shows the import's outcome from when it ends until it is dismissed", () => {
    expect(["not_started", "running", "done", "failed"].map((state) => importOutcomeShown(state, false))).toEqual([false, false, true, true]);
    expect(["done", "failed"].map((state) => importOutcomeShown(state, true))).toEqual([false, false]);
  });

  it("lists calendar days across a month end", () => {
    expect(daysEnding("2026-11-02", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
