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

// Validate the sandbox code (typecheck + lint)
export const validate = api(
  { method: "POST", path: "/sandbox/validate", expose: false },
  async (req: ValidateRequest): Promise<ValidateResponse> => {
    const dir = ensureSandboxExists(req.sandboxId);
    const repoDir = `${dir}/repo`;
    const errors: string[] = [];
    let output = "";

    // 1. TypeScript typecheck
    try {
      const tscResult = execSync("npx tsc --noEmit 2>&1", {
        cwd: repoDir,
        timeout: 60_000,
      }).toString();
      output += `=== TypeScript ===\n${tscResult || "No errors"}\n\n`;
    } catch (error: any) {
      const tscOutput = error.stdout?.toString() || error.message;
      output += `=== TypeScript ERRORS ===\n${tscOutput}\n\n`;
      errors.push(`TypeScript: ${tscOutput.substring(0, 500)}`);
    }

    // 2. ESLint (if configured)
    try {
      if (fs.existsSync(`${repoDir}/.eslintrc.json`) || fs.existsSync(`${repoDir}/eslint.config.js`)) {
        const eslintResult = execSync("npx eslint . --ext .ts,.tsx 2>&1", {
          cwd: repoDir,
          timeout: 60_000,
        }).toString();
        output += `=== ESLint ===\n${eslintResult || "No errors"}\n\n`;
      }
    } catch (error: any) {
      const eslintOutput = error.stdout?.toString() || error.message;
      output += `=== ESLint ERRORS ===\n${eslintOutput}\n\n`;
      errors.push(`ESLint: ${eslintOutput.substring(0, 500)}`);
    }

    // 3. Run tests (if they exist)
    try {
      const hasTests =
        fs.existsSync(`${repoDir}/jest.config.ts`) ||
        fs.existsSync(`${repoDir}/vitest.config.ts`);

      if (hasTests) {
        const testResult = execSync("npm test -- --passWithNoTests 2>&1", {
          cwd: repoDir,
          timeout: 120_000,
        }).toString();
        output += `=== Tests ===\n${testResult}\n\n`;
      }
    } catch (error: any) {
      const testOutput = error.stdout?.toString() || error.message;
      output += `=== Test ERRORS ===\n${testOutput}\n\n`;
      errors.push(`Tests: ${testOutput.substring(0, 500)}`);
    }

    return {
      success: errors.length === 0,
      output: output.substring(0, 100_000),
      errors,
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
