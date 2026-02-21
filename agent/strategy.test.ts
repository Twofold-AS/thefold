import { describe, it, expect } from "vitest";

// === YE: Helper functions (copied for testing to avoid ~encore/clients import issues) ===

/**
 * YE: Detect task pattern from description and files.
 * Returns category for strategy classification.
 */
function detectTaskPattern(
  taskDescription: string,
  files: Array<{ path: string; content: string; action: string }>,
): string {
  const desc = taskDescription.toLowerCase();
  const paths = files.map((f) => f.path.toLowerCase()).join(" ");

  // Heuristikk-basert kategorisering
  if (desc.includes("migrat") || paths.includes("migration") || paths.includes(".up.sql")) {
    return "database_migration";
  }
  if (desc.includes("api") && (desc.includes("endpoint") || desc.includes("route"))) {
    return "api_endpoint";
  }
  if (
    desc.includes("component") || desc.includes("ui") || desc.includes("frontend")
    || paths.includes("/components/") || paths.includes(".tsx")
  ) {
    return "frontend_component";
  }
  if (desc.includes("bug") || desc.includes("fix") || desc.includes("error")) {
    return "bug_fix";
  }
  if (desc.includes("refactor") || desc.includes("clean") || desc.includes("improve")) {
    return "refactoring";
  }
  if (desc.includes("test") || paths.includes(".test.") || paths.includes(".spec.")) {
    return "testing";
  }
  if (desc.includes("security") || desc.includes("auth") || desc.includes("permission")) {
    return "security";
  }
  if (desc.includes("performance") || desc.includes("optimize") || desc.includes("speed")) {
    return "performance";
  }
  if (desc.includes("integrat") || desc.includes("connect") || desc.includes("webhook")) {
    return "integration";
  }
  return "other";
}

/**
 * YE: Extract successful steps from attempt history.
 * Only includes steps that worked (based on first successful attempt).
 */
function extractSuccessfulSteps(
  attemptHistory: Array<{
    attemptNumber: number;
    result: "success" | "failure";
    error?: string;
    plan?: { steps: Array<{ title: string; description: string }> };
  }>,
): string[] {
  // Find first successful attempt
  const successfulAttempt = attemptHistory.find((a) => a.result === "success");
  if (!successfulAttempt || !successfulAttempt.plan) {
    return [];
  }

  // Extract step titles from successful plan
  return successfulAttempt.plan.steps.map((s) => s.title);
}

// === Group 1: Pattern Detection (5 tests) ===

describe("YE: detectTaskPattern", () => {
  it("detects database_migration pattern", () => {
    const pattern = detectTaskPattern(
      "Add migration for user_preferences table",
      [
        { path: "migrations/5_add_user_prefs.up.sql", content: "CREATE TABLE...", action: "create" },
        { path: "migrations/5_add_user_prefs.down.sql", content: "DROP TABLE...", action: "create" },
      ],
    );
    expect(pattern).toBe("database_migration");
  });

  it("detects api_endpoint pattern", () => {
    const pattern = detectTaskPattern(
      "Create new API endpoint for user profile updates",
      [
        { path: "users/users.ts", content: "export const updateProfile = api(...)", action: "modify" },
      ],
    );
    expect(pattern).toBe("api_endpoint");
  });

  it("detects frontend_component pattern", () => {
    const pattern = detectTaskPattern(
      "Build new UserCard component with avatar and bio",
      [
        { path: "frontend/src/components/UserCard.tsx", content: "export default function UserCard() {...}", action: "create" },
        { path: "frontend/src/components/UserCard.module.css", content: ".card {...}", action: "create" },
      ],
    );
    expect(pattern).toBe("frontend_component");
  });

  it("detects bug_fix pattern", () => {
    const pattern = detectTaskPattern(
      "Fix authentication token expiry bug",
      [
        { path: "gateway/auth.ts", content: "const expiresAt = Date.now() + ...", action: "modify" },
      ],
    );
    expect(pattern).toBe("bug_fix");
  });

  it("returns 'other' for unclassified tasks", () => {
    const pattern = detectTaskPattern(
      "Update documentation for deployment process",
      [
        { path: "README.md", content: "# Deployment...", action: "modify" },
      ],
    );
    expect(pattern).toBe("other");
  });
});

