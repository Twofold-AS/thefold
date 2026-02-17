import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import { execSync, exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  createDockerSandbox,
  execInDocker,
  writeFileDocker,
  deleteFileDocker,
  destroyDockerSandbox,
  cleanupOldContainers,
} from "./docker";

const githubToken = secret("GitHubToken");
const sandboxMode = secret("SandboxMode"); // "docker" | "filesystem"

// --- Mode helper ---

function getSandboxMode(): "docker" | "filesystem" {
  try {
    const mode = sandboxMode();
    if (mode === "docker") return "docker";
  } catch {
    // Secret not set — default to filesystem
  }
  return "filesystem";
}

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
    if (getSandboxMode() === "docker") {
      const id = await createDockerSandbox({
        repoOwner: req.repoOwner,
        repoName: req.repoName,
        ref: req.ref,
        githubToken: githubToken(),
      });
      return { id };
    }

    // --- Filesystem mode (default for development) ---
    const id = crypto.randomUUID();
    const dir = sandboxPath(id);
    const ref = req.ref || "main";

    fs.mkdirSync(dir, { recursive: true });

    try {
      // Clone the repo into the sandbox
      const cloneUrl = `https://x-access-token:${githubToken()}@github.com/${req.repoOwner}/${req.repoName}.git`;

      // Try clone with branch, fallback for empty repos
      const repoPath = `${dir}/repo`;
      try {
        execSync(`git clone --depth 1 --branch ${ref} ${cloneUrl} ${repoPath}`, {
          timeout: 120_000,
          stdio: "pipe",
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        console.log("[DEBUG-AJ] Clone with branch succeeded");
      } catch {
        console.warn(`[DEBUG-AJ] Clone with --branch ${ref} failed, cleaning up...`);

        // Delete partial directory from failed clone
        if (fs.existsSync(repoPath)) {
          fs.rmSync(repoPath, { recursive: true, force: true });
        }

        try {
          execSync(`git clone ${cloneUrl} ${repoPath}`, {
            timeout: 120_000,
            stdio: "pipe",
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
          });
          console.log("[DEBUG-AJ] Clone without branch succeeded");
        } catch {
          console.warn("[DEBUG-AJ] Clone without branch failed, creating empty repo...");

          // Delete partial directory again
          if (fs.existsSync(repoPath)) {
            fs.rmSync(repoPath, { recursive: true, force: true });
          }

          fs.mkdirSync(repoPath, { recursive: true });
          execSync("git init", { cwd: repoPath, stdio: "pipe" });
          execSync(`git remote add origin ${cloneUrl}`, { cwd: repoPath, stdio: "pipe" });
          fs.writeFileSync(path.join(repoPath, ".gitkeep"), "");
          execSync("git add .", { cwd: repoPath, stdio: "pipe" });
          execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: "pipe" });
          console.log("[DEBUG-AJ] Empty repo created with git init");
        }
      }

      // Install dependencies (if package.json exists)
      if (fs.existsSync(`${dir}/repo/package.json`)) {
        execSync("npm install --ignore-scripts", {
          cwd: `${dir}/repo`,
          timeout: 120_000,
        });
      }
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
    // Path traversal check (applies to both modes)
    if (req.path.includes("..")) {
      throw APIError.invalidArgument("path escapes sandbox");
    }

    if (getSandboxMode() === "docker") {
      await writeFileDocker(req.sandboxId, req.path, req.content);
      return { written: true };
    }

    // --- Filesystem mode ---
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
    if (req.path.includes("..")) {
      throw APIError.invalidArgument("path escapes sandbox");
    }

    if (getSandboxMode() === "docker") {
      await deleteFileDocker(req.sandboxId, req.path);
      return { deleted: true };
    }

    // --- Filesystem mode ---
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

    if (getSandboxMode() === "docker") {
      return execInDocker(req.sandboxId, `cd /workspace/repo && ${req.command}`, timeout);
    }

    // --- Filesystem mode ---
    const dir = ensureSandboxExists(req.sandboxId);

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

// Command runner abstraction for filesystem vs docker mode
type CommandRunner = (command: string, timeout: number) => Promise<{ stdout: string; exitCode: number }>;

function filesystemRunner(repoDir: string): CommandRunner {
  return async (command: string, timeout: number) => {
    try {
      const stdout = execSync(`${command} 2>&1`, { cwd: repoDir, timeout }).toString();
      return { stdout, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || error.message || "",
        exitCode: error.status ?? 1,
      };
    }
  };
}

function dockerRunner(sandboxId: string): CommandRunner {
  return async (command: string, timeout: number) => {
    const result = await execInDocker(sandboxId, `cd /workspace/repo && ${command}`, timeout);
    return { stdout: result.stdout || result.stderr, exitCode: result.exitCode };
  };
}

async function runTypeCheck(run: CommandRunner): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = await run("npx tsc --noEmit", 60_000);
  if (result.exitCode === 0) {
    if (result.stdout.includes("warning")) {
      warnings.push(result.stdout.substring(0, 500));
    }
  } else {
    errors.push(result.stdout.substring(0, 2000));
  }

  return { step: "typecheck", success: errors.length === 0, errors, warnings };
}

async function runLint(run: CommandRunner): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const result = await run("npx eslint . --no-error-on-unmatched-pattern", 60_000);
  if (result.exitCode === 0) {
    if (result.stdout.includes("warning")) {
      warnings.push(result.stdout.substring(0, 500));
    }
  } else {
    errors.push(result.stdout.substring(0, 2000));
  }

  return { step: "lint", success: errors.length === 0, errors, warnings };
}

