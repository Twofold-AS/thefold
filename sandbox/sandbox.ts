import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import { execSync, exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import log from "encore.dev/log";
import {
  createDockerSandbox,
  execInDocker,
  writeFileDocker,
  deleteFileDocker,
  destroyDockerSandbox,
  cleanupOldContainers,
} from "./docker";
import { takeSnapshot, takeDockerSnapshot, compareSnapshots, type FileSnapshot, type SnapshotDiff } from "./snapshot";

const githubToken = secret("GitHubToken");
const sandboxMode = secret("SandboxMode"); // "docker" | "filesystem"
const SandboxAdvancedPipeline = secret("SandboxAdvancedPipeline");

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

function isAdvancedPipelineEnabled(): boolean {
  try {
    return SandboxAdvancedPipeline() === "true";
  } catch {
    // Secret not set — default to disabled
    return false;
  }
}

// Sandboxes are directories on the VPS, isolated by unique IDs
// In production, use Docker containers for full isolation
const SANDBOX_ROOT = "/tmp/thefold-sandboxes";

// In-memory snapshot cache (sandboxId → before-snapshot)
const snapshotCache = new Map<string, Map<string, FileSnapshot>>();

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

      // Ta "before" snapshot for Docker mode
      if (isAdvancedPipelineEnabled()) {
        try {
          const runner = dockerRunner(id);
          const snapshot = await takeDockerSnapshot(runner);
          snapshotCache.set(id, snapshot);
          log.info("docker snapshot taken", { sandboxId: id, fileCount: snapshot.size });
        } catch (err) {
          log.warn("docker snapshot capture failed", { sandboxId: id, error: String(err) });
          // Non-critical — continue without snapshot
        }
      }

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

      // Ta "before" snapshot for fremtidig sammenligning
      if (isAdvancedPipelineEnabled()) {
        try {
          const repoDir = path.join(dir, "repo");
          const snapshot = takeSnapshot(repoDir);
          snapshotCache.set(id, snapshot);
          log.info("sandbox snapshot taken", { sandboxId: id, fileCount: snapshot.size });
        } catch (err) {
          log.warn("snapshot capture failed", { sandboxId: id, error: String(err) });
          // Non-critical — continue without snapshot
        }
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

async function runTypeCheck(run: CommandRunner, repoDir: string, isDocker: boolean): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Skip typecheck if project doesn't use TypeScript
  if (!isDocker) {
    const hasTsConfig = fs.existsSync(path.join(repoDir, "tsconfig.json"));
    const hasPackageJson = fs.existsSync(path.join(repoDir, "package.json"));
    let hasTsDep = false;
    if (hasPackageJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf-8"));
        hasTsDep = !!(pkg.devDependencies?.typescript || pkg.dependencies?.typescript);
      } catch {}
    }
    if (!hasTsConfig && !hasTsDep) {
      return { step: "typecheck", success: true, errors: [], warnings: ["Skipped — no TypeScript config or dependency"] };
    }
  } else {
    // Docker: check via command
    const check = await run("test -f tsconfig.json && echo YES || echo NO", 5_000);
    if (check.stdout.trim() === "NO") {
      return { step: "typecheck", success: true, errors: [], warnings: ["Skipped — no TypeScript config"] };
    }
  }

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

async function runLint(run: CommandRunner, repoDir: string, isDocker: boolean): Promise<ValidationStepResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Skip lint if no ESLint config exists
  const eslintConfigs = ["eslint.config.js", "eslint.config.mjs", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc"];
  if (!isDocker) {
    const hasEslintConfig = eslintConfigs.some(f => fs.existsSync(path.join(repoDir, f)));
    let hasEslintInPkg = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf-8"));
      hasEslintInPkg = !!pkg.eslintConfig || !!(pkg.devDependencies?.eslint || pkg.dependencies?.eslint);
    } catch {}
    if (!hasEslintConfig && !hasEslintInPkg) {
      return { step: "lint", success: true, errors: [], warnings: ["Skipped — no ESLint config"] };
    }
  } else {
    // Docker: check via command
    const check = await run("ls eslint.config.* .eslintrc* 2>/dev/null | head -1 || echo NONE", 5_000);
    if (check.stdout.trim() === "NONE") {
      return { step: "lint", success: true, errors: [], warnings: ["Skipped — no ESLint config"] };
    }
  }

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

async function runSnapshotComparison(
  run: CommandRunner,
  repoDir: string,
  isDocker: boolean,
  sandboxId: string,
): Promise<ValidationStepResult> {
  if (!isAdvancedPipelineEnabled()) {
    return { step: "snapshot", success: true, errors: [], warnings: ["Snapshot comparison disabled by feature flag"] };
  }

  const beforeSnapshot = snapshotCache.get(sandboxId);
  if (!beforeSnapshot) {
    return { step: "snapshot", success: true, errors: [], warnings: ["No before-snapshot available — skipped"] };
  }

  try {
    // Ta "after" snapshot
    let afterSnapshot: Map<string, FileSnapshot>;
    if (isDocker) {
      afterSnapshot = await takeDockerSnapshot(run);
    } else {
      afterSnapshot = takeSnapshot(repoDir);
    }

    const diff = compareSnapshots(beforeSnapshot, afterSnapshot);

    // Rydd opp cached snapshot
    snapshotCache.delete(sandboxId);

    const warnings: string[] = [];

    // Rapporter diff
    if (diff.created.length > 0) {
      warnings.push(`Created ${diff.created.length} files: ${diff.created.slice(0, 10).join(", ")}${diff.created.length > 10 ? ` (+${diff.created.length - 10} more)` : ""}`);
    }
    if (diff.modified.length > 0) {
      warnings.push(`Modified ${diff.modified.length} files: ${diff.modified.slice(0, 10).join(", ")}${diff.modified.length > 10 ? ` (+${diff.modified.length - 10} more)` : ""}`);
    }
    if (diff.deleted.length > 0) {
      warnings.push(`Deleted ${diff.deleted.length} files: ${diff.deleted.join(", ")}`);
    }
    warnings.push(`Unchanged: ${diff.unchanged} files. Net diff: ${(diff.totalDiffBytes / 1024).toFixed(1)}KB`);

    // Stor diff = advarsel (men ikke feil)
    const errors: string[] = [];
    if (diff.created.length + diff.modified.length > 50) {
      warnings.push("⚠️ Large change set (>50 files) — review carefully");
    }

    log.info("snapshot comparison complete", {
      sandboxId,
      created: diff.created.length,
      modified: diff.modified.length,
      deleted: diff.deleted.length,
      unchanged: diff.unchanged,
    });

    return {
      step: "snapshot",
      success: true, // Snapshot er aldri en blokkerende feil
      errors,
      warnings,
      metrics: {
        filesCreated: diff.created.length,
        filesModified: diff.modified.length,
        filesDeleted: diff.deleted.length,
        filesUnchanged: diff.unchanged,
        totalDiffBytes: diff.totalDiffBytes,
      },
    };
  } catch (err) {
    log.warn("snapshot comparison failed", { sandboxId, error: String(err) });
    return { step: "snapshot", success: true, errors: [], warnings: [`Snapshot failed: ${String(err)}`] };
  }
}

async function runPerformanceBenchmark(
  run: CommandRunner,
  repoDir: string,
  isDocker: boolean,
): Promise<ValidationStepResult> {
  if (!isAdvancedPipelineEnabled()) {
    return { step: "performance", success: true, errors: [], warnings: ["Performance benchmarks disabled by feature flag"] };
  }

  const warnings: string[] = [];
  const metrics: Record<string, number> = {};

  try {
    // 1. Sjekk om build-script finnes
    let hasBuildScript = false;
    if (!isDocker) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf-8"));
        hasBuildScript = !!pkg.scripts?.build;
      } catch { /* no package.json */ }
    } else {
      const check = await run(`node -e "const p=require('./package.json'); process.exit(p.scripts?.build ? 0 : 1)"`, 5_000);
      hasBuildScript = check.exitCode === 0;
    }

    // 2. Kjør build og mål tid
    if (hasBuildScript) {
      const buildStart = Date.now();
      const buildResult = await run("npm run build", 120_000);
      const buildDuration = Date.now() - buildStart;

      metrics.buildDurationMs = buildDuration;

      if (buildResult.exitCode === 0) {
        warnings.push(`Build completed in ${(buildDuration / 1000).toFixed(1)}s`);

        // 3. Mål bundle-størrelse (sjekk vanlige output-mapper)
        const bundleDirs = ["dist", "build", ".next", "out"];
        for (const dir of bundleDirs) {
          try {
            let sizeResult;
            if (isDocker) {
              sizeResult = await run(`du -sk /workspace/repo/${dir} 2>/dev/null | cut -f1`, 5_000);
            } else {
              sizeResult = await run(`du -sk ${path.join(repoDir, dir)} 2>/dev/null | cut -f1`, 5_000);
            }

            if (sizeResult.exitCode === 0 && sizeResult.stdout.trim()) {
              const sizeKb = parseInt(sizeResult.stdout.trim());
              if (!isNaN(sizeKb) && sizeKb > 0) {
                metrics.bundleSizeKb = sizeKb;
                warnings.push(`Bundle size (${dir}/): ${sizeKb}KB`);
                break;
              }
            }
          } catch {
            // Dir finnes ikke — prøv neste
          }
        }
      } else {
        warnings.push(`Build failed after ${(buildDuration / 1000).toFixed(1)}s`);
        metrics.buildFailed = 1;
      }
    } else {
      warnings.push("No build script found — skipped build benchmark");
    }

    // 4. Mål antall filer og total kodelinjer (rask metrikk)
    try {
      let countResult;
      if (isDocker) {
        countResult = await run(
          `find /workspace/repo -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' | ` +
          `grep -v node_modules | grep -v .next | wc -l`,
          10_000
        );
      } else {
        countResult = await run(
          `find ${repoDir} -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' | ` +
          `grep -v node_modules | grep -v .next | wc -l`,
          10_000
        );
      }

      if (countResult.exitCode === 0) {
        const fileCount = parseInt(countResult.stdout.trim());
        if (!isNaN(fileCount)) {
          metrics.sourceFileCount = fileCount;
          warnings.push(`Source files: ${fileCount}`);
        }
      }
    } catch { /* ignore count errors */ }

    log.info("performance benchmark complete", { metrics });

    return {
      step: "performance",
      success: true, // Benchmarks er aldri blokkerende
      errors: [],
      warnings,
      metrics,
    };
  } catch (err) {
    log.warn("performance benchmark failed", { error: String(err) });
    return { step: "performance", success: true, errors: [], warnings: [`Benchmark failed: ${String(err)}`] };
  }
}

interface PipelineStep {
  name: string;
  enabled: boolean;
  run: (runner: CommandRunner, repoDir: string, isDocker: boolean, sandboxId?: string) => Promise<ValidationStepResult>;
}

const VALIDATION_PIPELINE: PipelineStep[] = [
  { name: "typecheck", enabled: true, run: (r, d, docker) => runTypeCheck(r, d, docker) },
  { name: "lint", enabled: true, run: (r, d, docker) => runLint(r, d, docker) },
  { name: "test", enabled: true, run: (r, d, docker) => runTests(r, d, docker) },
  { name: "snapshot", enabled: true, run: (r, d, docker, sid) => runSnapshotComparison(r, d, docker, sid!) },
  { name: "performance", enabled: true, run: (r, d, docker) => runPerformanceBenchmark(r, d, docker) },
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
        const stub = await step.run(runner, repoDir, isDocker, req.sandboxId);
        steps.push(stub);
        continue;
      }

      const result = await step.run(runner, repoDir, isDocker, req.sandboxId);
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
    // Rydd snapshot-cache
    snapshotCache.delete(req.sandboxId);

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