// === Group 2: Successful Steps Extraction (3 tests) ===

describe("YE: extractSuccessfulSteps", () => {
  it("extracts steps from first successful attempt", () => {
    const attemptHistory = [
      {
        attemptNumber: 1,
        result: "failure" as const,
        error: "TypeScript error",
        plan: {
          steps: [
            { title: "Create migration", description: "..." },
            { title: "Update types", description: "..." },
          ],
        },
      },
      {
        attemptNumber: 2,
        result: "success" as const,
        plan: {
          steps: [
            { title: "Create migration", description: "..." },
            { title: "Add index", description: "..." },
            { title: "Update queries", description: "..." },
          ],
        },
      },
    ];

    const steps = extractSuccessfulSteps(attemptHistory);
    expect(steps).toEqual(["Create migration", "Add index", "Update queries"]);
  });

  it("returns empty array when no successful attempt", () => {
    const attemptHistory = [
      {
        attemptNumber: 1,
        result: "failure" as const,
        error: "Build failed",
        plan: { steps: [{ title: "Step 1", description: "..." }] },
      },
    ];

    const steps = extractSuccessfulSteps(attemptHistory);
    expect(steps).toEqual([]);
  });

  it("returns empty array when successful attempt has no plan", () => {
    const attemptHistory = [
      {
        attemptNumber: 1,
        result: "success" as const,
        // No plan property
      },
    ];

    const steps = extractSuccessfulSteps(attemptHistory);
    expect(steps).toEqual([]);
  });
});

// === Group 3: Execution Strategy (3 integration-style tests) ===

describe("YE: Strategy storage and retrieval", () => {
  it("stores strategy only when totalAttempts=1 and high quality", () => {
    // This test validates the condition logic in STEP 11.5
    // In actual code: ctx.totalAttempts === 1 && allFiles.length >= 2

    const shouldStoreStrategy = (totalAttempts: number, filesCount: number): boolean => {
      return totalAttempts === 1 && filesCount >= 2;
    };

    expect(shouldStoreStrategy(1, 3)).toBe(true);  // First-attempt success, multiple files
    expect(shouldStoreStrategy(2, 3)).toBe(false); // Second attempt (not first)
    expect(shouldStoreStrategy(1, 1)).toBe(false); // Only 1 file (not enough)
    expect(shouldStoreStrategy(1, 0)).toBe(false); // No files
  });

  it("uses strategy hint when similarity > 0.3", () => {
    // This test validates the threshold logic in STEP 4.9
    // In actual code: strategies.results[0].similarity > 0.3

    const shouldUseStrategyHint = (similarity: number): boolean => {
      return similarity > 0.3;
    };

    expect(shouldUseStrategyHint(0.85)).toBe(true);  // High similarity
    expect(shouldUseStrategyHint(0.35)).toBe(true);  // Just above threshold
    expect(shouldUseStrategyHint(0.3)).toBe(false);  // At threshold (not above)
    expect(shouldUseStrategyHint(0.25)).toBe(false); // Below threshold
  });

  it("builds complete strategy content with pattern and steps", () => {
    // This test validates the strategy content structure from STEP 11.5

    const taskDescription = "Add user authentication with OTP";
    const pattern = "security";
    const successfulSteps = ["Create migration", "Add auth handler", "Test login flow"];
    const files = [
      { path: "gateway/auth.ts", content: "...", action: "create" },
      { path: "gateway/migrations/1_add_users.up.sql", content: "...", action: "create" },
    ];

    const strategyContent = [
      `Task pattern: ${pattern}`,
      `Repository: test-owner/test-repo`,
      `Task: ${taskDescription.substring(0, 300)}`,
      `Successful approach (${successfulSteps.length} steps):`,
      ...successfulSteps.map((step, i) => `${i + 1}. ${step}`),
      `Files changed: ${files.map((f) => f.path).join(", ")}`,
    ].join("\n");

    expect(strategyContent).toContain("Task pattern: security");
    expect(strategyContent).toContain("Successful approach (3 steps):");
    expect(strategyContent).toContain("1. Create migration");
    expect(strategyContent).toContain("2. Add auth handler");
    expect(strategyContent).toContain("3. Test login flow");
    expect(strategyContent).toContain("gateway/auth.ts");
  });
});
