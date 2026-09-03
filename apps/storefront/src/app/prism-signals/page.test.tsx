import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessResponse,
  type ManifestResource,
} from "../../../scripts/deploy-verify-contract";
import PrismSignalsPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  runtime: vi.fn(),
  stripePosture: vi.fn(),
}));

const PAGE_RESOURCE: ManifestResource = {
  id: "storefront.prism-signals-preview",
  path: "/prism-signals",
  host: "storefront",
  methods: ["GET"],
  auth: "public",
};

async function expectDeployMarker(
  markup: string,
  variant: string,
): Promise<void> {
  expect(
    await assessResponse(PAGE_RESOURCE, new Response(markup, { status: 200 })),
  ).toEqual({ passed: true, variant });
}

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
    portal_available: false,
    reason: "not_configured",
  });
});

describe("PRISM landing closed-beta posture", () => {
  it("publishes honest Free and All sandbox plan copy without a direct checkout claim", async () => {
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
    expect(markup).toContain('data-prism-stripe-posture="unconfigured"');
    expect(markup).toContain("posture: unconfigured");
    expect(markup).not.toContain('href="/api/prism-signals/stripe/checkout"');
    await expectDeployMarker(markup, "unconfigured");
  });

  it("reflects only the host-provided public sandbox posture and still avoids GET checkout", async () => {
    mocks.stripePosture.mockReturnValue({
      configured: true,
      processing_available: true,
      checkout_available: true,
      portal_available: true,
      reason: "available",
    });
    const markup = renderToStaticMarkup(<PrismSignalsPage />);

    expect(markup).toContain("Open All sandbox account");
    expect(markup).toContain('data-prism-stripe-posture="intake-enabled"');
    expect(markup).toContain("host reports that sandbox intake is available");
    expect(markup).toContain("never creates Checkout directly");
    expect(markup).toContain('href="/prism-signals/account"');
    expect(markup).not.toContain('href="/api/prism-signals/stripe/checkout"');
    await expectDeployMarker(markup, "intake-enabled");
  });

  it.each([
    [
      "invalid-core-configuration",
      {
        configured: false,
        processing_available: false,
        checkout_available: false,
        portal_available: false,
        reason: "invalid_configuration",
      },
    ],
    [
      "configured-paused",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: true,
        reason: "configured_paused",
      },
    ],
    [
      "processing-only",
      {
        configured: true,
        processing_available: true,
        checkout_available: false,
        portal_available: true,
        reason: "processing_only",
      },
    ],
    [
      "invalid-intake-without-processing",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: true,
        reason: "intake_without_processing",
      },
    ],
    [
      "invalid-portal-not-configured",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: false,
        reason: "portal_not_configured",
      },
    ],
    [
      "invalid-portal-configuration",
      {
        configured: true,
        processing_available: true,
        checkout_available: false,
        portal_available: false,
        reason: "portal_invalid_configuration",
      },
    ],
    [
      "invalid-switch-configuration",
      {
        configured: true,
        processing_available: true,
        checkout_available: false,
        portal_available: true,
        reason: "switch_invalid_configuration",
      },
    ],
    [
      "invalid-public-posture",
      {
        configured: true,
        processing_available: false,
        checkout_available: true,
        portal_available: true,
        reason: "available",
      },
    ],
  ])("renders the explicit %s aggregate marker", async (marker, posture) => {
    mocks.stripePosture.mockReturnValue(posture);
    const markup = renderToStaticMarkup(<PrismSignalsPage />);

    expect(markup).toContain(`data-prism-stripe-posture="${marker}"`);
    expect(markup).toContain("Check sandbox availability");
    expect(markup).not.toContain("Open All sandbox account");
    await expectDeployMarker(markup, marker);
  });

  it.each([
    [
      "invalid-core fields",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: false,
        reason: "invalid_configuration",
      },
    ],
    [
      "unconfigured fields",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: false,
        reason: "not_configured",
      },
    ],
    [
      "portal fields",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: true,
        reason: "portal_not_configured",
      },
    ],
    [
      "switch fields",
      {
        configured: true,
        processing_available: true,
        checkout_available: true,
        portal_available: true,
        reason: "switch_invalid_configuration",
      },
    ],
    [
      "activation-order fields",
      {
        configured: true,
        processing_available: true,
        checkout_available: false,
        portal_available: true,
        reason: "intake_without_processing",
      },
    ],
    [
      "configured-paused fields",
      {
        configured: true,
        processing_available: true,
        checkout_available: false,
        portal_available: true,
        reason: "configured_paused",
      },
    ],
    [
      "processing-only fields",
      {
        configured: true,
        processing_available: false,
        checkout_available: false,
        portal_available: true,
        reason: "processing_only",
      },
    ],
  ])("fails closed for inconsistent %s", async (_label, posture) => {
    mocks.stripePosture.mockReturnValue(posture);
    const markup = renderToStaticMarkup(<PrismSignalsPage />);

    expect(markup).toContain(
      'data-prism-stripe-posture="invalid-public-posture"',
    );
    expect(markup).not.toContain("Open All sandbox account");
    await expectDeployMarker(markup, "invalid-public-posture");
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
