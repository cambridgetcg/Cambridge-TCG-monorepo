import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrismSignalsPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  runtime: vi.fn(),
  stripePosture: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prism-signals/beta-interest-config.server", () => ({
  prismSignalsBetaIntakeEnabled: mocks.enabled,
}));
vi.mock("@/lib/prism-signals/runtime.server", () => ({
  prismSignalsRuntime: mocks.runtime,
}));
vi.mock("@/lib/prism-signals/stripe/config.server", () => ({
  prismStripeSandboxPublicPosture: mocks.stripePosture,
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
  mocks.stripePosture.mockReturnValue({
    configured: false,
    processing_available: false,
    checkout_available: false,
    reason: "not_configured",
  });
});

describe("PRISM landing closed-beta posture", () => {
  it("publishes honest Free and All sandbox plan copy without a direct checkout claim", () => {
    const markup = renderToStaticMarkup(<PrismSignalsPage />);

    expect(markup).toContain("Free + All · test catalogue");
    expect(markup).toContain("£0");
    expect(markup).toContain("£5");
    expect(markup).toContain("/ month");
    expect(markup).toContain("Sandbox only");
    expect(markup).toContain("not a live price");
    expect(markup).toContain("not a real charge");
    expect(markup).toContain('href="/prism-signals/account"');
    expect(markup).toContain("Check sandbox availability");
    expect(markup).toContain("paused or not configured");
    expect(markup).not.toContain('href="/api/prism-signals/stripe/checkout"');
  });

  it("reflects only the host-provided public sandbox posture and still avoids GET checkout", () => {
    mocks.stripePosture.mockReturnValue({
      configured: true,
      processing_available: true,
      checkout_available: true,
      reason: "available",
    });
    const markup = renderToStaticMarkup(<PrismSignalsPage />);

    expect(markup).toContain("Open All sandbox account");
    expect(markup).toContain("host reports that sandbox intake is available");
    expect(markup).toContain("never creates Checkout directly");
    expect(markup).toContain('href="/prism-signals/account"');
    expect(markup).not.toContain('href="/api/prism-signals/stripe/checkout"');
  });

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
