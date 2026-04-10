import { test, expect } from "@playwright/test";

const sidebarLinks = [
  { label: "Overview", href: "/" },
  { label: "Chat", href: "/chat" },
  { label: "Tasks", href: "/tasks" },
  { label: "Projects", href: "/projects" },
  { label: "Skills", href: "/skills" },
  { label: "Memory", href: "/memory" },
];

test.describe("Sidebar navigation", () => {
  test("sidebar renders navigation links on the home page", async ({ page }) => {
    await page.goto("/");

    // The layout renders a sidebar with nav links
    for (const { href } of sidebarLinks.slice(0, 4)) {
      const link = page.locator(`a[href="${href}"]`).first();
      await expect(link).toBeAttached({ timeout: 8_000 });
    }
  });

  test("clicking Tasks in sidebar navigates to /tasks", async ({ page }) => {
    await page.goto("/");
    const tasksLink = page.locator('a[href="/tasks"]').first();
    await tasksLink.click();
    await expect(page).toHaveURL(/\/tasks/, { timeout: 6_000 });
  });

  test("clicking Projects in sidebar navigates to /projects", async ({ page }) => {
    await page.goto("/");
    const projectsLink = page.locator('a[href="/projects"]').first();
    await projectsLink.click();
    await expect(page).toHaveURL(/\/projects/, { timeout: 6_000 });
  });

  test("clicking Chat in sidebar navigates to /chat", async ({ page }) => {
    await page.goto("/");
    const chatLink = page.locator('a[href="/chat"]').first();
    await chatLink.click();
    await expect(page).toHaveURL(/\/chat/, { timeout: 6_000 });
  });
});

test.describe("Breadcrumbs", () => {
  test("breadcrumb renders 'Overview' on home page", async ({ page }) => {
    await page.goto("/");
    // The layout builds breadcrumbs from the pathname
    const breadcrumb = page.locator("text=Overview").first();
    await expect(breadcrumb).toBeVisible({ timeout: 8_000 });
  });

  test("breadcrumb renders page label for /tasks", async ({ page }) => {
    await page.goto("/tasks");
    // Breadcrumb should include 'tasks' in some form
    const breadcrumb = page.locator("text=/tasks/i").first();
    await expect(breadcrumb).toBeVisible({ timeout: 8_000 });
  });

  test("breadcrumb renders page label for /projects", async ({ page }) => {
    await page.goto("/projects");
    const breadcrumb = page.locator("text=/projects/i").first();
    await expect(breadcrumb).toBeVisible({ timeout: 8_000 });
  });

  test("breadcrumb renders page label for /skills", async ({ page }) => {
    await page.goto("/skills");
    const breadcrumb = page.locator("text=/skills/i").first();
    await expect(breadcrumb).toBeVisible({ timeout: 8_000 });
  });
});
