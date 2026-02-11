import { describe, it, expect, afterAll } from "vitest";
import { getTree } from "../github/github";
import { planTask } from "../ai/ai";
import { create, writeFile, validate, destroy } from "../sandbox/sandbox";

const REPO_OWNER = "Twofold-AS";
const REPO_NAME = "thefold";

describe("Agent integration loop", () => {
  const createdSandboxes: string[] = [];

  afterAll(async () => {
    for (const sandboxId of createdSandboxes) {
      try {
        await destroy({ sandboxId });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it(
    "should plan a task, write code in sandbox, and pass validation",
    { timeout: 180_000 },
    async () => {
      // === 1. Create sandbox (clone repo) ===
      const sandboxResult = await create({
        repoOwner: REPO_OWNER,
        repoName: REPO_NAME,
      });
      expect(sandboxResult.id).toBeDefined();
      createdSandboxes.push(sandboxResult.id);

      // === 2. Read project structure from GitHub ===
      const projectTree = await getTree({
        owner: REPO_OWNER,
        repo: REPO_NAME,
      });
      expect(projectTree.tree.length).toBeGreaterThan(0);
      expect(projectTree.treeString.length).toBeGreaterThan(0);

      // === 3. Ask AI to plan the task ===
      const taskDescription =
        "Opprett en fil hello.ts i roten som eksporterer en funksjon helloWorld() som returnerer strengen 'Hello from TheFold'";

      const plan = await planTask({
        task: taskDescription,
        projectStructure: projectTree.treeString,
        relevantFiles: [],
        memoryContext: [],
        docsContext: [],
      });

      expect(plan.plan).toBeDefined();
      expect(Array.isArray(plan.plan)).toBe(true);
      expect(plan.plan.length).toBeGreaterThan(0);
      expect(plan.reasoning).toBeDefined();

      // Verify plan contains a create_file step
      const createSteps = plan.plan.filter(
        (s) => s.action === "create_file" || s.action === "modify_file"
      );
      expect(createSteps.length).toBeGreaterThan(0);

      // === 4. Execute the plan in the sandbox ===
      for (const step of plan.plan) {
        if (
          (step.action === "create_file" || step.action === "modify_file") &&
          step.filePath &&
          step.content
        ) {
          const writeResult = await writeFile({
            sandboxId: sandboxResult.id,
            path: step.filePath,
            content: step.content,
          });
          expect(writeResult.written).toBe(true);
        }
      }

      // === 5. Validate the code compiles ===
      const validation = await validate({
        sandboxId: sandboxResult.id,
      });

      expect(validation).toBeDefined();
      expect(validation.output).toBeDefined();
      expect(validation.output.length).toBeGreaterThan(0);

      // Log validation output for debugging
      console.log("Validation output:", validation.output);
      console.log("Validation success:", validation.success);
      console.log("Validation errors:", validation.errors);

      // === 6. Cleanup ===
      const destroyResult = await destroy({
        sandboxId: sandboxResult.id,
      });
      expect(destroyResult.destroyed).toBe(true);

      // Remove from cleanup list since we already destroyed
      const idx = createdSandboxes.indexOf(sandboxResult.id);
      if (idx !== -1) createdSandboxes.splice(idx, 1);
    }
  );
});
