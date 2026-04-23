import { secret } from "encore.dev/config";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Symmetric AES-256-GCM for third-party API keys stored in integration_configs.
// Master key = SHA-256(AuthSecret) — already used for project API keys (Fase I.1).
// Ciphertext format: <iv-hex>.<authtag-hex>.<ciphertext-hex>

const authSecret = secret("AuthSecret");

function getKey(): Buffer {
  return createHash("sha256").update(authSecret()).digest();
}

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted.toString("hex")}`;
}

export function decryptApiKey(encrypted: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(".");
  if (!ivHex || !tagHex || !dataHex) throw new Error("invalid ciphertext");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export function previewApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return "***" + plaintext.slice(-2);
  return plaintext.slice(0, 4) + "..." + plaintext.slice(-4);
}
