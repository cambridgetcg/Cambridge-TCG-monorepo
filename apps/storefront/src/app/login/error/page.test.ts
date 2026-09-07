import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoginErrorPage, { metadata } from "./page";

async function renderError(error?: string) {
  return renderToStaticMarkup(await LoginErrorPage({ searchParams: Promise.resolve({ error }) }));
}

describe("branded auth results", () => {
  it("keeps the registration-paused result for first-time OAuth sign-in", async () => {
    const html = await renderError("RegistrationPaused");
    expect(html).toContain("New registration is paused");
    expect(html).toContain("limiting sign-in to existing account holders");
    expect(html).toContain("adult-account and terms boundary is reviewed");
    expect(html).toContain("Back to sign in");
  });

  it("retains the single-use email-link explanation only for Verification", async () => {
    const html = await renderError("Verification");
    expect(html).toContain("That sign-in link has expired");
    expect(html).toContain("Magic links last 24 hours and can be used once");
    expect(html).toContain("Request a new link");
    expect(html).toContain('href="/login"');
  });

  it.each([
    "OAuthCallbackError", "OAuthAccountNotLinked", "AccountNotLinked",
    "AccessDenied", "Configuration", "MissingCSRF", "OAuthProfileParseError",
    "OAuthSignInError", "InvalidCheck", "unknown-private-details", "constructor",
    "__proto__", undefined,
  ])("gives generic recovery, not an expired-link diagnosis, for %s", async (error) => {
    const html = await renderError(error);
    expect(html).toContain("Back to sign in");
    expect(html).toContain('href="/login"');
    expect(html).not.toMatch(/expired|already been used|account exists|already linked/);
    expect(html).not.toContain("unknown-private-details");
    expect(html).not.toContain("github.com");
  });

  it.each(["OAuthAccountNotLinked", "AccessDenied"])("offers verified-email and sign-out guidance without disclosing a conflict for %s", async (error) => {
    const html = await renderError(error);
    expect(html).toContain("check that your email is verified");
    expect(html).toContain("another sign-in method");
    expect(html).toContain("If you meant to use a different account, sign out first.");
    expect(html).not.toContain("already linked");
    expect(metadata.title).toBe("Sign-in problem — Cambridge TCG");
  });
});
