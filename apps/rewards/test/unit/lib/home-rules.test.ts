import { describe, expect, it } from "vitest";
import { daysEnding, parseBaseRate, rewardStatus, runningSummary, setupDone, widgetEmbedOn } from "~/lib/home-rules";

describe("Home's rules", () => {
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

  it("gives each payout state its status", () => {
    expect(rewardStatus("cashback", "sent")).toBe("Issued");
    expect(rewardStatus("reversal", "sent")).toBe("Taken back");
    expect(["pending", "sending", "unconfirmed", "held"].map((state) => rewardStatus("cashback", state))).toEqual(["Waiting", "Waiting", "Waiting", "Waiting"]);
    expect(rewardStatus("reversal", "needs_look")).toBe("Needs a look");
    expect(rewardStatus("cashback", "nothing_to_send")).toBe("Taken back");
    expect(rewardStatus("cashback", "closed")).toBe("No cashback");
  });

  it("sums the Running card up in one line, claiming nothing the browser hasn't checked", () => {
    expect(runningSummary(true, { storeCredit: true, widget: true, tiers: true })).toBe("Cashback is on. All checks pass.");
    expect(runningSummary(true, { storeCredit: true, widget: null, tiers: true })).toBe("Cashback is on.");
    expect(runningSummary(false, { storeCredit: false, widget: false, tiers: true })).toBe("Cashback is off. 2 checks need you.");
    expect(runningSummary(false, { storeCredit: true, widget: null, tiers: false })).toBe("Cashback is off. 1 check needs you.");
  });

  it("finishes setup with a tier, cashback on, the widget not off and the import not running", () => {
    const done = { hasTiers: true, running: true, widgetOn: true, importState: "done" };
    expect(setupDone(done)).toBe(true);
    expect(setupDone({ ...done, widgetOn: null })).toBe(true);
    expect(setupDone({ ...done, widgetOn: false })).toBe(false);
    expect(setupDone({ ...done, running: false })).toBe(false);
    expect(setupDone({ ...done, hasTiers: false })).toBe(false);
    expect(setupDone({ ...done, importState: "running" })).toBe(false);
  });

  it("lists calendar days across a month end", () => {
    expect(daysEnding("2026-11-02", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
