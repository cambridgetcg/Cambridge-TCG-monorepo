import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  emailSettings: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  klaviyoAutomationSettings: {
    findUnique: vi.fn(),
  },
  klaviyoProfile: {
    count: vi.fn(),
  },
  klaviyoEvent: {
    count: vi.fn(),
  },
}));

const klaviyo = vi.hoisted(() => ({
  constructedWith: [] as string[],
  validateApiKey: vi.fn(),
  getLists: vi.fn(),
}));

vi.mock("~/shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({ session: { shop: "test-shop.myshopify.com" } })),
  },
}));

vi.mock("~/db.server", () => ({ default: prisma }));

vi.mock("~/services/klaviyo.server", () => ({
  KlaviyoService: class {
    constructor({ apiKey }: { apiKey: string }) {
      klaviyo.constructedWith.push(apiKey);
    }
    validateApiKey = klaviyo.validateApiKey;
    getLists = klaviyo.getLists;
  },
}));

vi.mock("~/services/klaviyo-oauth.server", () => ({
  isOAuthConfigured: () => false,
  disconnectKlaviyoOAuth: vi.fn(),
}));

import { action, loader } from "~/routes/app.marketing.klaviyo";
import { decryptSecret, encryptSecret } from "~/utils/encryption.server";

const SHOP = "test-shop.myshopify.com";
const PRIVATE_KEY = "pk_example_private_key";

function storedSettings(klaviyoApiKey: string | null) {
  return {
    emailProvider: "KLAVIYO",
    klaviyoEnabled: true,
    klaviyoApiKey,
    klaviyoPublicKey: "AbC123",
    klaviyoDefaultListId: null,
    klaviyoSyncProfiles: true,
    klaviyoSyncEvents: true,
    klaviyoLastSyncAt: null,
    klaviyoSyncStatus: null,
    klaviyoOAuthConnected: false,
  };
}

function saveRequest(fields: Record<string, string>) {
  const body = new FormData();
  body.set("intent", "saveConnection");
  body.set("emailProvider", "KLAVIYO");
  body.set("klaviyoPublicKey", "AbC123");
  body.set("klaviyoDefaultListId", "");
  body.set("klaviyoSyncProfiles", "true");
  body.set("klaviyoSyncEvents", "true");
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request("https://app.test/app/marketing/klaviyo", { method: "POST", body });
}

async function runLoader() {
  const response = await loader({
    request: new Request("https://app.test/app/marketing/klaviyo"),
    params: {},
    context: {},
  });
  return { text: await response.clone().text(), data: await response.json() };
}

async function runAction(request: Request) {
  const response = await action({ request, params: {}, context: {} });
  return { status: response.status, data: await response.json() };
}

describe("Klaviyo settings route", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_SECRET", "test-encryption-secret");
    vi.stubEnv("ENCRYPTION_SALT", "cd".repeat(32));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    klaviyo.constructedWith.length = 0;
    klaviyo.validateApiKey.mockResolvedValue(true);
    klaviyo.getLists.mockResolvedValue([{ id: "list-1", name: "Newsletter" }]);
    prisma.klaviyoAutomationSettings.findUnique.mockResolvedValue(null);
    prisma.klaviyoProfile.count.mockResolvedValue(0);
    prisma.klaviyoEvent.count.mockResolvedValue(0);
    prisma.emailSettings.upsert.mockResolvedValue({});
    prisma.emailSettings.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("loader", () => {
    it("never sends the saved private key, or its ciphertext, to the browser", async () => {
      const stored = encryptSecret(PRIVATE_KEY);
      prisma.emailSettings.findUnique.mockResolvedValue(storedSettings(stored));

      const { text, data } = await runLoader();

      expect(text).not.toContain(PRIVATE_KEY);
      expect(text).not.toContain(stored);
      expect(data.emailSettings).not.toHaveProperty("klaviyoApiKey");
      expect(data.emailSettings.hasKlaviyoApiKey).toBe(true);
      expect(klaviyo.constructedWith).toEqual([PRIVATE_KEY]);
      expect(data.klaviyoLists).toEqual([{ id: "list-1", name: "Newsletter" }]);
    });

    it("treats a legacy plaintext key as not saved and never uses it", async () => {
      prisma.emailSettings.findUnique.mockResolvedValue(storedSettings(PRIVATE_KEY));

      const { text, data } = await runLoader();

      expect(text).not.toContain(PRIVATE_KEY);
      expect(data.emailSettings.hasKlaviyoApiKey).toBe(false);
      expect(klaviyo.constructedWith).toEqual([]);
    });
  });

  describe("saveConnection", () => {
    it("checks a new key with Klaviyo, then stores it encrypted", async () => {
      const { status, data } = await runAction(saveRequest({ klaviyoApiKey: PRIVATE_KEY }));

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(klaviyo.constructedWith).toEqual([PRIVATE_KEY]);

      const { create, update } = prisma.emailSettings.upsert.mock.calls[0][0];
      expect(create.klaviyoApiKey).not.toBe(PRIVATE_KEY);
      expect(update.klaviyoApiKey).not.toBe(PRIVATE_KEY);
      expect(decryptSecret(create.klaviyoApiKey)).toBe(PRIVATE_KEY);
      expect(decryptSecret(update.klaviyoApiKey)).toBe(PRIVATE_KEY);
    });

    it("keeps the saved key when the key field is left blank", async () => {
      const { data } = await runAction(saveRequest({ klaviyoApiKey: "" }));

      expect(data.success).toBe(true);
      expect(klaviyo.validateApiKey).not.toHaveBeenCalled();

      const { where, create, update } = prisma.emailSettings.upsert.mock.calls[0][0];
      expect(where).toEqual({ shop: SHOP });
      expect(update).not.toHaveProperty("klaviyoApiKey");
      expect(create.klaviyoApiKey).toBeNull();
      expect(update.klaviyoPublicKey).toBe("AbC123");
    });

    it("saves nothing when the key can't be encrypted", async () => {
      vi.stubEnv("ENCRYPTION_SECRET", "");

      const { status, data } = await runAction(saveRequest({ klaviyoApiKey: PRIVATE_KEY }));

      expect(status).toBe(500);
      expect(data.success).toBe(false);
      expect(JSON.stringify(data)).not.toContain(PRIVATE_KEY);
      expect(prisma.emailSettings.upsert).not.toHaveBeenCalled();
    });
  });

  it("removes the saved key on request", async () => {
    const body = new FormData();
    body.set("intent", "removeApiKey");

    const { data } = await runAction(
      new Request("https://app.test/app/marketing/klaviyo", { method: "POST", body }),
    );

    expect(data.success).toBe(true);
    expect(prisma.emailSettings.update).toHaveBeenCalledWith({
      where: { shop: SHOP },
      data: { klaviyoApiKey: null },
    });
  });
});
