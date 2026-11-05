import { describe, expect, it } from "vitest";
import {
  type SetupFacts,
  homeBanners,
  importOutcomeLines,
  importOutcomeShown,
  runningSummary,
  setupCardShown,
  setupJustCompleted,
  themeEditorUrl,
  widgetEmbedOn,
} from "~/admin/home-rules";

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

  it("sums the Running card up in one line, claiming nothing the browser hasn't checked", () => {
    expect(runningSummary(true, { storeCredit: true, widget: true, tiers: true })).toBe("Cashback is on. All checks pass.");
    expect(runningSummary(true, { storeCredit: true, widget: null, tiers: true })).toBe("Cashback is on.");
    expect(runningSummary(false, { storeCredit: false, widget: false, tiers: true })).toBe("Cashback is off. 2 checks need you.");
    expect(runningSummary(false, { storeCredit: true, widget: null, tiers: false })).toBe("Cashback is off. 1 check needs you.");
    // Ruling 59: Shopify didn't say whether store credit can be spent, so no check is claimed to pass
    expect(runningSummary(true, { storeCredit: null, widget: true, tiers: true })).toBe("Cashback is on.");
    expect(runningSummary(true, { storeCredit: null, widget: true, tiers: false })).toBe("Cashback is on. 1 check needs you.");
  });

  describe("the banners", () => {
    const facts = { privacyDueAt: null, spendProblems: [], needsLookOrderId: null, timezone: "Europe/London", themeEditorUrl: "" };

    // Ruling 56: Home counts what Orders counts, orders that need a look
    it("counts the orders that need a look, as the Orders page does", () => {
      expect(homeBanners({ ...facts, needsLook: 1 }, true).map((b) => b.text)).toEqual(["1 order needs a look."]);
      expect(homeBanners({ ...facts, needsLook: 3 }, true).map((b) => b.text)).toEqual(["3 orders need a look."]);
    });

    // DESIGN-12: one click from Home to what needs a look
    it("links straight to the one order that needs a look, or to Orders showing only those", () => {
      expect(homeBanners({ ...facts, needsLook: 1, needsLookOrderId: "o-1" }, true)[0].link).toEqual({ label: "Open the order", href: "/app/orders/o-1" });
      expect(homeBanners({ ...facts, needsLook: 3 }, true)[0].link).toEqual({ label: "Open orders", href: "/app/orders?look=1" });
    });

    it("says every store credit problem in the order the merchant fixes them", () => {
      const [banner] = homeBanners({ ...facts, needsLook: 0, spendProblems: ["legacy-accounts", "sign-in-links-hidden", "store-credit-off"] }, true);
      expect(banner.text).toBe(
        "Buyers can't spend their store credit yet: your store uses legacy customer accounts; sign-in links are hidden on your store and at checkout; store credit is turned off in Settings > Customer accounts.",
      );
    });
  });

  // Ruling 60: setup is done once it has been completed; later state belongs to the Running checks and the banners
  describe("the setup card", () => {
    const fresh: SetupFacts = { completed: false, hasTiers: false, running: false, widgetOn: null, importState: "not_started", importDismissed: false };
    const stepsDone: SetupFacts = { ...fresh, hasTiers: true, running: true, widgetOn: true };
    const completed: SetupFacts = { ...fresh, completed: true };

    it.each([
      // [why, facts, card shown]
      ["no step done", fresh, true],
      ["a base rate only", { ...fresh, hasTiers: true }, true],
      ["the widget off", { ...fresh, hasTiers: true, running: true, widgetOn: false }, true],
      ["every step done", stepsDone, false],
      ["every step but a widget the browser can't see", { ...stepsDone, widgetOn: null }, false],
      ["the import still running", { ...stepsDone, importState: "running" }, true],
      ["the import's outcome not yet dismissed", { ...stepsDone, importState: "done" }, true],
      ["the import's outcome dismissed", { ...stepsDone, importState: "failed", importDismissed: true }, false],
      // Completed once: a pause or the embed turned off later doesn't bring it back
      ["completed, then paused with the embed off", completed, false],
      ["completed, then paused", { ...completed, hasTiers: true, running: false, widgetOn: false }, false],
      ["completed, with the import's outcome not yet dismissed", { ...completed, importState: "done" }, true],
      ["completed, with the import's outcome dismissed", { ...completed, importState: "done", importDismissed: true }, false],
    ] as const)("%s", (_why, facts, shown) => {
      expect(setupCardShown(facts)).toBe(shown);
    });

    it("is completed the first time every step is seen done, the widget seen on", () => {
      expect(setupJustCompleted(stepsDone)).toBe(true);
      // Not on an unseen widget, nor a second time
      expect(setupJustCompleted({ ...stepsDone, widgetOn: null })).toBe(false);
      expect(setupJustCompleted({ ...stepsDone, widgetOn: false })).toBe(false);
      expect(setupJustCompleted({ ...stepsDone, running: false })).toBe(false);
      expect(setupJustCompleted({ ...stepsDone, hasTiers: false })).toBe(false);
      expect(setupJustCompleted({ ...stepsDone, completed: true })).toBe(false);
    });
  });

  it("shows the import's outcome from when it ends until it is dismissed", () => {
    expect(["not_started", "running", "done", "failed"].map((state) => importOutcomeShown(state, false))).toEqual([false, false, true, true]);
    expect(["done", "failed"].map((state) => importOutcomeShown(state, true))).toEqual([false, false]);
  });

  // Ruling 76 (TRUTH-2) and Ruling 74 (BOUNDARY-4, TRUTH-12): plain sentences, counting the buyers brought in
  describe("the import's outcome", () => {
    const done = { state: "done" as const, importedOrders: 300, importedBuyers: 120, unreadable: false, hasTiers: true, placing: false };

    it("counts the buyers it brought in once they are placed", () => {
      expect(importOutcomeLines(done)).toEqual(["Done: 120 buyers placed in tiers"]);
      expect(importOutcomeLines({ ...done, importedBuyers: 1 })).toEqual(["Done: 1 buyer placed in tiers"]);
    });

    it("names the buyers it brought in with no tiers yet, and says when they are placed", () => {
      expect(importOutcomeLines({ ...done, hasTiers: false })).toEqual([
        "Brought in 120 buyers' past orders. They're placed in tiers when you save your base rate.",
      ]);
      expect(importOutcomeLines({ ...done, hasTiers: false, importedBuyers: 1 })).toEqual([
        "Brought in 1 buyer's past orders. They're placed in tiers when you save your base rate.",
      ]);
    });

    it("says the buyers are being placed while the requested pass runs", () => {
      expect(importOutcomeLines({ ...done, placing: true })).toEqual(["Brought in 120 buyers' past orders. They're being placed in tiers."]);
    });

    it("says when some orders couldn't be read, with the count it brought in", () => {
      expect(importOutcomeLines({ ...done, unreadable: true, importedOrders: 1200 })).toEqual([
        "Brought in 1,200 of your past orders; the rest couldn't be read.",
        "Done: 120 buyers placed in tiers",
      ]);
    });

    it("says there was nothing to bring in", () => {
      expect(importOutcomeLines({ ...done, importedOrders: 0, importedBuyers: 0 })).toEqual(["Done: there were no past orders to bring in."]);
    });

    it("gives a failed import one plain sentence, counting what it brought in before it failed", () => {
      const failed = { ...done, state: "failed" as const };
      expect(importOutcomeLines({ ...failed, importedOrders: 0, importedBuyers: 0 })).toEqual([
        "Your past orders couldn't be brought in, so buyers start in the lowest tier.",
      ]);
      expect(importOutcomeLines({ ...failed, importedOrders: 120 })).toEqual(["Brought in 120 of your past orders; the rest couldn't be read."]);
    });
  });
});
