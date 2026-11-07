import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "~/shopify/encryption.server";

// apps/rewardspro's stored-token format, written out independently so a
// change to the carried module that would strand the tokens both apps share
// (ENCRYPTION_SECRET + ENCRYPTION_SALT) fails here:
// base64(salt 64 | iv 16 | tag 16 | ciphertext), AES-256-GCM, with the key
// PBKDF2-SHA256(master key, salt, 100000, 32) and the master key
// PBKDF2-SHA256(ENCRYPTION_SECRET, hex ENCRYPTION_SALT, 100000, 32).
const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 64;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// The test secret and salt from test/setup.ts.
const SECRET = "test-encryption-secret";
const SALT_HEX = "00112233445566778899aabbccddeeff";

function masterKey(): Buffer {
  return crypto.pbkdf2Sync(SECRET, Buffer.from(SALT_HEX, "hex"), ITERATIONS, KEY_LENGTH, "sha256");
}

function oldAppDecrypt(stored: string): string {
  const combined = Buffer.from(stored, "base64");
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = crypto.pbkdf2Sync(masterKey(), salt, ITERATIONS, KEY_LENGTH, "sha256");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function oldAppEncrypt(text: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(masterKey(), salt, ITERATIONS, KEY_LENGTH, "sha256");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

describe("token encryption", () => {
  it("runs on the test secret and salt", () => {
    expect(process.env.ENCRYPTION_SECRET).toBe(SECRET);
    expect(process.env.ENCRYPTION_SALT).toBe(SALT_HEX);
  });

  it("writes what apps/rewardspro's algorithm reads back", () => {
    const token = "shpat_integration_test_token";
    const stored = encrypt(token);

    expect(stored).not.toContain(token);
    expect(Buffer.from(stored, "base64").length).toBe(SALT_LENGTH + IV_LENGTH + TAG_LENGTH + Buffer.byteLength(token));
    expect(oldAppDecrypt(stored)).toBe(token);
  });

  it("reads what apps/rewardspro's algorithm wrote", () => {
    const token = "a stored token, with ünïcode";
    expect(decrypt(oldAppEncrypt(token))).toBe(token);
  });
});
