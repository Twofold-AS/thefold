import { execSync } from "child_process";
import * as crypto from "crypto";

// --- Constants ---

const CONTAINER_PREFIX = "thefold-sandbox-";
const DOCKER_IMAGE = "node:20-alpine";
const DEFAULT_TIMEOUT_MS = 120_000;
const MEMORY_LIMIT = "512m";
const CPU_LIMIT = "0.5";

// --- Types ---

interface DockerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// --- Helpers ---

function containerName(sandboxId: string): string {
  return `${CONTAINER_PREFIX}${sandboxId}`;
}

function dockerExec(args: string, timeout = DEFAULT_TIMEOUT_MS): string {
  return execSync(`docker ${args}`, {
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  }).toString();
}

// --- Docker Sandbox Functions ---

export async function createDockerSandbox(req: {
  repoOwner: string;
  repoName: string;
  ref?: string;
  githubToken: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const name = containerName(id);
  const ref = req.ref || "main";
  const cloneUrl = `https://x-access-token:${req.githubToken}@github.com/${req.repoOwner}/${req.repoName}.git`;

  // 1. Create container with security limits
  // --network=none: no network access
  // --read-only: read-only root filesystem
  // --tmpfs /tmp: writable /tmp for node operations
  // --memory/--cpus: resource limits
  dockerExec(
    `create --name ${name} ` +
    `--memory=${MEMORY_LIMIT} --cpus=${CPU_LIMIT} ` +
    `--network=none ` +
    `--read-only --tmpfs /tmp:rw,noexec,nosuid,size=256m ` +
    `--tmpfs /workspace:rw,size=512m ` +
    `-w /workspace ` +
    `${DOCKER_IMAGE} sleep infinity`,
    30_000
  );

  // 2. Start the container
  dockerExec(`start ${name}`, 10_000);

  // 3. Install git inside container (alpine needs it)
  dockerExec(`exec ${name} apk add --no-cache git`, 60_000);

  // 4. Temporarily enable network for clone + install
  // We can't clone with --network=none, so we recreate with network
  // Actually, docker network disconnect/connect doesn't work after create with --network=none
  // Instead: we clone on host and docker cp into container
  try {
    // Clone on host into a temp directory
    const tempDir = `/tmp/thefold-docker-clone-${id}`;
    execSync(`mkdir -p ${tempDir}`, { timeout: 5_000 });
    execSync(
      `git clone --depth 1 --branch ${ref} ${cloneUrl} ${tempDir}/repo`,
      {
        timeout: DEFAULT_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      }
    );

    // Copy repo into container
    dockerExec(`cp ${tempDir}/repo ${name}:/workspace/repo`, DEFAULT_TIMEOUT_MS);

    // Clean up temp dir on host
    execSync(`rm -rf ${tempDir}`, { timeout: 10_000 });

    // Install dependencies inside container
    dockerExec(
      `exec ${name} sh -c "cd /workspace/repo && npm install --ignore-scripts"`,
      DEFAULT_TIMEOUT_MS
    );
  } catch (error) {
    // Clean up on failure
    try { dockerExec(`rm -f ${name}`, 10_000); } catch { /* ignore */ }
    try { execSync(`rm -rf /tmp/thefold-docker-clone-${id}`, { timeout: 5_000 }); } catch { /* ignore */ }
    throw error;
  }

  return id;
}

export async function execInDocker(
  sandboxId: string,
  command: string,
  timeout = 30_000
): Promise<DockerExecResult> {
  const name = containerName(sandboxId);

  try {
    const stdout = execSync(
      `docker exec ${name} sh -c ${shellEscape(command)}`,
      {
        cwd: undefined,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      }
    ).toString();

    return { stdout: stdout.substring(0, 50_000), stderr: "", exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: (error.stdout?.toString() || "").substring(0, 50_000),
      stderr: (error.stderr?.toString() || "").substring(0, 50_000),
      exitCode: error.status ?? 1,
    };
  }
}

export async function writeFileDocker(
  sandboxId: string,
  filePath: string,
  content: string
): Promise<void> {
  const name = containerName(sandboxId);

  // Ensure parent directory exists
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) {
    await execInDocker(sandboxId, `mkdir -p /workspace/repo/${dir}`);
  }

  // Write content via stdin to avoid shell escaping issues
  execSync(
    `docker exec -i ${name} sh -c "cat > /workspace/repo/${filePath}"`,
    {
      input: content,
      timeout: 10_000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
}

export async function deleteFileDocker(
  sandboxId: string,
  filePath: string
): Promise<void> {
  await execInDocker(sandboxId, `rm -f /workspace/repo/${filePath}`);
}

export async function destroyDockerSandbox(sandboxId: string): Promise<void> {
  const name = containerName(sandboxId);
  try {
    dockerExec(`rm -f ${name}`, 10_000);
  } catch {
    // Container may already be removed
  }
}

// --- Cleanup: find and remove old containers ---

export function cleanupOldContainers(maxAgeMinutes = 30): number {
  let removed = 0;
  try {
    // List all containers with our prefix
    const output = execSync(
      `docker ps -a --filter "name=${CONTAINER_PREFIX}" --format "{{.ID}} {{.Names}} {{.CreatedAt}}"`,
      { timeout: 10_000 }
    ).toString().trim();

    if (!output) return 0;

    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    for (const line of output.split("\n")) {
      const parts = line.split(" ");
      if (parts.length < 3) continue;
      const containerId = parts[0];
      // CreatedAt format: "2026-02-15 10:30:00 +0000 UTC"
      const createdStr = parts.slice(2).join(" ");
      const createdAt = new Date(createdStr).getTime();

      if (now - createdAt > maxAgeMs) {
        try {
          dockerExec(`rm -f ${containerId}`, 10_000);
          removed++;
        } catch {
          // Skip containers that can't be removed
        }
      }
    }
  } catch {
    // Docker may not be available — ignore
  }
  return removed;
}

// --- Shell escape helper ---

function shellEscape(cmd: string): string {
  // Wrap in single quotes, escaping any single quotes in the command
  return `'${cmd.replace(/'/g, "'\\''")}'`;
}
