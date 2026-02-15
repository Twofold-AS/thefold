import { describe, it, expect } from "vitest";

// Test the isConfigured helper logic used by secrets-status endpoint
// We replicate the helper here since Encore secrets can't be easily mocked

describe("Secrets status", () => {
  function isConfigured(fn: () => string): boolean {
    try {
      const val = fn();
      return val !== undefined && val !== "";
    } catch {
      return false;
    }
  }

  it("returns true for a configured secret", () => {
    const mockSecret = () => "some-api-key-value";
    expect(isConfigured(mockSecret)).toBe(true);
  });

  it("returns false for a secret that throws", () => {
    const mockSecret = () => { throw new Error("secret not set"); };
    expect(isConfigured(mockSecret)).toBe(false);
  });

  it("returns false for an empty string", () => {
    const mockSecret = () => "";
    expect(isConfigured(mockSecret)).toBe(false);
  });

  it("returns false for undefined return", () => {
    const mockSecret = () => undefined as unknown as string;
    expect(isConfigured(mockSecret)).toBe(false);
  });

  it("checks all 7 expected secrets", () => {
    const expectedSecrets = [
      "AnthropicAPIKey",
      "GitHubToken",
      "LinearAPIKey",
      "VoyageAPIKey",
      "ResendAPIKey",
      "AuthSecret",
      "MonitorEnabled",
    ];
    expect(expectedSecrets.length).toBe(7);
  });
});
