/**
 * Encryption utilities for storing secrets at rest.
 *
 * Uses AES-256-GCM with a key derived from the EMAIL_ENCRYPTION_KEY env var.
 * Falls back to plaintext if no encryption key is configured (dev environments).
 *
 * Format: "enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 */

import * as crypto from "crypto";

const ENCRYPTION_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended IV length
const KEY_LENGTH = 32; // AES-256

/**
 * Derive a 256-bit key from the environment variable using SHA-256.
 */
function getEncryptionKey(): Buffer | null {
  const envKey = process.env.EMAIL_ENCRYPTION_KEY;
  if (!envKey) {
    return null;
  }
  return crypto.createHash("sha256").update(envKey).digest();
}

/**
 * Encrypt a plaintext secret for storage.
 * Returns the encrypted string in the format "enc:v1:<iv>:<tag>:<ciphertext>".
 * If no encryption key is configured, returns plaintext (for dev environments).
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    // No encryption key configured — store plaintext (dev only)
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${ENCRYPTION_PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a stored secret.
 * If the value doesn't have the encryption prefix, returns it as-is (plaintext/legacy).
 */
export function decryptSecret(stored: string): string {
  // Not encrypted — return as-is (legacy or dev)
  if (!stored.startsWith(ENCRYPTION_PREFIX)) {
    return stored;
  }

  const key = getEncryptionKey();
  if (!key) {
    console.warn("[Encryption] Encrypted value found but EMAIL_ENCRYPTION_KEY is not set. Cannot decrypt.");
    return "";
  }

  const payload = stored.slice(ENCRYPTION_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    console.error("[Encryption] Malformed encrypted value");
    return "";
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[Encryption] Decryption failed:", error);
    return "";
  }
}
