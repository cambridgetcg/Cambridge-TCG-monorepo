import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  emailSettings: { findUnique: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: prisma }));

import { shouldUseKlaviyoForMarketing } from "~/services/email-provider.server";
import { isKlaviyoEnabled } from "~/services/klaviyo.server";
import { encryptSecret } from "~/utils/encryption.server";

const SHOP = "test-shop.myshopify.com";
const PRIVATE_KEY = "pk_example_private_key";

function settings(klaviyoApiKey: string | null) {
  return {
    emailProvider: "KLAVIYO",
    klaviyoEnabled: true,
    klaviyoApiKey,
    klaviyoOAuthConnected: false,
  };
}

// The Klaviyo page shows a key it can't read as "Not Connected"; these
// server checks must agree, or campaigns are refused for a dead connection.
describe("Klaviyo key checks", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_SECRET", "test-encryption-secret");
    vi.stubEnv("ENCRYPTION_SALT", "ab".repeat(32));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("count a saved key that can be read", async () => {
    prisma.emailSettings.findUnique.mockResolvedValue(settings(encryptSecret(PRIVATE_KEY)));

    expect(await isKlaviyoEnabled(SHOP)).toBe(true);
    expect(await shouldUseKlaviyoForMarketing(SHOP)).toBe(true);
  });

  it("don't count a legacy plaintext key", async () => {
    prisma.emailSettings.findUnique.mockResolvedValue(settings(PRIVATE_KEY));

    expect(await isKlaviyoEnabled(SHOP)).toBe(false);
    expect(await shouldUseKlaviyoForMarketing(SHOP)).toBe(false);
  });

  it("don't count a key that can't be read after the encryption secret changes", async () => {
    const stored = encryptSecret(PRIVATE_KEY);
    vi.stubEnv("ENCRYPTION_SECRET", "a-different-secret");
    prisma.emailSettings.findUnique.mockResolvedValue(settings(stored));

    expect(await isKlaviyoEnabled(SHOP)).toBe(false);
    expect(await shouldUseKlaviyoForMarketing(SHOP)).toBe(false);
  });

  it("still count an OAuth connection with no saved key", async () => {
    prisma.emailSettings.findUnique.mockResolvedValue({
      ...settings(null),
      klaviyoOAuthConnected: true,
    });

    expect(await isKlaviyoEnabled(SHOP)).toBe(true);
  });
});
