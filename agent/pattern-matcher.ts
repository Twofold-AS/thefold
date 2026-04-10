// --- Types ---

export interface PatternMatch {
  strategy: "fast_path" | "standard" | "careful";
  preferredModel: string;
  skipConfidence: boolean;
  skipComplexity: boolean;
  skipPlan: boolean;
  patternName: string;
  confidence: number;
}

// --- Model constants ---

const FAST_MODEL = "claude-haiku-4-5";
const STANDARD_MODEL = "claude-sonnet-4-5";

// --- Pattern definitions ---

interface TaskPattern {
  name: string;
  /** Regex tested against lowercased task description */
  regex: RegExp;
  strategy: PatternMatch["strategy"];
  preferredModel: string;
  skipConfidence: boolean;
  skipComplexity: boolean;
  skipPlan: boolean;
  confidence: number;
}

/**
 * Ordered list of task patterns.
 * Earlier entries take priority when multiple patterns match.
 * fast_path patterns use haiku; standard/careful use sonnet.
 */
const TASK_PATTERNS: TaskPattern[] = [
  // --- Fast-path: typo / spelling / rename ---
  {
    name: "typo_or_spelling",
    regex: /\b(typo|spelling|misspell|rename\s+\w+\s+to|fix\s+\w+\s+name)\b/,
    strategy: "fast_path",
    preferredModel: FAST_MODEL,
    skipConfidence: true,
    skipComplexity: true,
    skipPlan: true,
    confidence: 0.90,
  },

  // --- Fast-path: add / fix missing import ---
  {
    name: "missing_import",
    regex: /\b(add\s+import|missing\s+import|fix\s+import|import\s+missing|cannot\s+find\s+module)\b/,
    strategy: "fast_path",
    preferredModel: FAST_MODEL,
    skipConfidence: true,
    skipComplexity: true,
    skipPlan: true,
    confidence: 0.88,
  },

  // --- Fast-path: update version / dependency bump ---
  {
    name: "version_or_dep_update",
    regex: /\b(bump\s+(version|dep)|update\s+(version|dependency|package|dep)|upgrade\s+\w+\s+to\s+v?\d|version\s+bump)\b/,
    strategy: "fast_path",
    preferredModel: FAST_MODEL,
    skipConfidence: true,
    skipComplexity: true,
    skipPlan: false,
    confidence: 0.87,
  },

  // --- Fast-path: update / fix single constant or config value ---
  {
    name: "single_constant_update",
    regex: /\b(change\s+(the\s+)?(value|constant|config|env|env\s+var)\s+of|update\s+(the\s+)?(constant|config\s+value|env\s+var))\b/,
    strategy: "fast_path",
    preferredModel: FAST_MODEL,
    skipConfidence: true,
    skipComplexity: true,
    skipPlan: true,
    confidence: 0.86,
  },

  // --- Standard: database migration / schema change ---
  {
    name: "database_migration",
    regex: /\b(creat[e|ing]\s+(a\s+)?(migration|table|index|column)|add\s+(a\s+)?column|alter\s+table|db\s+migration|schema\s+change|run\s+migration)\b/,
    strategy: "standard",
    preferredModel: STANDARD_MODEL,
    skipConfidence: false,
    skipComplexity: false,
    skipPlan: false,
    confidence: 0.82,
  },

  // --- Standard: add / fix existing endpoint ---
  {
    name: "api_endpoint_fix",
    regex: /\b(fix\s+(the\s+)?api|fix\s+(the\s+)?endpoint|update\s+(the\s+)?endpoint|add\s+(a\s+)?query\s+param|add\s+(a\s+)?header)\b/,
    strategy: "standard",
    preferredModel: STANDARD_MODEL,
    skipConfidence: false,
    skipComplexity: false,
    skipPlan: false,
    confidence: 0.80,
  },

  // --- Careful: new feature / component / service ---
  {
    name: "new_feature_or_component",
    regex: /\b(build\s+(a\s+)?(new\s+)?(feature|component|service|module|page)|implement\s+(a\s+)?(new\s+)?(feature|component|service)|creat[e|ing]\s+(a\s+)?(new\s+)?(service|module|page|component))\b/,
    strategy: "careful",
    preferredModel: STANDARD_MODEL,
    skipConfidence: false,
    skipComplexity: false,
    skipPlan: false,
    confidence: 0.78,
  },

  // --- Careful: refactor / restructure ---
  {
    name: "refactor",
    regex: /\b(refactor|restructure|reorganize|rewrite|clean\s+up)\b/,
    strategy: "careful",
    preferredModel: STANDARD_MODEL,
    skipConfidence: false,
    skipComplexity: false,
    skipPlan: false,
    confidence: 0.75,
  },
];

// --- matchPattern ---

/**
 * Match a task description against known patterns.
 * Returns the first matching PatternMatch, or null if no pattern matches.
 * Patterns are tested in order; earlier entries take priority.
 */
export function matchPattern(taskDescription: string): PatternMatch | null {
  if (!taskDescription || taskDescription.trim().length === 0) {
    return null;
  }

  const desc = taskDescription.toLowerCase();

  for (const pattern of TASK_PATTERNS) {
    if (pattern.regex.test(desc)) {
      return {
        strategy: pattern.strategy,
        preferredModel: pattern.preferredModel,
        skipConfidence: pattern.skipConfidence,
        skipComplexity: pattern.skipComplexity,
        skipPlan: pattern.skipPlan,
        patternName: pattern.name,
        confidence: pattern.confidence,
      };
    }
  }

  return null;
}

/**
 * Derive a stable regex string from a matched pattern name.
 * Used when promoting a task to the decision cache.
 */
export function getPatternRegex(patternName: string): string | null {
  const found = TASK_PATTERNS.find((p) => p.name === patternName);
  return found ? found.regex.source : null;
}
