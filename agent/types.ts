// DEL 2A: Meta-reasoning types for the agent loop

export interface DiagnosisResult {
  rootCause: 'bad_plan' | 'implementation_error' | 'missing_context' | 'impossible_task' | 'environment_error';
  reason: string;
  suggestedAction: 'revise_plan' | 'fix_code' | 'fetch_more_context' | 'escalate_to_human' | 'retry';
  confidence: number; // 0-1
}

export interface AgentExecutionContext {
  conversationId: string;
  taskId: string;
  taskDescription: string;
  userMessage: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  // Model routing
  modelMode: 'auto' | 'manual';
  modelOverride?: string;
  selectedModel: string;
  totalCostUsd: number;
  totalTokensUsed: number;
  // Meta-reasoning
  attemptHistory: AttemptRecord[];
  errorPatterns: ErrorPattern[];
  totalAttempts: number;
  maxAttempts: number; // 5
  planRevisions: number;
  maxPlanRevisions: number; // 2
}

export interface AttemptRecord {
  stepIndex: number;
  action: string;
  result: 'success' | 'failure';
  error?: string;
  duration: number;
  tokensUsed: number;
}

export interface ErrorPattern {
  pattern: string;
  frequency: number;
  lastSeen: string;
  knownFix?: string;
}
