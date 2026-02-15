import { describe, it, expect } from "vitest";
import { sanitize } from "./sanitize";

describe("AI Input Sanitization (OWASP A03)", () => {
  it("trims whitespace", () => {
    expect(sanitize("  hello world  ")).toBe("hello world");
  });

  it("removes null bytes", () => {
    expect(sanitize("hello\x00world")).toBe("helloworld");
  });

  it("removes control characters but keeps newline and tab", () => {
    expect(sanitize("hello\nworld\ttab")).toBe("hello\nworld\ttab");
    expect(sanitize("hello\x01\x02\x03world")).toBe("helloworld");
    expect(sanitize("test\x7Fend")).toBe("testend");
  });

  it("keeps carriage return", () => {
    expect(sanitize("line1\r\nline2")).toBe("line1\r\nline2");
  });

  it("enforces default max length (50000)", () => {
    const long = "a".repeat(60000);
    const result = sanitize(long);
    expect(result.length).toBe(50000);
  });

  it("enforces custom max length", () => {
    const long = "a".repeat(200);
    const result = sanitize(long, { maxLength: 100 });
    expect(result.length).toBe(100);
  });

  it("passes through normal text unchanged", () => {
    const text = "Bygg et nytt API-endepunkt med Encore.ts\nBruk TypeScript strict mode";
    expect(sanitize(text)).toBe(text);
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
    expect(sanitize("   ")).toBe("");
  });

  it("handles unicode correctly", () => {
    const norwegian = "Bruk ÆØÅ i alle norske tekster med spesialtegn: é, ü, ñ";
    expect(sanitize(norwegian)).toBe(norwegian);
  });

  it("strips multiple control characters mixed with valid text", () => {
    const input = "Valid\x00text\x01with\x0Bmixed\x0Ccontrol\x1Fchars";
    expect(sanitize(input)).toBe("Validtextwithmixedcontrolchars");
  });
});
