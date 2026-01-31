import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits for GCM tag
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment variable (base64 encoded)
 */
function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (base64 encoded)`);
  }
  
  return key;
}

/**
 * Encrypt data using AES-256-GCM
 * Returns base64 string of (iv + tag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);
  
  const tag = cipher.getAuthTag();
  
  // Combine: iv (12 bytes) + tag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, tag, ciphertext]);
  
  return combined.toString('base64');
}

/**
 * Decrypt data using AES-256-GCM
 * Expects base64 string of (iv + tag + ciphertext)
 */
export function decrypt(ciphertextBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(ciphertextBase64, 'base64');
  
  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid ciphertext format');
  }
  
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);
  
  return plaintext.toString('utf8');
}

/**
 * Generate SHA-256 hash (for idempotency keys)
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

