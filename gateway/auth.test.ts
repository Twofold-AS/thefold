import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import * as crypto from "crypto";

const db = new SQLDatabase("gateway", { migrations: "./migrations" });

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

describe("Token revocation", () => {
  beforeEach(async () => {
    await db.exec`DELETE FROM revoked_tokens`;
  });

  it("should insert a revoked token", async () => {
    const token = "test-token-abc.fakesig";
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${tokenHash}, ${expiresAt}::timestamptz)
    `;

    const row = await db.queryRow<{ token_hash: string }>`
      SELECT token_hash FROM revoked_tokens WHERE token_hash = ${tokenHash}
    `;

    expect(row).toBeDefined();
    expect(row!.token_hash).toBe(tokenHash);
  });

  it("should detect a revoked token", async () => {
    const token = "revoked-token.sig123";
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${tokenHash}, ${expiresAt}::timestamptz)
    `;

    const revoked = await db.queryRow<{ token_hash: string }>`
      SELECT token_hash FROM revoked_tokens WHERE token_hash = ${tokenHash}
    `;

    expect(revoked).not.toBeNull();
  });

  it("should NOT find a non-revoked token", async () => {
    const tokenHash = hashToken("valid-token.validsig");

    const revoked = await db.queryRow<{ token_hash: string }>`
      SELECT token_hash FROM revoked_tokens WHERE token_hash = ${tokenHash}
    `;

    expect(revoked).toBeNull();
  });

  it("should handle ON CONFLICT gracefully for duplicate revocations", async () => {
    const token = "duplicate-token.sig";
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${tokenHash}, ${expiresAt}::timestamptz)
      ON CONFLICT (token_hash) DO NOTHING
    `;

    // Insert again — should not throw
    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${tokenHash}, ${expiresAt}::timestamptz)
      ON CONFLICT (token_hash) DO NOTHING
    `;

    const count = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count FROM revoked_tokens WHERE token_hash = ${tokenHash}
    `;

    expect(count!.count).toBe(1);
  });

  it("should clean up expired revoked tokens", async () => {
    const expiredHash = hashToken("expired-token");
    const validHash = hashToken("valid-token");

    // Insert expired token (expires_at in the past)
    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${expiredHash}, NOW() - INTERVAL '1 hour')
    `;

    // Insert valid token (expires_at in the future)
    await db.exec`
      INSERT INTO revoked_tokens (token_hash, expires_at)
      VALUES (${validHash}, NOW() + INTERVAL '7 days')
    `;

    // Run cleanup
    const result = await db.queryRow<{ count: number }>`
      WITH deleted AS (
        DELETE FROM revoked_tokens WHERE expires_at < NOW()
        RETURNING token_hash
      )
      SELECT COUNT(*)::int as count FROM deleted
    `;

    expect(result!.count).toBe(1);

    // Valid token should still exist
    const remaining = await db.queryRow<{ token_hash: string }>`
      SELECT token_hash FROM revoked_tokens WHERE token_hash = ${validHash}
    `;
    expect(remaining).not.toBeNull();

    // Expired token should be gone
    const gone = await db.queryRow<{ token_hash: string }>`
      SELECT token_hash FROM revoked_tokens WHERE token_hash = ${expiredHash}
    `;
    expect(gone).toBeNull();
  });
});
