import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { execSync, exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const githubToken = secret("GitHubToken");

// Sandboxes are directories on the VPS, isolated by unique IDs
// In production, use Docker containers for full isolation
const SANDBOX_ROOT = "/tmp/thefold-sandboxes";

// --- Types ---

interface CreateRequest {
  repoOwner: string;
  repoName: string;
  ref?: string;
}

interface CreateResponse {
  id: string;
}

interface WriteFileRequest {
  sandboxId: string;
  path: string;
  content: string;
}

interface DeleteFileRequest {
  sandboxId: string;
  path: string;
}

interface RunCommandRequest {
  sandboxId: string;
  command: string;
  timeout?: number;
}

interface RunCommandResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ValidateRequest {
  sandboxId: string;
}

interface ValidateResponse {
  success: boolean;
  output: string;
  errors: string[];
}

interface DestroyRequest {
  sandboxId: string;
}

interface DestroyResponse {
  destroyed: boolean;
}

// --- Helpers ---

function sandboxPath(id: string): string {
  // Prevent directory traversal
  if (id.includes("..") || id.includes("/")) {
    throw APIError.invalidArgument("invalid sandbox ID");
  }
  return path.join(SANDBOX_ROOT, id);
}

function ensureSandboxExists(id: string): string {
  const dir = sandboxPath(id);
  if (!fs.existsSync(dir)) {
    throw APIError.notFound(`sandbox ${id} not found`);
  }
  return dir;
}

// --- Endpoints ---

// Create a new sandbox with the repo cloned
export const create = api(
  { method: "POST", path: "/sandbox/create", expose: false },
  async (req: CreateRequest): Promise<CreateResponse> => {
    const id = crypto.randomUUID();
    const dir = sandboxPath(id);
    const ref = req.ref || "main";

    fs.mkdirSync(dir, { recursive: true });

    try {
      // Clone the repo into the sandbox
      const cloneUrl = `https://x-access-token:${githubToken()}@github.com/${req.repoOwner}/${req.repoName}.git`;
      execSync(`git clone --depth 1 --branch ${ref} ${cloneUrl} ${dir}/repo`, {
        timeout: 120_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });

      // Install dependencies
      execSync("npm install --ignore-scripts", {
        cwd: `${dir}/repo`,
        timeout: 120_000,
      });
    } catch (error) {
      // Clean up on failure
      fs.rmSync(dir, { recursive: true, force: true });
      const msg = error instanceof Error ? error.message : String(error);
      throw APIError.internal(`failed to create sandbox: ${msg}`);
    }

    return { id };
  }
);

// Write a file to the sandbox
export const writeFile = api(
  { method: "POST", path: "/sandbox/write", expose: false },
  async (req: WriteFileRequest): Promise<{ written: boolean }> => {
    const dir = ensureSandboxExists(req.sandboxId);
    const filePath = path.join(dir, "repo", req.path);

    // Prevent writing outside sandbox
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(dir))) {
      throw APIError.invalidArgument("path escapes sandbox");
    }

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, req.content, "utf-8");

    return { written: true };
  }
);

// Delete a file from the sandbox
export const deleteFile = api(
  { method: "POST", path: "/sandbox/delete-file", expose: false },
  async (req: DeleteFileRequest): Promise<{ deleted: boolean }> => {
    const dir = ensureSandboxExists(req.sandboxId);
    const filePath = path.join(dir, "repo", req.path);

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(dir))) {
      throw APIError.invalidArgument("path escapes sandbox");
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return { deleted: true };
  }
);

// Run a command in the sandbox
export const runCommand = api(
  { method: "POST", path: "/sandbox/run", expose: false },
  async (req: RunCommandRequest): Promise<RunCommandResponse> => {
    const dir = ensureSandboxExists(req.sandboxId);
    const timeout = (req.timeout || 30) * 1000;

    // Whitelist safe commands
    const safeCommands = [
      "npm install",
      "npm test",
      "npm run",
      "npx tsc",
      "npx eslint",
      "node",
      "cat",
      "ls",
      "find",
    ];

    const isSafe = safeCommands.some((cmd) => req.command.startsWith(cmd));
    if (!isSafe) {
      throw APIError.invalidArgument(
        `command not allowed: ${req.command}. Allowed: ${safeCommands.join(", ")}`
      );
    }

    return new Promise((resolve) => {
      exec(
        req.command,
        { cwd: `${dir}/repo`, timeout, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolve({
            stdout: stdout.toString().substring(0, 50_000),
            stderr: stderr.toString().substring(0, 50_000),
            exitCode: error?.code ?? 0,
          });
        }
      );
    });
  }
);

