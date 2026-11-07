import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "~/utils/encryption.server";

const KLAVIYO_KEY = "pk_example_private_key_123";

describe("encryptSecret / decryptSecret", () => {
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

  it("stores the key encrypted with the app's encryption key and reads it back", () => {
    const stored = encryptSecret(KLAVIYO_KEY);

    expect(stored.startsWith("enc:v2:")).toBe(true);
    expect(stored).not.toContain(KLAVIYO_KEY);
    expect(decryptSecret(stored)).toBe(KLAVIYO_KEY);
  });

  it("refuses to store anything when encryption is not configured", () => {
    vi.stubEnv("ENCRYPTION_SECRET", "");

    expect(() => encryptSecret(KLAVIYO_KEY)).toThrow();
  });

  it("does not hand back a legacy plaintext value", () => {
    expect(decryptSecret(KLAVIYO_KEY)).toBeNull();
  });

  it("does not hand back a value written with the old EMAIL_ENCRYPTION_KEY format", () => {
    expect(decryptSecret("enc:v1:00112233445566778899aabb:00:00")).toBeNull();
  });

  it("returns null for a tampered value", () => {
    const stored = encryptSecret(KLAVIYO_KEY);
    const tampered = `${stored.slice(0, -4)}AAAA`;

    expect(decryptSecret(tampered)).toBeNull();
  });

  it("returns null when the encryption key is missing at read time", () => {
    const stored = encryptSecret(KLAVIYO_KEY);
    vi.stubEnv("ENCRYPTION_SECRET", "");

    expect(decryptSecret(stored)).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });

  it("never writes the secret to the console", () => {
    decryptSecret(KLAVIYO_KEY);
    decryptSecret(`enc:v2:${Buffer.from(KLAVIYO_KEY).toString("base64")}`);

    const logged = JSON.stringify([
      ...vi.mocked(console.warn).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain(KLAVIYO_KEY);
  });
});
