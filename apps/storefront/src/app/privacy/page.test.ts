import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

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
});
