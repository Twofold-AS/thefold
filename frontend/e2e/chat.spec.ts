import { test, expect } from "@playwright/test";

test.describe("Chat — home page composer", () => {
  test("home page renders ChatComposer", async ({ page }) => {
    await page.goto("/");
    // The composer textarea / input should be visible
    const composer = page.locator("textarea, [data-testid='chat-composer']").first();
    await expect(composer).toBeVisible({ timeout: 10_000 });
  });

  test("typing a message and submitting redirects to /chat with msg param", async ({ page }) => {
    await page.goto("/");

    // Find the composer input and type a message
    const textarea = page.locator("textarea").first();
    await textarea.fill("Build me a REST API with auth");

    // Submit via Enter key (ChatComposer uses keyboard submit)
    await textarea.press("Enter");

    // Should navigate to /chat with the message as a query param
    await page.waitForURL(/\/chat/, { timeout: 8_000 });
    expect(page.url()).toMatch(/\/chat/);
    expect(page.url()).toMatch(/msg=/);
  });

  test("empty submission does not navigate away from home", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("textarea").first();
    await textarea.fill("");
    await textarea.press("Enter");

    // Should stay on home page
    await page.waitForTimeout(500);
    expect(page.url()).not.toMatch(/\/chat\?/);
  });
});
