import { describe, it, expect } from "vitest";
import nextConfig from "./next.config";

describe("Security headers (OWASP A02)", () => {
  it("should define headers() function", () => {
    expect(nextConfig.headers).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("should include X-Frame-Options header set to DENY", async () => {
    const headerGroups = await nextConfig.headers!();
    const headers = headerGroups[0].headers;

    const xfo = headers.find((h) => h.key === "X-Frame-Options");
    expect(xfo).toBeDefined();
    expect(xfo?.value).toBe("DENY");
  });

  it("should include X-Content-Type-Options header set to nosniff", async () => {
    const headerGroups = await nextConfig.headers!();
    const headers = headerGroups[0].headers;

    const xcto = headers.find((h) => h.key === "X-Content-Type-Options");
    expect(xcto).toBeDefined();
    expect(xcto?.value).toBe("nosniff");
  });

  it("should include Content-Security-Policy header", async () => {
    const headerGroups = await nextConfig.headers!();
    const headers = headerGroups[0].headers;

    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp?.value).toContain("default-src 'self'");
    expect(csp?.value).toContain("frame-ancestors 'none'");
  });

  it("should include all required security headers", async () => {
    const headerGroups = await nextConfig.headers!();
    const headers = headerGroups[0].headers;

    const keys = headers.map((h) => h.key);
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("X-XSS-Protection");
    expect(keys).toContain("Permissions-Policy");
  });
});
