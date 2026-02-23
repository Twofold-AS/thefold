/**
 * Mock-svar for AI-kall brukt i E2E-tester.
 * Returnerer deterministiske svar som simulerer ekte AI-oppførsel.
 */

export interface MockAICall {
  endpoint: string;
  input: Record<string, unknown>;
  response: Record<string, unknown>;
  timestamp: number;
}

// Logg alle mock-kall for assertions i tester
const mockCallLog: MockAICall[] = [];

export function getMockCallLog(): MockAICall[] {
  return [...mockCallLog];
}

export function clearMockCallLog(): void {
  mockCallLog.length = 0;
}

/**
 * Mock-svar for assessConfidence
 */
export function mockAssessConfidence(_input: Record<string, unknown>) {
  mockCallLog.push({
    endpoint: "assessConfidence",
    input: _input,
    response: { overallConfidence: 92, reasoning: "Mock: Task is well-defined" },
    timestamp: Date.now(),
  });

  return {
    confidence: {
      overall: 92,
      reasoning: "Mock: Task is well-defined and straightforward",
      recommended_action: "proceed",
      uncertainties: [],
      clarifying_questions: [],
      suggested_subtasks: [],
    },
    tokensUsed: 500,
    costUsd: 0.001,
    modelUsed: "mock",
  };
}

/**
 * Mock-svar for assessComplexity
 */
export function mockAssessComplexity(_input: Record<string, unknown>) {
  mockCallLog.push({
    endpoint: "assessComplexity",
    input: _input,
    response: { complexity: 3, filesAffected: 1 },
    timestamp: Date.now(),
  });

  return {
    complexity: 3,
    reasoning: "Mock: Simple single-file change",
    filesAffected: 1,
    estimatedTokens: 2000,
    suggestedModel: "claude-sonnet-4-5-20250929",
    tokensUsed: 300,
    costUsd: 0.0005,
    modelUsed: "mock",
  };
}

/**
 * Mock-svar for planTask
 */
export function mockPlanTask(_input: Record<string, unknown>) {
  const result = {
    plan: [
      {
        action: "modify_file" as const,
        filePath: "agent/types.ts",
        description: "Add module documentation comment",
        content: "/**\n * Agent types module.\n */\n\n// Original content preserved",
      },
    ],
    costUsd: 0.003,
    tokensUsed: 800,
    modelUsed: "mock",
  };

  mockCallLog.push({
    endpoint: "planTask",
    input: _input,
    response: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Mock-svar for AI code review
 */
export function mockCodeReview(_input: Record<string, unknown>) {
  const review = {
    documentation: "# Mock Review\n\nChanges look good.",
    qualityScore: 8,
    concerns: [],
    memoriesExtracted: ["Adding documentation comments improves maintainability"],
  };

  mockCallLog.push({
    endpoint: "codeReview",
    input: _input,
    response: review,
    timestamp: Date.now(),
  });

  return review;
}

/**
 * Mock-svar for decomposeProject
 */
export function mockDecomposeProject(_input: Record<string, unknown>) {
  const result = {
    phases: [
      {
        name: "Setup",
        description: "Project initialization",
        tasks: [
          {
            title: "Create project structure",
            description: "Set up base files and configuration",
            contextHints: ["package.json", "tsconfig.json"],
            dependsOnIndices: [],
            estimatedComplexity: "low",
          },
        ],
      },
      {
        name: "Implementation",
        description: "Core feature implementation",
        tasks: [
          {
            title: "Implement user registration",
            description: "Add auth endpoints",
            contextHints: ["users/", "gateway/"],
            dependsOnIndices: [0],
            estimatedComplexity: "medium",
          },
          {
            title: "Build dashboard page",
            description: "Create dashboard UI",
            contextHints: ["frontend/src/app/"],
            dependsOnIndices: [0],
            estimatedComplexity: "medium",
          },
        ],
      },
    ],
    conventions: "Use TypeScript strict mode. Follow Encore.ts patterns.",
    reasoning: "Mock: Decomposed project into setup and implementation phases",
    estimatedTotalTasks: 3,
  };

  mockCallLog.push({
    endpoint: "decomposeProject",
    input: _input,
    response: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Mock callAIWithFallback — det sentrale interceptet.
 */
export function mockCallAIWithFallback(params: {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
}) {
  const content = params.messages[0]?.content ?? "";

  mockCallLog.push({
    endpoint: "callAIWithFallback",
    input: { model: params.model, contentPreview: content.substring(0, 200) },
    response: { content: "Mock AI response" },
    timestamp: Date.now(),
  });

  return {
    content: "Mock AI response: Task completed successfully.",
    tokensUsed: 500,
    modelUsed: params.model,
    costEstimate: { totalCost: 0.001 },
  };
}
