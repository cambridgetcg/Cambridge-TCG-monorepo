import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrismSignalsPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prism-signals/beta-interest-config.server", () => ({
  prismSignalsBetaIntakeEnabled: mocks.enabled,
}));
vi.mock("@/lib/prism-signals/runtime.server", () => ({
  prismSignalsRuntime: mocks.runtime,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(false);
  mocks.runtime.mockReturnValue({
    offer: {
      id: "prism-signals",
      version: 1,
      environment: "test",
      status: "preview",
    },
    telegram_href: null,
  });
});

describe("PRISM landing closed-beta posture", () => {
  it("hides intake claims while retaining a non-intake management door", () => {
    const markup = renderToStaticMarkup(<PrismSignalsPage />);
    const metadata = generateMetadata();

    expect(markup).toContain('href="/prism-signals/beta"');
    expect(markup).toContain("Manage an existing beta request");
    expect(markup).not.toContain("Closed beta");
    expect(markup).not.toContain("Request closed-beta consideration");
    expect(markup).not.toContain("Ask to hear about a possible private test");
    expect(metadata.title).toBe(
      "PRISM Signals by Cambridge TCG — synthetic preview",
    );
    expect(metadata.description).not.toContain("closed-beta");
  });

  it("shows the bounded beta door and metadata only under the exact enabled posture", () => {
    mocks.enabled.mockReturnValue(true);
    const markup = renderToStaticMarkup(<PrismSignalsPage />);
    const metadata = generateMetadata();

    expect(markup).toContain('href="/prism-signals/beta"');
    expect(markup).toContain("Request closed-beta consideration");
    expect(markup).toContain("Closed beta · interest only");
    expect(metadata.title).toContain("closed beta");
    expect(metadata.description).toContain("closed-beta interest request");
  });
});
