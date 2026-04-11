import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { CronJob } from "encore.dev/cron";
import { Topic } from "encore.dev/pubsub";
import { secret } from "encore.dev/config";
import { sandbox } from "~encore/clients";
import log from "encore.dev/log";

// --- Feature flags ---
const monitorEnabled = secret("MonitorEnabled");
const repoWatchEnabled = secret("RepoWatchEnabled");
const dailyDigestEnabled = secret("DailyDigestEnabled");

// --- Database ---

const db = new SQLDatabase("monitor", { migrations: "./migrations" });

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[monitor] db warmed"); }
  catch (e) { console.warn("[monitor] warmup failed:", e); }
})();

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
      command: "pnpm audit --json 2>&1",
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
      suggestedAction: status === "fail" ? "Run pnpm audit --fix" : undefined,
    };
  } catch {
    return {
      repo,
      checkType: "dependency_audit",
      status: "warn",
      details: { error: "Could not run pnpm audit" },
    };
  }
}

async function runTestCoverage(repo: string, sandboxId: string): Promise<HealthCheckResult> {
  try {
    const result = await sandbox.runCommand({
      sandboxId,
      command: "pnpm test -- --coverage --passWithNoTests 2>&1",
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

async function runCodeQuality(repo: string, sandboxId: string): Promise<HealthCheckResult> {
  try {
    const result = await sandbox.runCommand({
      sandboxId,
      command: "pnpm eslint . --no-error-on-unmatched-pattern --format json 2>&1",
      timeout: 60,
    });

    let eslintData: Array<{ errorCount?: number; warningCount?: number }> = [];
    try {
      eslintData = JSON.parse(result.stdout);
    } catch {
      // ESLint may output non-JSON — treat as warn
      return {
        repo,
        checkType: "code_quality",
        status: "warn",
        details: { error: "Could not parse ESLint output", raw: result.stdout.substring(0, 1000) },
      };
    }

    const totalErrors = eslintData.reduce((sum, f) => sum + (f.errorCount ?? 0), 0);
    const totalWarnings = eslintData.reduce((sum, f) => sum + (f.warningCount ?? 0), 0);

    let status: "pass" | "warn" | "fail" = "pass";
    if (totalErrors > 0) status = "fail";
    else if (totalWarnings > 5) status = "warn";

    return {
      repo,
      checkType: "code_quality",
      status,
      details: { errors: totalErrors, warnings: totalWarnings, filesChecked: eslintData.length },
      suggestedAction: status === "fail" ? "Run pnpm eslint . --fix" : undefined,
    };
  } catch {
    return {
      repo,
      checkType: "code_quality",
      status: "warn",
      details: { error: "Could not run ESLint" },
    };
  }
}

async function runDocFreshness(repo: string, sandboxId: string): Promise<HealthCheckResult> {
  try {
    // Check if README.md exists and when it was last modified
    const result = await sandbox.runCommand({
      sandboxId,
      command: "find . -maxdepth 2 -name 'README.md' -o -name 'CHANGELOG.md' | head -5",
      timeout: 15,
    });

    const docFiles = result.stdout.trim().split("\n").filter((f) => f.length > 0);

    if (docFiles.length === 0) {
      return {
        repo,
        checkType: "doc_freshness",
        status: "warn",
        details: { message: "No README.md or CHANGELOG.md found", docsFound: 0 },
        suggestedAction: "Add a README.md to document the project",
      };
    }

    // Check if package.json has a description
    const pkgResult = await sandbox.runCommand({
      sandboxId,
      command: "cat package.json 2>/dev/null",
      timeout: 10,
    });

    let hasDescription = false;
    try {
      const pkg = JSON.parse(pkgResult.stdout);
      hasDescription = !!(pkg.description && pkg.description.length > 0);
    } catch {
      // No package.json or invalid — not critical
    }

    let status: "pass" | "warn" | "fail" = "pass";
    if (!hasDescription && docFiles.length < 2) status = "warn";

    return {
      repo,
      checkType: "doc_freshness",
      status,
      details: {
        docsFound: docFiles.length,
        docFiles,
        hasPackageDescription: hasDescription,
      },
      suggestedAction: status === "warn" ? "Add description to package.json and ensure docs are up to date" : undefined,
    };
  } catch {
    return {
      repo,
      checkType: "doc_freshness",
      status: "warn",
      details: { error: "Could not check documentation" },
    };
  }
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
    if (!req.repo.includes("/")) {
      throw APIError.invalidArgument("repo must be in 'owner/name' format");
    }
    const [owner, name] = req.repo.split("/");

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

      if (!req.checkType || req.checkType === "code_quality") {
        const result = await runCodeQuality(req.repo, sandboxId);
        await storeCheck(result);
        results.push(result);
      }

      if (!req.checkType || req.checkType === "doc_freshness") {
        const result = await runDocFreshness(req.repo, sandboxId);
        await storeCheck(result);
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

// --- Cron: Daily health check (feature-flagged via MonitorEnabled secret) ---

export const runDailyChecks = api(
  { method: "POST", path: "/monitor/daily-check", expose: false },
  async (): Promise<{ ran: boolean; message: string }> => {
    // Feature flag: check MonitorEnabled secret
    let enabled = false;
    try {
      enabled = monitorEnabled() === "true";
    } catch {
      // Secret not set — disabled
    }

    if (!enabled) {
      log.info("Monitor daily check: disabled (MonitorEnabled != 'true')");
      return { ran: false, message: "Monitor disabled — set MonitorEnabled secret to 'true' to enable" };
    }

    log.info("Monitor daily check: running");

    // Get repos to check from recent health_checks (known repos)
    const repoRows = await db.query<{ repo: string }>`
      SELECT DISTINCT repo FROM health_checks ORDER BY repo
    `;

    const repos: string[] = [];
    for await (const row of repoRows) {
      repos.push(row.repo);
    }

    if (repos.length === 0) {
      log.info("Monitor daily check: no repos configured");
      return { ran: true, message: "No repos found — run a manual check first to register a repo" };
    }

    let totalChecks = 0;
    for (const repo of repos) {
      try {
        const result = await runCheck({ repo });
        totalChecks += result.results.length;
        log.info(`Monitor daily check: ${repo} — ${result.results.length} checks completed`);
      } catch (err) {
        log.error(err as Error, `Monitor daily check failed for ${repo}`);
      }
    }

    return { ran: true, message: `Checked ${repos.length} repos, ${totalChecks} total checks` };
  }
);

const _cron = new CronJob("daily-health-check", {
  title: "Daily repository health check",
  schedule: "0 3 * * *",
  endpoint: runDailyChecks,
});

// ============================================================
// 8.1: Repo-watch — proactive commit + CVE monitoring
// ============================================================

export interface RepoWatchFinding {
  repo: string;
  findingType: "breaking_change" | "cve" | "outdated_dep" | "new_commit";
  severity: "info" | "warn" | "critical";
  summary: string;
  details: Record<string, unknown>;
}

export const repoWatchFindings = new Topic<RepoWatchFinding>("repo-watch-findings", {
  deliveryGuarantee: "at-least-once",
});

interface RepoWatchRequest {
  repo?: string; // If omitted, checks all known repos
}

interface RepoWatchResponse {
  ran: boolean;
  findings: number;
  message: string;
}

export const runRepoWatch = api(
  { method: "POST", path: "/monitor/repo-watch", expose: false },
  async (req: RepoWatchRequest): Promise<RepoWatchResponse> => {
    let enabled = false;
    try { enabled = repoWatchEnabled() === "true"; } catch { /* not set */ }
    if (!enabled) {
      return { ran: false, findings: 0, message: "RepoWatchEnabled != 'true'" };
    }

    const { github: gh, memory: mem, ai: aiClient } = await import("~encore/clients");

    // Determine repos to watch
    let repos: string[] = [];
    if (req.repo) {
      repos = [req.repo];
    } else {
      const rows = db.query<{ repo: string }>`
        SELECT DISTINCT repo FROM health_checks ORDER BY repo
      `;
      for await (const row of rows) repos.push(row.repo);
    }

    if (repos.length === 0) {
      return { ran: true, findings: 0, message: "No repos registered — run a manual check first" };
    }

    let totalFindings = 0;

    for (const repoFullName of repos) {
      if (!repoFullName.includes("/")) continue;
      const [owner, repoName] = repoFullName.split("/");

      try {
        // --- Check latest commits (last 6h) ---
        let newCommits: Array<{ sha: string; message: string; author: string }> = [];
        try {
          const tree = await gh.getTree({ owner, repo: repoName });
          // We use the tree as a proxy for "repo exists"; actual commit checking
          // would require a /commits endpoint. For now store a "new_commit" finding
          // if the tree changed vs last stored SHA (simplified).
          const lastWatch = await db.queryRow<{ commit_sha: string }>`
            SELECT commit_sha FROM repo_watch_results
            WHERE repo = ${repoFullName} AND finding_type = 'new_commit'
            ORDER BY created_at DESC LIMIT 1
          `;
          const treeSha = tree.treeString?.substring(0, 40) || "";
          if (!lastWatch || lastWatch.commit_sha !== treeSha) {
            newCommits = [{ sha: treeSha, message: `Tree updated (${tree.tree?.length ?? 0} files)`, author: "auto" }];
          }
        } catch {
          // GitHub unavailable — skip
        }

        // --- Analyse breaking changes with AI (only if new commits) ---
        if (newCommits.length > 0) {
          try {
            const pkgFile = await gh.getFile({ owner, repo: repoName, path: "package.json" });
            if (pkgFile?.content) {
              const analysis = await aiClient.chat({
                messages: [{
                  role: "user",
                  content: `Quickly scan this package.json for breaking version bumps or known CVE-affected packages (e.g. lodash<4.17.21, express<4.18, minimist<1.2.6). Reply JSON only: {"breakingChanges": ["..."], "cveRisks": ["..."]}.\n\n${pkgFile.content.slice(0, 3000)}`,
                }],
                systemContext: "direct_chat",
                model: "claude-haiku-4-5-20251001",
              });

              let parsed: { breakingChanges?: string[]; cveRisks?: string[] } = {};
              try {
                const clean = analysis.content.replace(/```json|```/g, "").trim();
                parsed = JSON.parse(clean);
              } catch { /* not valid JSON */ }

              for (const change of (parsed.breakingChanges || [])) {
                const finding: RepoWatchFinding = {
                  repo: repoFullName,
                  findingType: "breaking_change",
                  severity: "warn",
                  summary: change,
                  details: { source: "package.json" },
                };
                await storeFinding(finding, newCommits[0].sha);
                await repoWatchFindings.publish(finding);
                await mem.store({
                  content: `Breaking change detected in ${repoFullName}: ${change}`,
                  category: "breaking_change",
                  memoryType: "error_pattern",
                  sourceRepo: repoFullName,
                  tags: ["breaking_change", repoName, "auto-detected"],
                });
                totalFindings++;
              }

              for (const cve of (parsed.cveRisks || [])) {
                const finding: RepoWatchFinding = {
                  repo: repoFullName,
                  findingType: "cve",
                  severity: "critical",
                  summary: cve,
                  details: { source: "package.json" },
                };
                await storeFinding(finding, newCommits[0].sha);
                await repoWatchFindings.publish(finding);
                await mem.store({
                  content: `CVE risk in ${repoFullName}: ${cve}`,
                  category: "cve",
                  memoryType: "error_pattern",
                  sourceRepo: repoFullName,
                  tags: ["cve", repoName, "security"],
                  pinned: true,
                });
                totalFindings++;
              }
            }
          } catch (err) {
            log.warn("repo-watch AI analysis failed", { repo: repoFullName, error: String(err) });
          }

          // Record that we saw this commit tree
          await storeFinding({
            repo: repoFullName,
            findingType: "new_commit",
            severity: "info",
            summary: newCommits[0].message,
            details: { commitCount: newCommits.length },
          }, newCommits[0].sha);
        }
      } catch (err) {
        log.warn("repo-watch failed for repo", { repo: repoFullName, error: String(err) });
      }
    }

    log.info("repo-watch complete", { repos: repos.length, findings: totalFindings });
    return { ran: true, findings: totalFindings, message: `Checked ${repos.length} repos, ${totalFindings} findings` };
  }
);

async function storeFinding(finding: RepoWatchFinding, commitSha?: string): Promise<void> {
  await db.exec`
    INSERT INTO repo_watch_results (repo, commit_sha, finding_type, severity, summary, details)
    VALUES (
      ${finding.repo},
      ${commitSha || null},
      ${finding.findingType},
      ${finding.severity},
      ${finding.summary},
      ${JSON.stringify(finding.details)}::jsonb
    )
  `;
}

// GET /monitor/watch-findings — Latest findings per repo
export const watchFindings = api(
  { method: "GET", path: "/monitor/watch-findings", expose: true, auth: true },
  async (): Promise<{ findings: Array<RepoWatchFinding & { id: string; createdAt: string }> }> => {
    const rows = db.query<{
      id: string; repo: string; finding_type: string; severity: string;
      summary: string; details: Record<string, unknown>; created_at: string;
    }>`
      SELECT id, repo, finding_type, severity, summary, details, created_at
      FROM repo_watch_results
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND finding_type != 'new_commit'
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const findings: Array<RepoWatchFinding & { id: string; createdAt: string }> = [];
    for await (const row of rows) {
      findings.push({
        id: row.id,
        repo: row.repo,
        findingType: row.finding_type as RepoWatchFinding["findingType"],
        severity: row.severity as RepoWatchFinding["severity"],
        summary: row.summary,
        details: row.details,
        createdAt: String(row.created_at),
      });
    }
    return { findings };
  }
);

const _repoWatchCron = new CronJob("repo-watch", {
  title: "Proactive repo watch — commits and CVE scanning",
  every: "30m",
  endpoint: runRepoWatch,
});

// ============================================================
// 8.3: Daily digest — morning summary at 08:00
// ============================================================

export const runDailyDigest = api(
  { method: "POST", path: "/monitor/daily-digest", expose: false },
  async (): Promise<{ ran: boolean; message: string }> => {
    let enabled = false;
    try { enabled = dailyDigestEnabled() === "true"; } catch { /* not set */ }
    if (!enabled) {
      return { ran: false, message: "DailyDigestEnabled != 'true'" };
    }

    const { ai: aiClient, memory: mem } = await import("~encore/clients");

    // Collect repo health metrics from last 24h
    const healthRows = db.query<{
      repo: string; check_type: string; status: string; details: Record<string, unknown>; created_at: string;
    }>`
      SELECT DISTINCT ON (repo, check_type) repo, check_type, status, details, created_at
      FROM health_checks
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY repo, check_type, created_at DESC
    `;

    const healthSummary: string[] = [];
    for await (const row of healthRows) {
      const icon = row.status === "pass" ? "✅" : row.status === "warn" ? "⚠️" : "❌";
      healthSummary.push(`${icon} ${row.repo} — ${row.check_type}: ${row.status}`);
    }

    // Collect recent watch findings
    const findingRows = db.query<{ repo: string; severity: string; summary: string }>`
      SELECT repo, severity, summary
      FROM repo_watch_results
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND finding_type != 'new_commit'
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const findingsSummary: string[] = [];
    for await (const row of findingRows) {
      findingsSummary.push(`[${row.severity.toUpperCase()}] ${row.repo}: ${row.summary}`);
    }

    if (healthSummary.length === 0 && findingsSummary.length === 0) {
      log.info("daily-digest: no data to summarize");
      return { ran: true, message: "No health data available for digest" };
    }

    // Generate digest via AI
    const digestPrompt = `Generate a concise daily development digest (max 150 words) in Norwegian for a developer. Be direct and actionable.

Health checks (last 24h):
${healthSummary.length > 0 ? healthSummary.join("\n") : "No health checks ran"}

Security/watch findings:
${findingsSummary.length > 0 ? findingsSummary.join("\n") : "No new findings"}

Format: Start with "📊 **Daglig oppsummering**", then bullet points with the most important items.`;

    let digestContent = "";
    try {
      const resp = await aiClient.chat({
        messages: [{ role: "user", content: digestPrompt }],
        systemContext: "direct_chat",
        model: "claude-haiku-4-5-20251001",
      });
      digestContent = resp.content;
    } catch (err) {
      log.warn("daily-digest AI generation failed", { error: String(err) });
      digestContent = `📊 **Daglig oppsummering**\n\n${healthSummary.slice(0, 5).join("\n")}\n\n${findingsSummary.slice(0, 3).join("\n")}`;
    }

    // Store as memory for retrieval
    await mem.store({
      content: `Daily digest ${new Date().toISOString().slice(0, 10)}: ${digestContent}`,
      category: "daily_digest",
      memoryType: "session",
      tags: ["daily_digest", "health_report"],
      ttlDays: 30,
    }).catch((e: unknown) => log.warn("digest memory store failed", { error: String(e) }));

    // Publish to agent-reports so chat service stores it as a conversation message
    try {
      const { agentReports } = await import("../chat/chat");
      await agentReports.publish({
        conversationId: "daily-digest",
        taskId: "system-digest",
        content: digestContent,
        status: "completed",
        completionMessage: digestContent,
      });
    } catch (err) {
      log.warn("digest publish to chat failed", { error: String(err) });
    }

    log.info("daily-digest complete", { checks: healthSummary.length, findings: findingsSummary.length });
    return { ran: true, message: `Digest generated with ${healthSummary.length} checks + ${findingsSummary.length} findings` };
  }
);

const _digestCron = new CronJob("daily-digest", {
  title: "Daily morning development digest",
  schedule: "0 8 * * *",
  endpoint: runDailyDigest,
});
