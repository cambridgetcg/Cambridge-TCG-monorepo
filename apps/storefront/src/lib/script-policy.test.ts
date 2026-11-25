import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { REPOSITORY_URL } from "./repository";

describe("script policy", () => {
  it("lets pages run scripts from this site only, so an injected analytics tag is refused", async () => {
    const rules = await nextConfig.headers!();
    const policy = rules
      .find((rule) => rule.source === "/:path*")!
      .headers.find((header) => header.key === "Content-Security-Policy")!.value;
    expect(policy).toBe("script-src 'self' 'unsafe-inline'");
  });
});

describe("the document redirect", () => {
  it("sends a named document to the public repository, and nothing else", async () => {
    const rule = (await nextConfig.redirects!()).find((entry) => entry.source.startsWith("/docs/"))!;
    expect(rule).toEqual({
      source: "/docs/:path((?:connections|principles)/[^/]+\\.md)",
      destination: `${REPOSITORY_URL}/blob/main/docs/:path`,
      permanent: false,
    });
    const path = new RegExp(`^/docs/${rule.source.slice("/docs/:path(".length, -1)}$`);
    expect(path.test("/docs/connections/the-ax.md")).toBe(true);
    for (const other of ["/docs/infra/aws-resources.md", "/docs/connections/a/b.md", "/docs/connections/../infra/x.md", "/docs/connections/the-ax.mdx", "/docs/connections/"]) expect(path.test(other)).toBe(false);
  });
});
