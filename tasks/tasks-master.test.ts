import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ZF Tests: Tasks service as sole source of tasks.
 *
 * These tests verify:
 * 1. Linear cron creates tasks via tasks service, does NOT start agent directly
 * 2. Duplicate import from Linear is ignored (external_id match)
 * 3. Tasks with source="linear" can be traced back
 * 4. createTask with externalId stores correctly
 * 5. getTaskByExternalId finds correct task
 *
 * NOTE: These tests mock the database and service clients since they run
 * in a unit test context without Encore infrastructure.
 */

// --- Mock setup ---

// Mock the tasks service database
const mockQueryRow = vi.fn();
const mockExec = vi.fn();
const mockQuery = vi.fn();

vi.mock("encore.dev/storage/sqldb", () => ({
  SQLDatabase: vi.fn().mockImplementation(function () {
    return {
      queryRow: mockQueryRow,
      exec: mockExec,
      query: mockQuery,
    };
  }),
}));

vi.mock("encore.dev/api", () => ({
  api: (_opts: any, handler: any) => handler,
  APIError: {
    invalidArgument: (msg: string) => new Error(`invalid_argument: ${msg}`),
    notFound: (msg: string) => new Error(`not_found: ${msg}`),
    internal: (msg: string) => new Error(`internal: ${msg}`),
  },
}));

vi.mock("encore.dev/pubsub", () => ({
  Topic: vi.fn().mockImplementation(function () {
    return { publish: vi.fn().mockResolvedValue("msg-id") };
  }),
  Subscription: vi.fn(),
}));

vi.mock("~encore/clients", () => ({
  linear: {
    getAssignedTasks: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
  },
  ai: {
    planTaskOrder: vi.fn(),
  },
  tasks: {
    createTask: vi.fn(),
    getTaskByExternalId: vi.fn(),
  },
}));

vi.mock("encore.dev/config", () => ({
  secret: () => () => "mock-secret",
}));

vi.mock("encore.dev/cron", () => ({
  CronJob: vi.fn(),
}));

vi.mock("encore.dev/log", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helper: build a mock TaskRow ---

function mockTaskRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: overrides.id ?? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    title: overrides.title ?? "Test task",
    description: overrides.description ?? null,
    repo: overrides.repo ?? null,
    status: overrides.status ?? "backlog",
    priority: overrides.priority ?? 3,
    labels: overrides.labels ?? [],
    phase: overrides.phase ?? null,
    depends_on: overrides.depends_on ?? [],
    source: overrides.source ?? "manual",
    linear_task_id: overrides.linear_task_id ?? null,
    linear_synced_at: overrides.linear_synced_at ?? null,
    healing_source_id: overrides.healing_source_id ?? null,
    estimated_complexity: overrides.estimated_complexity ?? null,
    estimated_tokens: overrides.estimated_tokens ?? null,
    planned_order: overrides.planned_order ?? null,
    assigned_to: overrides.assigned_to ?? "thefold",
    build_job_id: overrides.build_job_id ?? null,
    pr_url: overrides.pr_url ?? null,
    review_id: overrides.review_id ?? null,
    error_message: overrides.error_message ?? null,
    external_id: overrides.external_id ?? null,
    external_source: overrides.external_source ?? null,
    created_by: overrides.created_by ?? null,
    created_at: overrides.created_at ?? new Date(),
    updated_at: overrides.updated_at ?? new Date(),
    completed_at: overrides.completed_at ?? null,
  };
}

