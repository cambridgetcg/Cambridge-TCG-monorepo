import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("script policy", () => {
  it("lets pages run scripts from this site only, so an injected analytics tag is refused", async () => {
    const rules = await nextConfig.headers!();
    const policy = rules
      .find((rule) => rule.source === "/:path*")!
      .headers.find((header) => header.key === "Content-Security-Policy")!.value;
    expect(policy).toBe("script-src 'self' 'unsafe-inline'");
  });
});