// --- Validation Pipeline (DEL 3A) ---

interface ValidationStepResult {
  step: string;
  success: boolean;
  errors: string[];
  warnings: string[];
  metrics?: Record<string, number>;
}

interface ValidationPipelineResult {
  success: boolean;
  steps: ValidationStepResult[];
  totalDuration: number;
}

async function runTypeCheck(repoDir: string): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const tscResult = execSync("npx tsc --noEmit 2>&1", {
      cwd: repoDir,
      timeout: 60_000,
    }).toString();
    if (tscResult.includes("warning")) {
      warnings.push(tscResult.substring(0, 500));
    }
  } catch (error: any) {
    const tscOutput = error.stdout?.toString() || error.message;
    errors.push(tscOutput.substring(0, 2000));
  }

  return { step: "typecheck", success: errors.length === 0, errors, warnings };
}

async function runLint(repoDir: string): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const eslintResult = execSync("npx eslint . --no-error-on-unmatched-pattern 2>&1", {
      cwd: repoDir,
      timeout: 60_000,
    }).toString();
    if (eslintResult.includes("warning")) {
      warnings.push(eslintResult.substring(0, 500));
    }
  } catch (error: any) {
    const eslintOutput = error.stdout?.toString() || error.message;
    errors.push(eslintOutput.substring(0, 2000));
  }

  return { step: "lint", success: errors.length === 0, errors, warnings };
}

async function runTests(repoDir: string): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metrics: Record<string, number> = {};

  // Check if tests exist
  const hasTestConfig =
    fs.existsSync(`${repoDir}/jest.config.ts`) ||
    fs.existsSync(`${repoDir}/jest.config.js`) ||
    fs.existsSync(`${repoDir}/vitest.config.ts`) ||
    fs.existsSync(`${repoDir}/vitest.config.js`);

  // Check package.json for test script
  let hasTestScript = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(`${repoDir}/package.json`, "utf-8"));
    hasTestScript = !!pkg.scripts?.test;
  } catch { /* no package.json */ }

  if (!hasTestConfig && !hasTestScript) {
    return { step: "test", success: true, errors, warnings: ["No test configuration found — skipped"], metrics };
  }

  try {
    const testResult = execSync("npm test --if-present 2>&1", {
      cwd: repoDir,
      timeout: 120_000,
    }).toString();

    // Try to parse test counts from output
    const passMatch = testResult.match(/(\d+)\s+pass/i);
    const failMatch = testResult.match(/(\d+)\s+fail/i);
    if (passMatch) metrics.testsPassed = parseInt(passMatch[1]);
    if (failMatch) metrics.testsFailed = parseInt(failMatch[1]);
  } catch (error: any) {
    const testOutput = error.stdout?.toString() || error.message;
    errors.push(testOutput.substring(0, 2000));

    const failMatch = testOutput.match(/(\d+)\s+fail/i);
    if (failMatch) metrics.testsFailed = parseInt(failMatch[1]);
  }

  return { step: "test", success: errors.length === 0, errors, warnings, metrics };
}

async function runSnapshotComparison(_repoDir: string): Promise<ValidationStepResult> {
  return { step: "snapshot", success: true, errors: [], warnings: ["Snapshot comparison not yet enabled"] };
}

async function runPerformanceBenchmark(_repoDir: string): Promise<ValidationStepResult> {
  return { step: "performance", success: true, errors: [], warnings: ["Performance benchmarks not yet enabled"] };
}

interface PipelineStep {
  name: string;
  enabled: boolean;
  run: (repoDir: string) => Promise<ValidationStepResult>;
}

const VALIDATION_PIPELINE: PipelineStep[] = [
  { name: "typecheck", enabled: true, run: runTypeCheck },
  { name: "lint", enabled: true, run: runLint },
  { name: "test", enabled: true, run: runTests },
  { name: "snapshot", enabled: false, run: runSnapshotComparison },
  { name: "performance", enabled: false, run: runPerformanceBenchmark },
];

