import { describe, it, expect } from "vitest";
import { getAssignedTasks, getTask, updateTask, STATUS_TO_LINEAR } from "./linear";

describe("Linear service", () => {
  describe("getAssignedTasks", () => {
    it(
      "should return a list of tasks (can be empty)",
      { timeout: 30000 },
      async () => {
        const result = await getAssignedTasks();

        expect(result).toBeDefined();
        expect(result.tasks).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);

        // If there are tasks, verify structure
        if (result.tasks.length > 0) {
          const task = result.tasks[0];
          expect(task.id).toBeDefined();
          expect(typeof task.id).toBe("string");
          expect(task.identifier).toBeDefined();
          expect(task.title).toBeDefined();
          expect(typeof task.title).toBe("string");
          expect(task.state).toBeDefined();
          expect(typeof task.state).toBe("string");
          expect(Array.isArray(task.labels)).toBe(true);
        }
      }
    );

    it(
      "should only return tasks with thefold label",
      { timeout: 30000 },
      async () => {
        const result = await getAssignedTasks();

        expect(result).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);

        // If there are tasks, verify they have the thefold label
        if (result.tasks.length > 0) {
          result.tasks.forEach((task) => {
            expect(task.labels).toBeDefined();
            expect(Array.isArray(task.labels)).toBe(true);
            // Should include "thefold" label
            expect(task.labels.some((label) => label.toLowerCase() === "thefold")).toBe(
              true
            );
          });
        }
      }
    );

    it(
      "should not return completed or canceled tasks",
      { timeout: 30000 },
      async () => {
        const result = await getAssignedTasks();

        expect(result).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);

        // If there are tasks, verify they are not completed or canceled
        if (result.tasks.length > 0) {
          result.tasks.forEach((task) => {
            expect(task.state.toLowerCase()).not.toBe("completed");
            expect(task.state.toLowerCase()).not.toBe("canceled");
          });
        }
      }
    );
  });

  describe("getTask", () => {
    it(
      "should handle invalid task ID gracefully",
      { timeout: 30000 },
      async () => {
        // Test with an invalid/non-existent task ID
        await expect(
          getTask({ taskId: "invalid-task-id-12345" })
        ).rejects.toThrow();
      }
    );

    it(
      "should handle malformed task ID gracefully",
      { timeout: 30000 },
      async () => {
        // Test with a completely malformed ID
        await expect(
          getTask({ taskId: "" })
        ).rejects.toThrow();
      }
    );

    it(
      "should retrieve task details if task exists",
      { timeout: 30000 },
      async () => {
        // First get a list of tasks
        const tasks = await getAssignedTasks();

        // If there are tasks, test getting one
        if (tasks.tasks.length > 0) {
          const taskId = tasks.tasks[0].id;
          const result = await getTask({ taskId });

          expect(result).toBeDefined();
          expect(result.task).toBeDefined();
          expect(result.task.id).toBe(taskId);
          expect(result.task.identifier).toBeDefined();
          expect(result.task.title).toBeDefined();
          expect(result.task.state).toBeDefined();
          expect(Array.isArray(result.task.labels)).toBe(true);
        } else {
          // If no tasks exist, skip this part of the test
          expect(tasks.tasks).toHaveLength(0);
        }
      }
    );
  });

  describe("updateTask", () => {
    it(
      "should handle updating non-existent task gracefully",
      { timeout: 30000 },
      async () => {
        // Test adding a comment to a non-existent task
        await expect(
          updateTask({
            taskId: "invalid-task-id-12345",
            comment: "Test comment from automated test",
          })
        ).rejects.toThrow();
      }
    );

    it(
      "should successfully add a comment to an existing task",
      { timeout: 30000 },
      async () => {
        // First get a list of tasks
        const tasks = await getAssignedTasks();

        // If there are tasks, test updating one
        if (tasks.tasks.length > 0) {
          const taskId = tasks.tasks[0].id;
          const result = await updateTask({
            taskId,
            comment: `🤖 Automated test comment - ${new Date().toISOString()}`,
          });

          expect(result).toBeDefined();
          expect(result.success).toBe(true);
        } else {
          // If no tasks exist, skip this part of the test
          expect(tasks.tasks).toHaveLength(0);
        }
      }
    );

    it(
      "should handle empty comment gracefully",
      { timeout: 30000 },
      async () => {
        // First get a list of tasks
        const tasks = await getAssignedTasks();

        // If there are tasks, test updating without a comment
        if (tasks.tasks.length > 0) {
          const taskId = tasks.tasks[0].id;
          const result = await updateTask({
            taskId,
            // No comment or state - should still succeed
          });

          expect(result).toBeDefined();
          expect(result.success).toBe(true);
        } else {
          // If no tasks exist, skip this part of the test
          expect(tasks.tasks).toHaveLength(0);
        }
      }
    );
  });

  describe("State mapping", () => {
    it("maps all 6 TheFold statuses to Linear states", () => {
      expect(STATUS_TO_LINEAR["backlog"]).toBe("Backlog");
      expect(STATUS_TO_LINEAR["planned"]).toBe("Todo");
      expect(STATUS_TO_LINEAR["in_progress"]).toBe("In Progress");
      expect(STATUS_TO_LINEAR["in_review"]).toBe("In Review");
      expect(STATUS_TO_LINEAR["done"]).toBe("Done");
      expect(STATUS_TO_LINEAR["blocked"]).toBe("Cancelled");
    });

    it("covers exactly 6 statuses", () => {
      expect(Object.keys(STATUS_TO_LINEAR).length).toBe(6);
    });

    it("all mapped Linear states are non-empty strings", () => {
      for (const [key, value] of Object.entries(STATUS_TO_LINEAR)) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Linear integration health", () => {
    it(
      "should successfully connect to Linear API",
      { timeout: 30000 },
      async () => {
        // This test verifies that we can connect to Linear
        // Even if there are no tasks, it should not throw an error
        const result = await getAssignedTasks();

        expect(result).toBeDefined();
        expect(result.tasks).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);
      }
    );
  });
});
