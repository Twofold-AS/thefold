import { describe, it, expect, beforeEach } from "vitest";
import * as crypto from "crypto";
import { db, requestOtp, verifyOtp } from "./users";

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

describe("users service", () => {
  it("should have two seeded users", async () => {
    const rows = await db.query<{ email: string; name: string; role: string }>`
      SELECT email, name, role FROM users ORDER BY email
    `;

    const users = [];
    for await (const row of rows) {
      users.push(row);
    }

    expect(users).toHaveLength(2);

    const mikael = users.find((u) => u.email === "mikael@twofold.no");
    expect(mikael).toBeDefined();
    expect(mikael!.name).toBe("Mikael");
    expect(mikael!.role).toBe("admin");

    const mikkis = users.find((u) => u.email === "mikkis@twofold.no");
    expect(mikkis).toBeDefined();
    expect(mikkis!.name).toBe("Mikkis");
    expect(mikkis!.role).toBe("admin");
  });
});

describe("request-otp", () => {
  beforeEach(async () => {
    await db.exec`DELETE FROM login_audit`;
    await db.exec`DELETE FROM otp_codes`;
  });

  it("returns success for known email", async () => {
    const result = await requestOtp({ email: "mikkis@twofold.no" });
    expect(result.success).toBe(true);
  });

  it("returns success for UNKNOWN email (enumeration protection)", async () => {
    const result = await requestOtp({ email: "unknown@example.com" });
    expect(result.success).toBe(true);
  });

  it("creates an OTP code in the database for known email", async () => {
    await requestOtp({ email: "mikkis@twofold.no" });

    const user = await db.queryRow<{ id: string }>`
      SELECT id FROM users WHERE email = 'mikkis@twofold.no'
    `;

    const otp = await db.queryRow<{ id: string; used: boolean }>`
      SELECT id, used FROM otp_codes WHERE user_id = ${user!.id}
    `;
    expect(otp).toBeDefined();
    expect(otp!.used).toBe(false);
  });

  it("does NOT create an OTP code for unknown email", async () => {
    await requestOtp({ email: "unknown@example.com" });

    const count = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM otp_codes
    `;
    expect(count!.count).toBe(0);
  });

  it("logs audit entry for request", async () => {
    await requestOtp({ email: "mikkis@twofold.no" });

    const audit = await db.queryRow<{ email: string; success: boolean }>`
      SELECT email, success FROM login_audit ORDER BY created_at DESC LIMIT 1
    `;
    expect(audit).toBeDefined();
    expect(audit!.email).toBe("mikkis@twofold.no");
  });

  it("rate limits after 5 requests per hour", async () => {
    // Send 5 requests
    for (let i = 0; i < 5; i++) {
      await requestOtp({ email: "mikkis@twofold.no" });
    }

    // 6th request should still return success (enumeration protection)
    // but should NOT create a new OTP code
    const countBefore = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM otp_codes
    `;
    expect(countBefore!.count).toBe(5);

    await requestOtp({ email: "mikkis@twofold.no" });

    const countAfter = await db.queryRow<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM otp_codes
    `;
    // Should still be 5 — the 6th was rate limited
    expect(countAfter!.count).toBe(5);
  });
});

describe("verify-otp", () => {
  const testEmail = "mikkis@twofold.no";
  let userId: string;

  beforeEach(async () => {
    await db.exec`DELETE FROM login_audit`;
    await db.exec`DELETE FROM otp_codes`;
    await db.exec`UPDATE users SET last_login_at = NULL`;

    const user = await db.queryRow<{ id: string }>`
      SELECT id FROM users WHERE email = ${testEmail}
    `;
    userId = user!.id;
  });

  it("returns token with correct code", async () => {
    const code = "123456";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes')
    `;

    const result = await verifyOtp({ email: testEmail, code });

    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
    expect(result.token!.length).toBeGreaterThan(10);
    expect(result.user).toBeDefined();
    expect(result.user!.email).toBe(testEmail);
    expect(result.user!.name).toBe("Mikkis");
    expect(result.user!.role).toBe("admin");
  });

  it("marks OTP as used after successful verification", async () => {
    const code = "654321";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes')
    `;

    await verifyOtp({ email: testEmail, code });

    const otp = await db.queryRow<{ used: boolean }>`
      SELECT used FROM otp_codes WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
    `;
    expect(otp!.used).toBe(true);
  });

  it("updates last_login_at after successful verification", async () => {
    const code = "111111";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes')
    `;

    await verifyOtp({ email: testEmail, code });

    const user = await db.queryRow<{ last_login_at: string | null }>`
      SELECT last_login_at FROM users WHERE id = ${userId}
    `;
    expect(user!.last_login_at).not.toBeNull();
  });

  it("returns error with wrong code", async () => {
    const code = "123456";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes')
    `;

    const result = await verifyOtp({ email: testEmail, code: "999999" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ugyldig kode");
  });

  it("increments attempts on wrong code", async () => {
    const code = "123456";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes')
    `;

    await verifyOtp({ email: testEmail, code: "999999" });

    const otp = await db.queryRow<{ attempts: number }>`
      SELECT attempts FROM otp_codes WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1
    `;
    expect(otp!.attempts).toBe(1);
  });

  it("locks out after 3 wrong attempts", async () => {
    const code = "123456";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes')
    `;

    // 3 wrong attempts
    for (let i = 0; i < 3; i++) {
      await verifyOtp({ email: testEmail, code: "999999" });
    }

    // 4th attempt — even with correct code should be rejected
    const result = await verifyOtp({ email: testEmail, code });
    expect(result.success).toBe(false);
    expect(result.error).toContain("For mange forsøk");
  });

  it("rejects expired code", async () => {
    const code = "123456";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at)
      VALUES (${userId}, ${hashCode(code)}, NOW() - INTERVAL '1 minute')
    `;

    const result = await verifyOtp({ email: testEmail, code });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ingen gyldig kode");
  });

  it("rejects already-used code", async () => {
    const code = "123456";
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at, used)
      VALUES (${userId}, ${hashCode(code)}, NOW() + INTERVAL '5 minutes', true)
    `;

    const result = await verifyOtp({ email: testEmail, code });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ingen gyldig kode");
  });

  it("returns error for unknown email", async () => {
    const result = await verifyOtp({ email: "nobody@example.com", code: "123456" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ugyldig e-post eller kode");
  });

  it("uses most recent OTP when multiple exist", async () => {
    const oldCode = "111111";
    const newCode = "222222";

    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at, created_at)
      VALUES (${userId}, ${hashCode(oldCode)}, NOW() + INTERVAL '5 minutes', NOW() - INTERVAL '2 minutes')
    `;
    await db.exec`
      INSERT INTO otp_codes (user_id, code_hash, expires_at, created_at)
      VALUES (${userId}, ${hashCode(newCode)}, NOW() + INTERVAL '5 minutes', NOW())
    `;

    // Old code should fail (latest OTP is the new one)
    const oldResult = await verifyOtp({ email: testEmail, code: oldCode });
    expect(oldResult.success).toBe(false);

    // New code should work
    const newResult = await verifyOtp({ email: testEmail, code: newCode });
    expect(newResult.success).toBe(true);
  });
});
