/**
 * Encryption utilities for secure token storage
 * 
 * Uses AES-256-GCM for encryption with authenticated encryption
 * Provides encryption and decryption for sensitive data like access tokens
 */

import crypto from 'node:crypto';

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // 512 bits
const TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // PBKDF2 iterations

// Master key cache: PBKDF2 at 100k iterations is deliberately slow, so the
// master key is derived once per (secret, salt) pair instead of on every call.
let cachedMasterKey: { secret: string; salt: string; key: Buffer } | null = null;

/**
 * Derive the master key from ENCRYPTION_SECRET and ENCRYPTION_SALT.
 *
 * SECURITY: ENCRYPTION_SECRET is a dedicated key. There is deliberately no
 * fallback to SHOPIFY_API_SECRET, so rotating the Shopify client secret can
 * never make stored tokens unreadable, and a missing key fails closed.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET environment variable is required. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  // SECURITY: Require explicit salt configuration - no hardcoded fallback
  const saltHex = process.env.ENCRYPTION_SALT;
  if (!saltHex) {
    throw new Error(
      'ENCRYPTION_SALT environment variable is required. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  if (cachedMasterKey?.secret !== secret || cachedMasterKey.salt !== saltHex) {
    const key = crypto.pbkdf2Sync(secret, Buffer.from(saltHex, 'hex'), ITERATIONS, KEY_LENGTH, 'sha256');
    cachedMasterKey = { secret, salt: saltHex, key };
  }
  return cachedMasterKey.key;
}

/**
 * Throw a clear error unless ENCRYPTION_SECRET and ENCRYPTION_SALT are set.
 * Call at startup from anything that must not run without encryption.
 */
export function assertEncryptionConfigured(): void {
  getEncryptionKey();
}

/**
 * Encrypt sensitive data
 * 
 * @param text - The plain text to encrypt
 * @returns Encrypted data as base64 string with format: salt.iv.authTag.encrypted
 */
export function encrypt(text: string): string {
  try {
    // Generate random salt and IV for this encryption
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from master key and salt
    const key = crypto.pbkdf2Sync(
      getEncryptionKey(),
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the text
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine salt, iv, authTag, and encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      encrypted
    ]);
    
    // Return as base64 string
    return combined.toString('base64');
  } catch (error) {
    console.error('[Encryption] Error encrypting data:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * 
 * @param encryptedData - The encrypted data as base64 string
 * @returns Decrypted plain text
 */
export function decrypt(encryptedData: string): string {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from master key and salt
    const key = crypto.pbkdf2Sync(
      getEncryptionKey(),
      salt,
      ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[Encryption] Error decrypting data:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash a value using SHA-256
 * Useful for creating deterministic identifiers
 * 
 * @param value - The value to hash
 * @returns SHA-256 hash as hex string
 */
export function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Compare two values in constant time to prevent timing attacks
 * 
 * @param a - First value
 * @param b - Second value
 * @returns True if values are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );
}

/**
 * Generate a cryptographically secure random token
 * 
 * @param length - Length of the token in bytes (default 32)
 * @returns Random token as hex string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate that encryption is properly configured
 * Call this during app initialization
 */
export function validateEncryptionConfig(): boolean {
  try {
    const testData = 'test-encryption-validation';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    
    if (decrypted !== testData) {
      throw new Error('Encryption validation failed: decrypted data does not match original');
    }
    
    console.log('[Encryption] Configuration validated successfully');
    return true;
  } catch (error) {
    console.error('[Encryption] Configuration validation failed:', error);
    return false;
  }
}