import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PrivacyPage from "./page";

// The retention check below imports lib/peers, which opens no connection but
// needs the db module present.
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const page = readFileSync(
  resolve(process.cwd(), "src/app/privacy/page.tsx"),
  "utf8",
);
const compactPage = page.replace(/\s+/g, " ");
const renderedPage = renderToStaticMarkup(createElement(PrivacyPage));

describe("storefront privacy notice contract", () => {
  it("renders spaces at prose-to-code boundaries", () => {
    expect(renderedPage).toContain("ctcg-practice-battle</code>, <code");
    expect(renderedPage).toContain("</code> and <code");
    expect(renderedPage).toContain("The current <code");
  });

  it("identifies the controller and a working privacy route", () => {
    expect(page).toContain("Cambridge TCG Limited");
    expect(page).toContain("15680297");
    expect(page).toContain("60 Tottenham Court Road");
    expect(page).toContain("Suite 4583a");
    expect(page).toContain("W1T 2EW");
    expect(page).toContain("mailto:support@cambridgetcg.com");
  });

  it("maps actual high-risk data categories to purposes and lawful bases", () => {
    for (const claim of [
      "Stripe payments and payouts",
      "Optional Cambridge identity",
      "government-identity, proof-of-address or other supporting",
      "Optional external reputation",
      "Collectives and directory data",
      "Saved and public decks",
      "Optional collector observations",
      "Testnet wallet-link data",
      "Requests, security and logs",
      "Contract",
      "Legal obligation",
      "Legitimate interests",
      "Consent",
    ]) {
      expect(compactPage, claim).toContain(claim);
    }
    expect(page).toContain("required to create and");
    expect(page).toContain("are optional");
    expect(page).toContain('id="identity-verification"');
    expect(compactPage).toContain("It rejects bank details");
    expect(page).toContain("bank fields remaining from an earlier");
    expect(compactPage).toContain(
      "new submissions and document uploads are paused by default",
    );
    expect(compactPage).toContain("after an explicit private storage review");
    expect(compactPage).toContain("an unindexed file can remain");
    expect(compactPage).toContain(
      "New uploads stay paused until Cambridge TCG has reviewed private storage and an abandoned-upload inventory or expiry process",
    );
    expect(compactPage).toContain("Google sign-in is optional");
    expect(page).toContain("OAuth access");
  });

  it("leads with a plain-language summary before the detailed notice", () => {
    expect(compactPage).toContain("At a glance");
    expect(compactPage).toContain(
      "We do not sell personal data or run advertising trackers",
    );
    expect(compactPage).toContain(
      "You can ask for an explanation and human review",
    );
  });

  it("links every material operational section from the contents navigation", () => {
    for (const anchor of [
      "automated-rules",
      "not-collected",
      "paused-and-legacy",
    ]) {
      expect(page).toContain(`href="#${anchor}"`);
      expect(page).toContain(`id="${anchor}"`);
    }
  });

  it("discloses the retired membership payment mirror without implying full-card storage", () => {
    expect(compactPage).toContain("retired paid-membership system");
    expect(compactPage).toContain("card brand and last four digits");
    expect(compactPage).toContain(
      "Cambridge TCG does not retain the full card number",
    );
    expect(compactPage).toContain("authenticated legacy billing endpoint");
    expect(compactPage).toContain("marked private and no-store");
  });

  it("explains the public open-order projection and its lawful basis", () => {
    expect(page).toContain('id="market-orders"');
    expect(compactPage).toContain("published without sign-in");
    expect(compactPage).toContain(
      "total remaining quantity and number of orders",
    );
    expect(compactPage).toContain(
      "listing ID, price, remaining quantity, condition, offer setting, return setting and return window, creation time",
    );
    expect(compactPage).toContain("listing-scoped contact-availability flag");
    expect(compactPage).toContain(
      "does not return the seller&rsquo;s account/user ID, username, name, profile, email, trust dossier, private notes, payment details or delivery address",
    );
    expect(compactPage).toContain(
      "stops serving it in future open-order responses",
    );
    expect(compactPage).toContain("cannot recall copies already fetched");
    expect(compactPage).toContain(
      "order-book publication is not treated as consent",
    );
  });

  it("treats trade-in as retired without making an unverified record-count claim", () => {
    expect(compactPage).not.toContain(
      "Orders, trade-ins and peer transactions",
    );
    expect(compactPage).toContain("Retired trade-in desk");
    for (const path of [
      "/api/tradein/status",
      "/api/tradein/submit",
      "/api/tradein/quote",
      "/api/market/sell-for-credit",
      "/api/quotes",
    ]) {
      expect(page, path).toContain(path);
    }
    expect(compactPage).toContain(
      "return HTTP 410 before reading submitted content or trade-in database records",
    );
    expect(compactPage).toContain("collect no new trade-in submission content");
    expect(compactPage).toContain(
      "does not infer from source code alone whether a historical row exists",
    );
    expect(compactPage).not.toMatch(/zero (?:trade-in )?submissions?/i);
  });

  it("keeps versioned person and activity publication anchors", () => {
    expect(page).toContain('id="person-publication"');
    expect(page).toContain('id="activity-publication"');
    expect(page).toContain("PERSON_PUBLICATION_NOTICE.profile");
    expect(page).toContain("ACTIVITY_PUBLICATION_NOTICE.activity");
    expect(page).toContain('id="deck-publication"');
    expect(compactPage).toContain("unauthenticated list and full-deck APIs");
    expect(compactPage).toContain("author account ID is not returned");
    expect(compactPage).toContain("not deduplicated by session");
  });

  it("discloses children, automation, transfers, retention and full rights", () => {
    expect(page).toContain("does not currently");
    expect(page).toContain("general age assurance");
    expect(compactPage).toContain("site-wide, versioned age-and-terms assent");
    expect(compactPage).toContain(
      "cannot claim that every account holder is an adult",
    );
    expect(compactPage).toContain(
      "Production now defaults new account admission and new P2P commitments to paused",
    );
    expect(compactPage).toContain(
      "release control is not age assurance",
    );
    expect(compactPage).toContain("If you are under 18");
    expect(compactPage).toContain("Ask a parent or guardian to contact us");
    expect(compactPage).toContain("human review");
    expect(compactPage).toContain("transaction limits, escrow routes");
    expect(compactPage).toContain("statutory safeguards for solely");
    expect(page).not.toContain(
      "does not intentionally use these rules to make a solely automated decision",
    );
    expect(page).toContain("International transfers");
    expect(page).toContain("International Data Transfer Agreement");
    expect(page).toContain("at least six years from the end");
    expect(compactPage).toContain(
      "The exact live periods have not yet been consolidated into this notice",
    );
    expect(compactPage).toContain(
      "There is not currently a separate maximum time by which every expired row is guaranteed to be removed",
    );
    expect(page).toContain("access your personal data");
    expect(page).toContain("correct inaccurate data");
    expect(page).toContain("ask for erasure");
    expect(page).toContain("restrict processing");
    expect(page).toContain("object to processing");
    expect(page).toContain("portability right");
    expect(page).toContain("withdraw consent");
    expect(page).toContain("within one month");
    expect(page).toContain("Data-protection complaints");
    expect(compactPage).toContain(
      "acknowledge a data-protection complaint within 30 days",
    );
    expect(compactPage).toContain(
      "communicate the outcome without undue delay",
    );
    expect(page).toContain("https://ico.org.uk/make-a-complaint/");
    expect(page).toContain("https://policies.google.com/privacy");
    expect(compactPage).toContain("future-projector permission only");
    expect(compactPage).toContain("no aggregate has been released");
    expect(page).not.toContain("A CC0 aggregate already released");
  });

  it("states the concrete fraud-signal consequences and review path", () => {
    expect(compactPage).toContain(
      "Each unresolved signal at medium, high or critical severity subtracts 20 points",
    );
    expect(compactPage).toContain("per-transaction and daily limits");
    expect(compactPage).toContain("trust-based commission rate");
    expect(compactPage).toContain("stricter escrow or inspection");
    expect(compactPage).toContain("future seller payout");
    expect(compactPage).toContain("auto_action");
    expect(compactPage).toContain("does not directly suspend the account");
    expect(compactPage).toContain("human review");
    expect(compactPage).toContain(
      "There is not yet a durable in-product decision-review case queue",
    );
    expect(compactPage).toContain(
      "a support link alone is not evidence that human intervention is operational",
    );
    expect(compactPage).toContain(
      "The pause does not block payment, shipping, receipt, cancellation, return, dispute, refund, payout, evidence or revocation",
    );
  });

  it("names Cloudflare, the aggregate counts and the feedback door before any of them collects", () => {
    expect(compactPage).toContain("Last updated 10 November 2026");
    expect(page).toContain('id="feedback-door"');
    expect(page).toContain('id="aggregate-counts"');
    expect(page).toContain('href="#feedback-door"');
    expect(page).toContain('href="#aggregate-counts"');
    expect(compactPage).toContain("<strong className=\"text-ink\">Cloudflare</strong>{\" \"}sits in front of cambridgetcg.com");
    expect(page).toContain("https://www.cloudflare.com/privacypolicy/");
    expect(compactPage).toContain("Understand how the site is used, from aggregate counts only");
    expect(compactPage).toContain("Cambridge TCG keeps counts, not records of visits");
    expect(compactPage).toContain(
      "No count holds an IP address (hashed or not), a user agent, query string, referrer, request body or raw path, or a visitor, session, device, account or key identifier",
    );
    expect(compactPage).toContain("counting never changes how a request is answered");
    expect(compactPage).toContain("ship switched off and are switched on only after this notice names them");
    expect(compactPage).toContain("We do not build a visit or behaviour profile of anyone");
    expect(compactPage).toContain("does not create an application-level analytics profile from ordinary page visits");
    // Retention, as the code keeps it.
    expect(compactPage).toContain("35 days; daily error, MCP, job-run and hello counts 13 months");
    expect(compactPage).toContain("180 days after they arrive");
    expect(compactPage).toContain("The hourly cap&apos;s counts are kept 48 hours");
    expect(compactPage).toContain("The minute counts are kept 7 days");
    // The door keeps named fields only, and the key works both ways.
    expect(compactPage).toContain("We do not keep the request as it was sent, your IP address, user agent or cookies");
    expect(compactPage).toContain("feedback-door/2026-11-06");
    expect(compactPage).not.toContain("Agent feedback and carried state:</strong>{\" \"} public write paths are paused");
  });

  it("names the member-key counters and how a class is worked out, and sweeps whatever is switched on", () => {
    expect(compactPage).toContain("<strong className=\"text-ink\">Member data keys:</strong>");
    expect(compactPage).toContain("a count of your account&apos;s accepted requests in each calendar month (UTC)");
    expect(compactPage).toContain("The data API&apos;s monthly counts are currently kept with the account and not deleted earlier");
    expect(compactPage).toContain("the same string arrived from five or more countries in that hour");
    expect(compactPage).toContain("shows those counts only once at least five keys or accounts are counted");
    expect(compactPage).toContain("An hourly sweep deletes older rows whether or not any counter is switched on");
  });

  it("states the retention periods the code enforces", async () => {
    const { OBSERVABILITY_RETENTION } = await import("@/lib/observability/retention");
    const door = await import("@/lib/feedback/door");
    const { PEER_HELLO_RETENTION_MONTHS } = await import("@/lib/peers");
    expect(OBSERVABILITY_RETENTION).toEqual({ hourly: { days: 35 }, daily: { months: 13 } });
    expect(PEER_HELLO_RETENTION_MONTHS).toBe(13);
    expect([door.FEEDBACK_RETENTION_DAYS, door.FEEDBACK_INTAKE_RETENTION_HOURS]).toEqual([180, 48]);
    expect(page).toContain(door.FEEDBACK_NOTICE.version);
    expect(door.FEEDBACK_NOTICE.url).toBe("/privacy#feedback-door");
  });

  it("enumerates first-party cookies, durations and browser-only storage", () => {
    for (const cookie of [
      "authjs.session-token",
      "authjs.csrf-token",
      "authjs.callback-url",
      "display-currency",
      "text-mode",
      "lang-mode",
      "theme",
      "tone",
      "banner-dev-notice",
      "ctcg-guest-id",
    ]) {
      expect(page, cookie).toContain(cookie);
    }
    expect(compactPage).toContain("maximum of 30 days");
    expect(compactPage).toContain(
      "state, nonce and PKCE cookies; all three have a 15-minute maximum",
    );
    expect(compactPage).toContain("for up to one year");

    for (const key of [
      "market.listing-draft.v1",
      "ctcg-deck-builder-decks",
      "ctcg-practice-battle",
      "ctcg-practice-clears",
      "ctcg-practice-starter",
      "account.handle-welcome.v1:*",
      "cambridgetcg_cart",
    ]) {
      expect(page, key).toContain(key);
    }
    expect(compactPage).toContain("does not write to");
    expect(page).toContain("sessionStorage");
    expect(page).toContain("IndexedDB");
    expect(compactPage).toContain("Local storage has no time-based expiry");
    expect(compactPage).toContain(
      "does not automatically receive a listing draft",
    );
  });

  it("lists agent signing keys, what is kept and for how long, and says binding is not open here", () => {
    // 0152's stores, in the wording proposed in held-keys.md's Built section.
    // Applied on 2026-11-10; the path is closed on cambridgetcg.com, so none
    // of this is collected there until it opens.
    expect(compactPage).toContain("Last updated 10 November 2026");
    expect(compactPage).toContain(
      "<strong className=\"text-ink\">Agent signing keys:</strong>{\" \"}when an operator binds an agent&apos;s own signing key on the account agents page, Cambridge TCG keeps its public key and thumbprint, when it was bound, confirmed and set to expire, and how it ended; for each act signed with it, the act as sent, its SHA-256, how it was checked and what it did; and each act&apos;s key and nonce until they are deleted after the act expires, so an act applies once. A usage key that a signed act minted records which act minted it.",
    );
    expect(compactPage).toContain(
      "Binding a signing key is not open on this website yet, so none of this is collected here until it is.",
    );
    expect(compactPage).toContain(
      "<strong className=\"text-ink\">Agent signing keys:</strong>{\" \"}a key never confirmed by a signed act is deleted by an hourly sweep 7 days after it was bound, but only while signed acts are open; the record of its binding keeps its thumbprint. The rest, and the record of each act, stay with the agent and go when the agent or its operator&apos;s account is deleted, except a short receipt of each act (its time, the act, its outcome and its SHA-256), which is kept. An act&apos;s nonce is deleted after the act expires, by a later act or by the hourly sweep, which also runs only while signed acts are open.",
    );
    // Each beside the matching "Agent keys" item.
    const kept = compactPage.indexOf("<strong className=\"text-ink\">Agent keys:</strong>{\" \"}when an operator creates");
    const retained = compactPage.indexOf("<strong className=\"text-ink\">Agent keys:</strong>{\" \"}a key and its last-used time");
    expect(compactPage.indexOf("Agent signing keys:</strong>{\" \"}when an operator binds")).toBeGreaterThan(kept);
    expect(compactPage.indexOf("Agent signing keys:</strong>{\" \"}when an operator binds")).toBeLessThan(retained);
    expect(compactPage.indexOf("Agent signing keys:</strong>{\" \"}a key never confirmed")).toBeGreaterThan(retained);
  });

  it("says an agent key's expiry is kept, and that expiring keeps the record", () => {
    // agent_keys.expires_at (0151) is stored for a key minted with an expiry,
    // and an expired key's row stays, as a revoked key's does.
    expect(compactPage).toContain(
      "when it was created, when it expires (if an expiry was chosen), and when it was revoked and last used",
    );
    expect(compactPage).toContain(
      "revoking a key, or its expiring, keeps the record",
    );
  });

  it("keeps the space after every label in the production build", async () => {
    // Next's production compiler drops the leading space of a JSX text that
    // wraps over lines and holds an entity, so "Agent keys:</strong> when ..."
    // was served as "Agent keys:when ...". Vitest's compiler keeps the space,
    // so this asks the production compiler itself
    // (scripts/jsx-entity-space-audit.mjs). The fix is an explicit {" "}.
    const { findDroppedSpaces } = (await import(
      pathToFileURL(resolve(process.cwd(), "scripts/jsx-entity-space-audit.mjs")).href
    )) as { findDroppedSpaces: (target: string) => Promise<{ hits: unknown[]; unknown: unknown[] }> };
    const found = await findDroppedSpaces(resolve(process.cwd(), "src/app/privacy/page.tsx"));
    expect(found.hits).toEqual([]);
    expect(found.unknown).toEqual([]);
  });
});
