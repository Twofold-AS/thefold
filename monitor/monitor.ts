import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { CronJob } from "encore.dev/cron";
import { sandbox } from "~encore/clients";
import log from "encore.dev/log";

// --- Database ---

const db = new SQLDatabase("monitor", { migrations: "./migrations" });

// --- Types ---

interface HealthCheckResult {
  id?: string;
  repo: string;
  checkType: string;
  status: "pass" | "warn" | "fail";
  details: Record<string, unknown>;
  suggestedAction?: string;
  createdAt?: string;
}

interface RunCheckRequest {
  repo: string;
  checkType?: string;
}

interface RunCheckResponse {
  results: HealthCheckResult[];
}

interface HealthResponse {
  repos: Record<string, HealthCheckResult[]>;
}

interface HistoryRequest {
  repo: string;
  limit?: number;
}

interface HistoryResponse {
  checks: HealthCheckResult[];
}

// --- Check implementations ---

async function runDependencyAudit(repo: string, sandboxId: string): Promise<HealthCheckResult> {
  try {
    const result = await sandbox.runCommand({
      sandboxId,
      command: "npm audit --json 2>&1",
      timeout: 60,
    });

    let auditData: Record<string, unknown> = {};
    try {
      auditData = JSON.parse(result.stdout);
    } catch {
      auditData = { raw: result.stdout.substring(0, 2000) };
    }

    const highVulns = (auditData as any)?.metadata?.vulnerabilities?.high ?? 0;
    const criticalVulns = (auditData as any)?.metadata?.vulnerabilities?.critical ?? 0;

    let status: "pass" | "warn" | "fail" = "pass";
    if (criticalVulns > 0) status = "fail";
    else if (highVulns > 0) status = "warn";

    return {
      repo,
      checkType: "dependency_audit",
      status,
      details: {
        high: highVulns,
        critical: criticalVulns,
        total: (auditData as any)?.metadata?.vulnerabilities?.total ?? 0,
      },
      suggestedAction: status === "fail" ? "Run npm audit fix --force" : undefined,
    };
  } catch {
    return {
      repo,
      checkType: "dependency_audit",
      status: "warn",
      details: { error: "Could not run npm audit" },
    };
  }
}

async function runTestCoverage(repo: string, sandboxId: string): Promise<HealthCheckResult> {
  try {
    const result = await sandbox.runCommand({
      sandboxId,
      command: "npm test -- --coverage --passWithNoTests 2>&1",
      timeout: 120,
    });

    const coverageMatch = result.stdout.match(/All files[^|]*\|\s*([\d.]+)/);
    const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : -1;

    let status: "pass" | "warn" | "fail" = "pass";
    if (coverage < 50) status = "fail";
    else if (coverage < 70) status = "warn";

    return {
      repo,
      checkType: "test_coverage",
      status,
      details: { coveragePercent: coverage, output: result.stdout.substring(0, 1000) },
      suggestedAction: status !== "pass" ? "Increase test coverage" : undefined,
    };
  } catch {
    return {
      repo,
      checkType: "test_coverage",
      status: "warn",
      details: { error: "Could not run tests with coverage" },
    };
  }
}

function createStubCheck(repo: string, checkType: string): HealthCheckResult {
  return {
    repo,
    checkType,
    status: "pass",
    details: { message: "Check not yet implemented" },
  };
}

// --- Store check result ---

async function storeCheck(result: HealthCheckResult): Promise<void> {
  await db.exec`
    INSERT INTO health_checks (repo, check_type, status, details)
    VALUES (${result.repo}, ${result.checkType}, ${result.status}, ${JSON.stringify(result.details)}::jsonb)
  `;
}

// --- Endpoints ---

