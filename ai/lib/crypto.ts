// --- Provider Key Encryption ---
// AES-256-CBC encryption for AI provider API keys stored in the DB.
// A single Encore secret (ProviderKeyEncryptionSecret) is the only key needed.
//
// Generate with: openssl rand -hex 32

import { secret } from "encore.dev/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ProviderKeyEncryptionSecret = secret("ProviderKeyEncryptionSecret");

/**
 * Encrypt a plaintext API key for storage in the DB.
 * Returns "iv_hex:ciphertext_hex".
 */
export function encryptApiKey(plaintext: string): string {
  const keyHex = ProviderKeyEncryptionSecret();
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "ProviderKeyEncryptionSecret must be a 64-char hex string (32 bytes). " +
      "Generate with: openssl rand -hex 32"
    );
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a stored API key from the DB.
 * Expects "iv_hex:ciphertext_hex" format produced by encryptApiKey().
 */
export function decryptApiKey(encrypted: string): string {
  const keyHex = ProviderKeyEncryptionSecret();
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("ProviderKeyEncryptionSecret is not configured or invalid.");
  }
  const [ivHex, ciphertext] = encrypted.split(":");
  if (!ivHex || !ciphertext) {
    throw new Error("Invalid encrypted key format. Expected 'iv_hex:ciphertext_hex'.");
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8");
}
