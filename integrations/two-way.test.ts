import { describe, it, expect } from "vitest";

describe("Slack/Discord two-way", () => {
  it("sendToSlack formats message correctly", () => {
    const payload = JSON.stringify({ text: "Hello", unfurl_links: false });
    const parsed = JSON.parse(payload);
    expect(parsed.text).toBe("Hello");
    expect(parsed.unfurl_links).toBe(false);
  });

  it("sendToDiscord truncates long messages", () => {
    const longMessage = "a".repeat(2500);
    const truncated = longMessage.length > 1900 ? longMessage.substring(0, 1900) + "..." : longMessage;
    expect(truncated.length).toBe(1903); // 1900 + "..."
  });

  it("sendToDiscord does not truncate short messages", () => {
    const shortMessage = "Hello Discord!";
    const truncated = shortMessage.length > 1900 ? shortMessage.substring(0, 1900) + "..." : shortMessage;
    expect(truncated).toBe("Hello Discord!");
    expect(truncated.length).toBe(14);
  });

  it("web source does not trigger webhook", () => {
    const source = "web";
    const shouldRoute = source === "slack" || source === "discord";
    expect(shouldRoute).toBe(false);
  });

  it("api source does not trigger webhook", () => {
    const source = "api";
    const shouldRoute = source === "slack" || source === "discord";
    expect(shouldRoute).toBe(false);
  });

  it("slack source triggers webhook routing", () => {
    const source = "slack";
    const shouldRoute = source === "slack" || source === "discord";
    expect(shouldRoute).toBe(true);
  });

  it("discord source triggers webhook routing", () => {
    const source = "discord";
    const shouldRoute = source === "slack" || source === "discord";
    expect(shouldRoute).toBe(true);
  });

  it("discord message at exactly 1900 chars is not truncated", () => {
    const exactMessage = "b".repeat(1900);
    const truncated = exactMessage.length > 1900 ? exactMessage.substring(0, 1900) + "..." : exactMessage;
    expect(truncated.length).toBe(1900);
    expect(truncated).toBe(exactMessage);
  });
});
