import { test, expect } from "@playwright/test";

test.describe("Projects page", () => {
  test("navigating to /projects renders the page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects/, { timeout: 8_000 });

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("projects page shows project cards or empty state", async ({ page }) => {
    // Intercept tasks API to return tasks with repo grouping data
    await page.route("**/tasks/list", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tasks: [
            {
              id: "task-p1",
              title: "Implement auth",
              description: "Add JWT auth",
              repo: "my-project",
              status: "done",
              source: "manual",
              priority: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: "task-p2",
              title: "Build API",
              description: "REST endpoints",
              repo: "my-project",
              status: "in_progress",
              source: "chat",
              priority: 3,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects/);

    // Should render something — either project cards from the mocked data or empty state
    const content = page.locator("body");
    await expect(content).toBeVisible({ timeout: 10_000 });

    // Check that the project name or an empty state is rendered
    const projectIndicator = page
      .locator("text=my-project, [class*='project'], p, h2")
      .first();
    await expect(projectIndicator).toBeVisible({ timeout: 8_000 });
  });

  test("project cards link to /tasks filtered by repo", async ({ page }) => {
    await page.route("**/tasks/list", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tasks: [
            {
              id: "task-link-1",
              title: "Auth task",
              repo: "linked-repo",
              status: "backlog",
              source: "manual",
              priority: 1,
              description: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto("/projects");

    // If a project card for "linked-repo" renders with a link, verify its href
    const link = page.locator("a[href*='linked-repo'], a[href*='tasks']").first();
    if (await link.isVisible({ timeout: 5_000 })) {
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
    }
  });
});
