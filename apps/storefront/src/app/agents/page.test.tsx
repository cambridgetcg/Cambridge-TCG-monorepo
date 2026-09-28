import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgentsWelcomePage from "./page";

describe("agent entry", () => {
  it("starts with public reads and keeps optional culture outside the initial workflow", () => {
    const markup = renderToStaticMarkup(<AgentsWelcomePage />);
    const start = markup.slice(markup.indexOf('aria-labelledby="agent-start"'), markup.indexOf('aria-labelledby="agent-access"'));
    for (const href of ["/api/v1/manifest", "/agents/guides/first-request", "/api/openapi.json"]) {
      expect(start).toContain(`href="${href}"`);
    }
    expect(markup).toContain("Public discovery needs no account or identity declaration.");
    expect(markup).not.toMatch(/<form\b|href="\/api\/v1\/identify"|href="\/api\/v1\/agents\/register"/);
    expect(markup).toMatch(/<details[^>]*><summary[^>]*>Optional culture and invitations/);
    expect(start).not.toContain("/welcome-all");
  });

  it("names publication, credential scope and retired-commerce boundaries", () => {
    const markup = renderToStaticMarkup(<AgentsWelcomePage />);
    expect(markup).toContain("Bulk catalogue publication is paused.");
    expect(markup).toContain("absence of a license is not permission");
    expect(markup).toContain("other calls require a scoped bearer key");
    expect(markup).toContain("Agent match and deck writes, self-serve registration and global agent rating publication are paused.");
    expect(markup).toContain("New paid commerce is retired.");
    expect(markup).toContain("Authenticated reads may update rate-limit and key-usage records.");
    expect(markup).not.toContain('href="/market/list"');
  });
});
