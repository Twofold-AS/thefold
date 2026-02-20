import { describe, it, expect, beforeEach } from "vitest";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const db = new SQLDatabase("users", { migrations: "./migrations" });

// --- Login security monitoring tests (OWASP A09) ---

describe("Login security monitoring (A09)", () => {
  const testEmail = `security-test-${Date.now()}@example.com`;

  beforeEach(async () => {
    await db.exec`DELETE FROM login_audit WHERE email LIKE 'security-test-%'`;
  });

  it("should store failed login attempts in login_audit table", async () => {
    await db.exec`
      INSERT INTO login_audit (email, success, created_at)
      VALUES (${testEmail}, false, NOW())
    `;

    const result = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count
      FROM login_audit
      WHERE email = ${testEmail} AND success = false
    `;

    expect(result?.count).toBe(1);
  });

  it("should count failed attempts within 24h window", async () => {
    // Insert 6 failed attempts
    for (let i = 0; i < 6; i++) {
      await db.exec`
        INSERT INTO login_audit (email, success, created_at)
        VALUES (${testEmail}, false, NOW())
      `;
    }

    const result = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int as count
      FROM login_audit
      WHERE email = ${testEmail}
        AND success = false
        AND created_at > NOW() - INTERVAL '24 hours'
    `;

    expect(result?.count).toBe(6);
  });

  it("should aggregate failed attempts by email", async () => {
    // Insert multiple failed attempts for test email
    for (let i = 0; i < 8; i++) {
      await db.exec`
        INSERT INTO login_audit (email, success, created_at)
        VALUES (${testEmail}, false, NOW())
      `;
    }

    const suspicious = await db.query<{ email: string; count: number }>`
      SELECT email, COUNT(*)::int as count
      FROM login_audit
      WHERE success = false
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY email
      HAVING COUNT(*) >= 5
      ORDER BY count DESC
      LIMIT 20
    `;

    const results: Array<{ email: string; count: number }> = [];
    for await (const row of suspicious) {
      results.push(row);
    }

    const found = results.find((r) => r.email === testEmail);
    expect(found).toBeDefined();
    expect(found!.count).toBe(8);
  });
});