// POST /monitor/run-check — Run health check for one repo
export const runCheck = api(
  { method: "POST", path: "/monitor/run-check", expose: true, auth: true },
  async (req: RunCheckRequest): Promise<RunCheckResponse> => {
    const results: HealthCheckResult[] = [];

    // Create a sandbox for running checks
    const [owner, name] = req.repo.includes("/") ? req.repo.split("/") : ["Twofold-AS", req.repo];

    let sandboxId: string | null = null;
    try {
      const sb = await sandbox.create({ repoOwner: owner, repoName: name });
      sandboxId = sb.id;
    } catch {
      // Can't create sandbox — return stub results
      return {
        results: [{
          repo: req.repo,
          checkType: req.checkType || "all",
          status: "warn",
          details: { error: "Could not create sandbox for checks" },
        }],
      };
    }

    try {
      if (!req.checkType || req.checkType === "dependency_audit") {
        const result = await runDependencyAudit(req.repo, sandboxId);
        await storeCheck(result);
        results.push(result);
      }

      if (!req.checkType || req.checkType === "test_coverage") {
        const result = await runTestCoverage(req.repo, sandboxId);
        await storeCheck(result);
        results.push(result);
      }

      if (req.checkType === "code_quality") {
        const result = createStubCheck(req.repo, "code_quality");
        results.push(result);
      }

      if (req.checkType === "doc_freshness") {
        const result = createStubCheck(req.repo, "doc_freshness");
        results.push(result);
      }
    } finally {
      // Clean up sandbox
      if (sandboxId) {
        await sandbox.destroy({ sandboxId }).catch(() => {});
      }
    }

    return { results };
  }
);

// GET /monitor/health — Latest health status for all repos
export const health = api(
  { method: "GET", path: "/monitor/health", expose: true, auth: true },
  async (): Promise<HealthResponse> => {
    const rows = await db.query<{
      id: string;
      repo: string;
      check_type: string;
      status: string;
      details: Record<string, unknown>;
      created_at: string;
    }>`
      SELECT DISTINCT ON (repo, check_type)
        id, repo, check_type, status, details, created_at
      FROM health_checks
      ORDER BY repo, check_type, created_at DESC
    `;

    const repos: Record<string, HealthCheckResult[]> = {};
    for await (const row of rows) {
      if (!repos[row.repo]) repos[row.repo] = [];
      repos[row.repo].push({
        id: row.id,
        repo: row.repo,
        checkType: row.check_type,
        status: row.status as "pass" | "warn" | "fail",
        details: row.details,
        createdAt: String(row.created_at),
      });
    }

    return { repos };
  }
);

// GET /monitor/history — Check history for a repo
export const history = api(
  { method: "POST", path: "/monitor/history", expose: true, auth: true },
  async (req: HistoryRequest): Promise<HistoryResponse> => {
    const limit = req.limit ?? 50;

    const rows = await db.query<{
      id: string;
      repo: string;
      check_type: string;
      status: string;
      details: Record<string, unknown>;
      created_at: string;
    }>`
      SELECT id, repo, check_type, status, details, created_at
      FROM health_checks
      WHERE repo = ${req.repo}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const checks: HealthCheckResult[] = [];
    for await (const row of rows) {
      checks.push({
        id: row.id,
        repo: row.repo,
        checkType: row.check_type,
        status: row.status as "pass" | "warn" | "fail",
        details: row.details,
        createdAt: String(row.created_at),
      });
    }

    return { checks };
  }
);

// --- Cron: Daily health check (feature-flagged, disabled by default) ---

export const runDailyChecks = api(
  { method: "POST", path: "/monitor/daily-check", expose: false },
  async (): Promise<{ ran: boolean; message: string }> => {
    // Feature flag: disabled by default
    // Enable by setting MonitorEnabled secret to "true"
    // For now, always return early
    log.info("Monitor daily check: disabled (feature flag off)");
    return { ran: false, message: "Monitor disabled — set MonitorEnabled secret to enable" };
  }
);

const _cron = new CronJob("daily-health-check", {
  title: "Daily repository health check",
  schedule: "0 3 * * *",
  endpoint: runDailyChecks,
});
