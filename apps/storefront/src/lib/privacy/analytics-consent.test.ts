import { describe, expect, it } from "vitest";

import {
  accessibleGoogleAnalyticsCookieNames,
  googleAnalyticsCookieDeletionWrites,
  readAnalyticsConsent,
} from "./analytics-consent";

describe("analytics consent cookies", () => {
  it("reads only a valid exact consent cookie", () => {
    expect(readAnalyticsConsent("theme=dark; analytics-consent=granted")).toBe("granted");
    expect(readAnalyticsConsent("analytics-consent=denied; theme=dark")).toBe("denied");
    expect(readAnalyticsConsent("not-analytics-consent=granted")).toBeNull();
    expect(readAnalyticsConsent("analytics-consent=maybe")).toBeNull();
  });

  it("selects `_ga` cookies without touching unrelated cookies", () => {
    expect(
      accessibleGoogleAnalyticsCookieNames(
        "session=keep; _ga=GA1.1.1; _ga_ABC=GS1.1.2; _gat=keep; _ga=duplicate",
      ),
    ).toEqual(["_ga", "_ga_ABC"]);
  });

  it("expires visible analytics cookies on the host and parent domains", () => {
    const writes = googleAnalyticsCookieDeletionWrites(
      "session=keep; _ga=GA1.1.1; _ga_ABC=GS1.1.2",
      "www.cambridgetcg.com",
    );

    expect(writes).toContainEqual(expect.stringContaining("_ga=; Max-Age=0"));
    expect(writes).toContainEqual(expect.stringContaining("Domain=.cambridgetcg.com"));
    expect(writes).toContainEqual(expect.stringContaining("_ga_ABC=; Max-Age=0"));
    expect(writes.join("\n")).not.toContain("session");
    expect(writes.join("\n")).not.toContain("GA1.1.1");
  });
});
