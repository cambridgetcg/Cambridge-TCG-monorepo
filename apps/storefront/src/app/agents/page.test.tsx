import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgentsWelcomePage from "./page";

describe("agent entry", () => {
  it("starts with public discovery and keeps optional culture outside the three data layers", () => {
    const markup = renderToStaticMarkup(<AgentsWelcomePage />);
    const start = markup.slice(markup.indexOf('aria-labelledby="agent-start"'), markup.indexOf('aria-labelledby="agent-access"'));
    for (const href of ["/api/v1/manifest", "/api/openapi.json", "/api/v1/contracts/card-data", "/standards/card-data"]) {
      expect(start).toContain(`href="${href}"`);
    }
    expect(start).toContain("Discover</h2>");
    expect(start).toContain("curl https://cambridgetcg.com/api/v1/manifest");
    expect(markup).toContain("Public discovery needs no account or identity declaration.");
    expect(markup).not.toMatch(/<form\b|href="\/api\/v1\/identify"|href="\/api\/v1\/agents\/register"/);
    expect(markup).toMatch(/<details[^>]*><summary[^>]*>Optional culture and invitations/);
    expect(markup.indexOf("Optional culture and invitations")).toBeGreaterThan(markup.indexOf('aria-labelledby="agent-build"'));
    expect(start).not.toContain("/welcome-all");
    expect(start).not.toContain("/agents/guides/first-request");
  });

  it("separates public identity lookup, member data and scoped agent access", () => {
    const markup = renderToStaticMarkup(<AgentsWelcomePage />);
    const read = markup.slice(markup.indexOf('aria-labelledby="agent-access"'), markup.indexOf('aria-labelledby="agent-build"'));
    expect(read).toContain("Read</h2>");
    expect(read).toContain("Public lookup · no key");
    expect(read).toContain("POST /api/v1/cards/batch");
    expect(read).toContain("exclude prices and images");
    expect(read).toContain("Member data · existing account");
    expect(read).toContain("/api/v1/member-prices");
    expect(read).toContain("agent keys and session cookies do not authenticate that feed");
    expect(read).toContain("Availability depends on imported data and source permissions.");
    expect(read).toContain("Operational calls use an agent key");
    expect(read).toContain("Member keys do not grant agent access.");
    for (const href of ["/account/data", "/account/agents", "/methodology/member-pricing", "/methodology/agents"]) {
      expect(read).toContain(`href="${href}"`);
    }
  });

  it("keeps publication and transport limits inspectable", () => {
    const markup = renderToStaticMarkup(<AgentsWelcomePage />);
    expect(markup).toContain("Bulk catalogue publication is paused.");
    expect(markup).toContain("without catalogue rows or prices");
    expect(markup).toContain("Agent match and deck writes, self-serve registration and global agent rating publication are paused.");
    expect(markup).toContain("New paid commerce is retired.");
    expect(markup).toContain("Authenticated reads may update rate-limit and key-usage records.");
    expect(markup).toContain("custom JSON-RPC over HTTP");
    expect(markup).toContain("stdio bridge is not publicly distributed yet");
    expect(markup).not.toContain('href="/market/list"');
  });

  it("links contribution and validation work without promising releases or automatic writes", () => {
    const markup = renderToStaticMarkup(<AgentsWelcomePage />);
    const build = markup.slice(markup.indexOf('aria-labelledby="agent-build"'));
    for (const href of ["/roadmap", "/standards/validator", "/agents/guides", "/standards", "/agents/guides/transparent-data-playbook"]) {
      expect(build).toContain(`href="${href}"`);
    }
    expect(build).toContain("Contributions are proposals for review");
    expect(build).toContain("do not automatically change catalogue records or publish prices");
    expect(build).toContain("Source-code release is pending: the repository is currently private");
    expect(build).toContain("Public package releases and a standalone conformance suite remain roadmap work");
    expect(markup).not.toContain("npx ");
  });
});