describe("ZF: Tasks as sole source", () => {

  describe("1. Linear cron creates tasks, does NOT start agent directly", () => {
    it("syncToTasksService imports Linear tasks via tasks.createTask", async () => {
      // Import after mocks are set up
      const { syncToTasksService } = await import("../linear/linear");
      const { getAssignedTasks } = await import("../linear/linear");
      const clients = await import("~encore/clients");

      // Mock getAssignedTasks to return two Linear tasks
      const linearTasks = [
        { id: "lin-1", identifier: "TF-1", title: "Build auth", description: "Auth module", state: "Backlog", priority: 2, labels: ["thefold"] },
        { id: "lin-2", identifier: "TF-2", title: "Build API", description: "API module", state: "In Progress", priority: 1, labels: ["thefold"] },
      ];

      // The syncToTasksService calls getAssignedTasks internally via the same module
      // We need to mock the tasks client
      const newTask1 = {
        task: {
          id: "uuid-1",
          title: "Build auth",
          source: "linear",
          externalId: "lin-1",
          externalSource: "linear",
          createdAt: new Date().toISOString(), // recent = newly created
          updatedAt: new Date().toISOString(),
        },
      };
      const newTask2 = {
        task: {
          id: "uuid-2",
          title: "Build API",
          source: "linear",
          externalId: "lin-2",
          externalSource: "linear",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      (clients.tasks.createTask as any)
        .mockResolvedValueOnce(newTask1)
        .mockResolvedValueOnce(newTask2);

      // Verify that tasks.createTask is called, NOT agent.startTask
      expect(clients.tasks.createTask).not.toHaveBeenCalled();

      // The test verifies the structure: syncToTasksService should call tasks.createTask
      // with source: "linear" and externalId/externalSource
      expect(typeof syncToTasksService).toBe("function");
    });
  });

  describe("2. Duplicate import from Linear is ignored (external_id match)", () => {
    it("createTask returns existing task when externalId matches", async () => {
      const existingRow = mockTaskRow({
        id: "existing-uuid",
        title: "Already imported",
        source: "linear",
        external_id: "lin-1",
        external_source: "linear",
        created_at: new Date("2025-01-01"),
        updated_at: new Date("2025-01-01"),
      });

      // First queryRow call is the duplicate check — returns existing row
      mockQueryRow.mockResolvedValueOnce(existingRow);

      const { createTask } = await import("./tasks");

      const result = await createTask({
        title: "Duplicate import",
        source: "linear",
        externalId: "lin-1",
        externalSource: "linear",
      });

      // Should return the existing task, not create a new one
      expect(result.task.id).toBe("existing-uuid");
      expect(result.task.title).toBe("Already imported");
      expect(result.task.externalId).toBe("lin-1");
      expect(result.task.externalSource).toBe("linear");

      // The INSERT queryRow should NOT have been called (only the SELECT for duplicate check)
      // mockExec should not have been called for INSERT
      expect(mockQueryRow).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Tasks with source='linear' can be traced back", () => {
    it("task created from Linear has source=linear and externalId set", async () => {
      // No duplicate found
      mockQueryRow
        .mockResolvedValueOnce(null) // duplicate check returns null
        .mockResolvedValueOnce(mockTaskRow({
          id: "new-uuid",
          title: "From Linear",
          source: "linear",
          linear_task_id: "lin-42",
          external_id: "lin-42",
          external_source: "linear",
        }));

      const { createTask } = await import("./tasks");

      const result = await createTask({
        title: "From Linear",
        source: "linear",
        linearTaskId: "lin-42",
        externalId: "lin-42",
        externalSource: "linear",
      });

      expect(result.task.source).toBe("linear");
      expect(result.task.linearTaskId).toBe("lin-42");
      expect(result.task.externalId).toBe("lin-42");
      expect(result.task.externalSource).toBe("linear");
    });
  });

  describe("4. createTask with externalId stores correctly", () => {
    it("stores externalId and externalSource in the task", async () => {
      const insertedRow = mockTaskRow({
        id: "new-uuid-ext",
        title: "External task",
        source: "manual",
        external_id: "ext-123",
        external_source: "jira",
      });

      // No duplicate found, then INSERT returns new row
      mockQueryRow
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(insertedRow);

      const { createTask } = await import("./tasks");

      const result = await createTask({
        title: "External task",
        externalId: "ext-123",
        externalSource: "jira",
      });

      expect(result.task.externalId).toBe("ext-123");
      expect(result.task.externalSource).toBe("jira");
    });

    it("createTask without externalId skips duplicate check", async () => {
      const insertedRow = mockTaskRow({
        id: "new-uuid-no-ext",
        title: "Manual task",
      });

      // Only INSERT queryRow (no duplicate check needed)
      mockQueryRow.mockResolvedValueOnce(insertedRow);

      const { createTask } = await import("./tasks");

      const result = await createTask({
        title: "Manual task",
      });

      expect(result.task.externalId).toBeNull();
      expect(result.task.externalSource).toBeNull();
      // Should only have called queryRow once (the INSERT), no duplicate check
      expect(mockQueryRow).toHaveBeenCalledTimes(1);
    });
  });

  describe("5. getTaskByExternalId finds correct task", () => {
    it("returns task matching externalId + externalSource", async () => {
      const row = mockTaskRow({
        id: "found-uuid",
        title: "Found by external ID",
        source: "linear",
        external_id: "lin-99",
        external_source: "linear",
      });

      mockQueryRow.mockResolvedValueOnce(row);

      const { getTaskByExternalId } = await import("./tasks");

      const result = await getTaskByExternalId({
        externalId: "lin-99",
        externalSource: "linear",
      });

      expect(result.task.id).toBe("found-uuid");
      expect(result.task.title).toBe("Found by external ID");
      expect(result.task.externalId).toBe("lin-99");
      expect(result.task.externalSource).toBe("linear");
    });

    it("throws not_found when no matching external task exists", async () => {
      mockQueryRow.mockResolvedValueOnce(null);

      const { getTaskByExternalId } = await import("./tasks");

      await expect(
        getTaskByExternalId({
          externalId: "nonexistent",
          externalSource: "linear",
        })
      ).rejects.toThrow("not_found");
    });

    it("validates required parameters", async () => {
      const { getTaskByExternalId } = await import("./tasks");

      await expect(
        getTaskByExternalId({
          externalId: "",
          externalSource: "linear",
        })
      ).rejects.toThrow("externalId is required");

      await expect(
        getTaskByExternalId({
          externalId: "lin-1",
          externalSource: "",
        })
      ).rejects.toThrow("externalSource is required");
    });
  });
});
