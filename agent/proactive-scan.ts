import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { github, memory } from "~encore/clients";

export const runProactiveScan = api(
  { method: "POST", path: "/agent/proactive-scan/run", expose: false },
  async (): Promise<{ findings: number; repos: number }> => {
    // Get list of repos from recent memories (what repos TheFold has worked on)
    let repoList: string[] = [];
    try {
      const recent = await memory.search({
        query: "repository",
        limit: 20,
        memoryType: "task",
      });
      const repos = new Set<string>();
      for (const r of recent.results) {
        if (r.sourceRepo) repos.add(r.sourceRepo);
      }
      repoList = Array.from(repos).slice(0, 5); // Max 5 repos per scan
    } catch {
      // No memories yet — skip
    }

    let totalFindings = 0;

    for (const repoPath of repoList) {
      const [owner, repo] = repoPath.split("/");
      if (!owner || !repo) continue;

      const findings: string[] = [];

      try {
        // Check for package.json to find potential issues
        const pkgFile = await github.getFile({ owner, repo, path: "package.json" });
        let pkg: Record<string, unknown>;
        try {
          pkg = JSON.parse(pkgFile.content);
        } catch {
          pkg = {};
        }

        const deps = Object.keys((pkg.dependencies as Record<string, string>) ?? {});
        const devDeps = Object.keys((pkg.devDependencies as Record<string, string>) ?? {});
        const depCount = deps.length + devDeps.length;

        if (depCount > 50) {
          findings.push(`Large dependency count (${depCount} deps) — consider audit`);
        }

        // Check for missing lock file indication (heuristic)
        if (depCount > 0 && !pkg.engines) {
          findings.push(`No engines field in package.json — consider pinning Node.js version`);
        }
      } catch {
        // package.json not found or not parseable — non-critical
      }

      if (findings.length > 0) {
        totalFindings += findings.length;
        log.info("proactive scan findings", { repo: repoPath, findings });

        // Store as memory for agent context (fire-and-forget)
        memory.store({
          content: `Proactive scan for ${repoPath}: ${findings.join("; ")}`,
          category: "agent",
          memoryType: "task",
          sourceRepo: repoPath,
          tags: ["proactive-scan", "health"],
          trustLevel: "agent",
        }).catch((err) =>
          log.warn("proactive scan memory store failed", { repo: repoPath, error: String(err) })
        );
      }
    }

    log.info("proactive scan completed", { repos: repoList.length, findings: totalFindings });
    return { findings: totalFindings, repos: repoList.length };
  }
);

// Weekday mornings 07:00 UTC — declared after runProactiveScan to avoid forward reference error
const _cronJob = new CronJob("proactive-scan", {
  title: "Proactive repository health scan",
  schedule: "0 7 * * 1-5",
  endpoint: runProactiveScan,
});
