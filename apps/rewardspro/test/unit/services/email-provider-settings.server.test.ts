import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  emailSettings: { update: vi.fn() },
}));

vi.mock("~/db.server", () => ({ default: prisma }));

import { updateEmailProviderSettings } from "~/services/email-provider.server";
import { decryptSecret } from "~/utils/encryption.server";

const PRIVATE_KEY = "pk_example_private_key";

describe("updateEmailProviderSettings", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_SECRET", "test-encryption-secret");
    vi.stubEnv("ENCRYPTION_SALT", "ef".repeat(32));
    prisma.emailSettings.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores a Klaviyo private key encrypted, never as plaintext", async () => {
    await updateEmailProviderSettings("test-shop.myshopify.com", {
      klaviyoEnabled: true,
      klaviyoApiKey: PRIVATE_KEY,
    });

    const { data } = prisma.emailSettings.update.mock.calls[0][0];
    expect(data.klaviyoEnabled).toBe(true);
    expect(data.klaviyoApiKey).not.toBe(PRIVATE_KEY);
    expect(decryptSecret(data.klaviyoApiKey)).toBe(PRIVATE_KEY);
  });

  it("leaves the stored key alone when no key is passed", async () => {
    await updateEmailProviderSettings("test-shop.myshopify.com", { klaviyoSyncEvents: false });

    const { data } = prisma.emailSettings.update.mock.calls[0][0];
    expect(data).toEqual({ klaviyoSyncEvents: false });
  });
});