async function runTests(run: CommandRunner, repoDir: string, isDocker: boolean): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metrics: Record<string, number> = {};

  if (!isDocker) {
    // Check if tests exist (filesystem only — in Docker we just try running)
    const hasTestConfig =
      fs.existsSync(`${repoDir}/jest.config.ts`) ||
      fs.existsSync(`${repoDir}/jest.config.js`) ||
      fs.existsSync(`${repoDir}/vitest.config.ts`) ||
      fs.existsSync(`${repoDir}/vitest.config.js`);

    let hasTestScript = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(`${repoDir}/package.json`, "utf-8"));
      hasTestScript = !!pkg.scripts?.test;
    } catch { /* no package.json */ }

    if (!hasTestConfig && !hasTestScript) {
      return { step: "test", success: true, errors, warnings: ["No test configuration found — skipped"], metrics };
    }
  }

  const result = await run("npm test --if-present", 120_000);
  if (result.exitCode === 0) {
    const passMatch = result.stdout.match(/(\d+)\s+pass/i);
    const failMatch = result.stdout.match(/(\d+)\s+fail/i);
    if (passMatch) metrics.testsPassed = parseInt(passMatch[1]);
    if (failMatch) metrics.testsFailed = parseInt(failMatch[1]);
  } else {
    errors.push(result.stdout.substring(0, 2000));
    const failMatch = result.stdout.match(/(\d+)\s+fail/i);
    if (failMatch) metrics.testsFailed = parseInt(failMatch[1]);
  }

  return { step: "test", success: errors.length === 0, errors, warnings, metrics };
}

async function runSnapshotComparison(): Promise<ValidationStepResult> {
  return { step: "snapshot", success: true, errors: [], warnings: ["Snapshot comparison not yet enabled"] };
}

async function runPerformanceBenchmark(): Promise<ValidationStepResult> {
  return { step: "performance", success: true, errors: [], warnings: ["Performance benchmarks not yet enabled"] };
}

interface PipelineStep {
  name: string;
  enabled: boolean;
  run: (runner: CommandRunner, repoDir: string, isDocker: boolean) => Promise<ValidationStepResult>;
}

const VALIDATION_PIPELINE: PipelineStep[] = [
  { name: "typecheck", enabled: true, run: (r) => runTypeCheck(r) },
  { name: "lint", enabled: true, run: (r) => runLint(r) },
  { name: "test", enabled: true, run: (r, d, docker) => runTests(r, d, docker) },
  { name: "snapshot", enabled: false, run: () => runSnapshotComparison() },
  { name: "performance", enabled: false, run: () => runPerformanceBenchmark() },
];

// Validate the sandbox code via pipeline
export const validate = api(
  { method: "POST", path: "/sandbox/validate", expose: false },
  async (req: ValidateRequest): Promise<ValidateResponse> => {
    const isDocker = getSandboxMode() === "docker";
    const dir = isDocker ? "" : ensureSandboxExists(req.sandboxId);
    const repoDir = isDocker ? `/workspace/repo` : `${dir}/repo`;
    const pipelineStart = Date.now();

    const steps: ValidationStepResult[] = [];
    const allErrors: string[] = [];

    const runner = isDocker ? dockerRunner(req.sandboxId) : filesystemRunner(repoDir);

    for (const step of VALIDATION_PIPELINE) {
      if (!step.enabled) {
        const stub = await step.run(runner, repoDir, isDocker);
        steps.push(stub);
        continue;
      }

      const result = await step.run(runner, repoDir, isDocker);
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
    const isDocker = getSandboxMode() === "docker";
    const start = Date.now();
    const errors: string[] = [];
    let output = "";

    // Path traversal check
    if (req.filePath.includes("..")) {
      throw APIError.invalidArgument("path escapes sandbox");
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

    if (isDocker) {
      // Docker mode — run tsc inside container, filter for this file
      const run = dockerRunner(req.sandboxId);
      const result = await run(
        `npx tsc --noEmit --pretty false 2>&1 | grep -i "${req.filePath}" || true`,
        30_000
      );

      if (result.stdout.trim().length === 0) {
        output = `No TypeScript errors in ${req.filePath}`;
      } else {
        output = result.stdout.trim();
        const lines = output.split("\n").filter((l) => l.includes("error TS"));
        errors.push(...lines.map((l) => l.substring(0, 500)));
      }
    } else {
      // Filesystem mode
      const dir = ensureSandboxExists(req.sandboxId);
      const repoDir = `${dir}/repo`;

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

      try {
        const tscResult = execSync(
          `npx tsc --noEmit --pretty false 2>&1 | grep -i "${req.filePath}" || true`,
          { cwd: repoDir, timeout: 30_000 }
        ).toString().trim();

        if (tscResult.length === 0) {
          output = `No TypeScript errors in ${req.filePath}`;
        } else {
          output = tscResult;
          const lines = tscResult.split("\n").filter((l) => l.includes("error TS"));
          errors.push(...lines.map((l) => l.substring(0, 500)));
        }
      } catch (error: any) {
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
          output = `No TypeScript errors in ${req.filePath}`;
        }
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
    if (getSandboxMode() === "docker") {
      await destroyDockerSandbox(req.sandboxId);
      return { destroyed: true };
    }

    // --- Filesystem mode ---
    const dir = sandboxPath(req.sandboxId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    return { destroyed: true };
  }
);

// --- Cleanup Cron (Docker mode) ---

export const cleanupDockerSandboxes = api(
  { method: "POST", path: "/sandbox/cleanup", expose: false },
  async (): Promise<{ removed: number }> => {
    if (getSandboxMode() !== "docker") {
      return { removed: 0 };
    }
    const removed = cleanupOldContainers(30);
    return { removed };
  }
);

const _ = new CronJob("sandbox-cleanup", {
  title: "Cleanup old Docker sandbox containers",
  every: "30m",
  endpoint: cleanupDockerSandboxes,
});