// Validate the sandbox code via pipeline
export const validate = api(
  { method: "POST", path: "/sandbox/validate", expose: false },
  async (req: ValidateRequest): Promise<ValidateResponse> => {
    const dir = ensureSandboxExists(req.sandboxId);
    const repoDir = `${dir}/repo`;
    const pipelineStart = Date.now();

    const steps: ValidationStepResult[] = [];
    const allErrors: string[] = [];

    for (const step of VALIDATION_PIPELINE) {
      if (!step.enabled) {
        const stub = await step.run(repoDir);
        steps.push(stub);
        continue;
      }

      const result = await step.run(repoDir);
      steps.push(result);
      allErrors.push(...result.errors);
    }

    const pipelineResult: ValidationPipelineResult = {
      success: allErrors.length === 0,
      steps,
      totalDuration: Date.now() - pipelineStart,
    };

    // Build output string for backward compatibility
    let output = "";
    for (const step of steps) {
      if (step.errors.length > 0) {
        output += `=== ${step.step.toUpperCase()} ERRORS ===\n${step.errors.join("\n")}\n\n`;
      } else if (step.warnings.length > 0) {
        output += `=== ${step.step.toUpperCase()} ===\n${step.warnings.join("\n")}\n\n`;
      } else {
        output += `=== ${step.step.toUpperCase()} ===\nNo errors\n\n`;
      }
    }
    output += `Pipeline duration: ${pipelineResult.totalDuration}ms`;

    return {
      success: pipelineResult.success,
      output: output.substring(0, 100_000),
      errors: allErrors,
    };
  }
);

// Validate a single file incrementally (typecheck only, much faster than full validate)
interface ValidateIncrementalRequest {
  sandboxId: string;
  filePath: string;
}

interface ValidateIncrementalResponse {
  success: boolean;
  filePath: string;
  output: string;
  errors: string[];
  durationMs: number;
}

export const validateIncremental = api(
  { method: "POST", path: "/sandbox/validate-incremental", expose: false },
  async (req: ValidateIncrementalRequest): Promise<ValidateIncrementalResponse> => {
    const dir = ensureSandboxExists(req.sandboxId);
    const repoDir = `${dir}/repo`;
    const start = Date.now();
    const errors: string[] = [];
    let output = "";

    // Validate that the file exists
    const fullPath = path.join(repoDir, req.filePath);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(dir))) {
      throw APIError.invalidArgument("path escapes sandbox");
    }

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        filePath: req.filePath,
        output: `File not found: ${req.filePath}`,
        errors: [`File not found: ${req.filePath}`],
        durationMs: Date.now() - start,
      };
    }

    // Only typecheck .ts/.tsx files
    if (!req.filePath.endsWith(".ts") && !req.filePath.endsWith(".tsx")) {
      return {
        success: true,
        filePath: req.filePath,
        output: "Skipped: not a TypeScript file",
        errors: [],
        durationMs: Date.now() - start,
      };
    }

    // Run tsc --noEmit on the specific file
    // We use the project's tsconfig but check only this file
    try {
      const tscResult = execSync(
        `npx tsc --noEmit --pretty false 2>&1 | grep -i "${req.filePath}" || true`,
        {
          cwd: repoDir,
          timeout: 30_000,
        }
      ).toString().trim();

      if (tscResult.length === 0) {
        output = `No TypeScript errors in ${req.filePath}`;
      } else {
        output = tscResult;
        // Parse individual errors
        const lines = tscResult.split("\n").filter((l) => l.includes("error TS"));
        errors.push(...lines.map((l) => l.substring(0, 500)));
      }
    } catch (error: any) {
      // tsc returns non-zero on errors — capture and filter for this file
      const fullOutput = error.stdout?.toString() || error.message || "";
      const fileErrors = fullOutput
        .split("\n")
        .filter((line: string) => line.includes(req.filePath))
        .join("\n")
        .trim();

      if (fileErrors.length > 0) {
        output = fileErrors;
        const errorLines = fileErrors.split("\n").filter((l: string) => l.includes("error TS"));
        errors.push(...errorLines.map((l: string) => l.substring(0, 500)));
      } else {
        // No errors specific to this file — other files may have errors
        output = `No TypeScript errors in ${req.filePath}`;
      }
    }

    return {
      success: errors.length === 0,
      filePath: req.filePath,
      output: output.substring(0, 10_000),
      errors,
      durationMs: Date.now() - start,
    };
  }
);

// Destroy a sandbox
export const destroy = api(
  { method: "POST", path: "/sandbox/destroy", expose: false },
  async (req: DestroyRequest): Promise<DestroyResponse> => {
    const dir = sandboxPath(req.sandboxId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    return { destroyed: true };
  }
);
