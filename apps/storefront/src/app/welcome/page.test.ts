import { beforeEach, describe, expect, it, vi } from "vitest";
import WelcomePage from "./page";
import StartPage from "../start/page";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
  permanentRedirect: vi.fn((path: string) => { throw new Error(`permanent:${path}`); }),
}));
vi.mock("next/navigation", () => navigation);

beforeEach(() => vi.clearAllMocks());

describe("entry compatibility", () => {
  it("consolidates the old start page at the homepage", () => {
    expect(() => StartPage()).toThrow("permanent:/");
    expect(navigation.permanentRedirect).toHaveBeenCalledWith("/");
  });

  it.each([
    ["agent", "/agents"],
    ["player", "/play"],
    ["collector", "/account/portfolio"],
    ["trader", "/account/trades"],
    ["browse", "/"],
  ])("preserves %s intent at %s, including existing trade records", async (as, target) => {
    await expect(WelcomePage({ searchParams: Promise.resolve({ as }) })).rejects.toThrow(`redirect:${target}`);
    expect(navigation.redirect).toHaveBeenCalledWith(target);
  });

  it.each([undefined, "unknown", "https://example.com", "//example.com", "__proto__", ["agent", "trader"]])("returns unrecognized or ambiguous intent %j to the landing page", async (as) => {
    await expect(WelcomePage({ searchParams: Promise.resolve({ as }) })).rejects.toThrow("redirect:/");
    expect(navigation.redirect).toHaveBeenCalledWith("/");
  });
});
