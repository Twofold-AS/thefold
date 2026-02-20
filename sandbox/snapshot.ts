import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import log from "encore.dev/log";

export interface FileSnapshot {
  path: string;
  hash: string;      // SHA-256 av filinnhold
  size: number;       // bytes
}

export interface SnapshotDiff {
  created: string[];   // Nye filer
  modified: string[];  // Endrede filer (hash endret)
  deleted: string[];   // Fjernede filer
  unchanged: number;   // Antall uendrede filer
  totalDiffBytes: number;  // Netto endring i bytes
}

/**
 * Ta snapshot av alle filer i en mappe (rekursivt).
 * Ignorerer node_modules, .git, og binære filer.
 */
export function takeSnapshot(repoDir: string): Map<string, FileSnapshot> {
  const snapshots = new Map<string, FileSnapshot>();

  function walk(dir: string, prefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Mappen eksisterer ikke eller er utilgjengelig
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      // Skip directories vi ikke bryr oss om
      if (entry.isDirectory()) {
        if (["node_modules", ".git", ".next", "dist", "build", ".turbo"].includes(entry.name)) continue;
        walk(fullPath, relativePath);
        continue;
      }

      if (!entry.isFile()) continue;

      // Skip binære filer og store filer
      const ext = path.extname(entry.name).toLowerCase();
      const binaryExts = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".zip", ".tar", ".gz"];
      if (binaryExts.includes(ext)) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 500_000) continue; // Skip filer over 500KB

        const content = fs.readFileSync(fullPath);
        const hash = crypto.createHash("sha256").update(content).digest("hex");

        snapshots.set(relativePath, { path: relativePath, hash, size: stat.size });
      } catch {
        // Skip filer som ikke kan leses
      }
    }
  }

  walk(repoDir, "");
  return snapshots;
}

/**
 * Ta snapshot i Docker-container via exec.
 * Bruker find + sha256sum for å unngå å lese filer ut av containeren.
 */
export async function takeDockerSnapshot(
  run: (cmd: string, timeout?: number) => Promise<{ stdout: string; exitCode: number }>,
): Promise<Map<string, FileSnapshot>> {
  const snapshots = new Map<string, FileSnapshot>();

  try {
    // List alle filer med størrelse og hash
    const result = await run(
      `find /workspace/repo -type f ` +
      `-not -path '*/node_modules/*' ` +
      `-not -path '*/.git/*' ` +
      `-not -path '*/.next/*' ` +
      `-not -path '*/dist/*' ` +
      `-not -name '*.png' -not -name '*.jpg' -not -name '*.gif' ` +
      `-size -500k ` +
      `-exec sh -c 'for f; do sz=$(wc -c < "$f"); h=$(sha256sum "$f" | cut -d" " -f1); echo "$sz $h $f"; done' _ {} +`,
      30_000
    );

    if (result.exitCode !== 0) {
      log.warn("docker snapshot failed", { exitCode: result.exitCode });
      return snapshots;
    }

    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Format: "1234 abc123hash /workspace/repo/src/file.ts"
      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;

      const size = parseInt(parts[0]);
      const hash = parts[1];
      const fullPath = parts.slice(2).join(" ");

      // Konverter til relativ sti
      const relativePath = fullPath.replace(/^\/workspace\/repo\//, "");
      if (relativePath && hash.length === 64) {
        snapshots.set(relativePath, { path: relativePath, hash, size });
      }
    }
  } catch (err) {
    log.warn("docker snapshot error", { error: String(err) });
  }

  return snapshots;
}

/**
 * Sammenlign to snapshots og returner diff.
 */
export function compareSnapshots(before: Map<string, FileSnapshot>, after: Map<string, FileSnapshot>): SnapshotDiff {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  let unchanged = 0;
  let totalDiffBytes = 0;

  // Sjekk filer i after som ikke er i before (created) eller har endret hash (modified)
  for (const [filePath, afterSnap] of after) {
    const beforeSnap = before.get(filePath);
    if (!beforeSnap) {
      created.push(filePath);
      totalDiffBytes += afterSnap.size;
    } else if (beforeSnap.hash !== afterSnap.hash) {
      modified.push(filePath);
      totalDiffBytes += Math.abs(afterSnap.size - beforeSnap.size);
    } else {
      unchanged++;
    }
  }

  // Sjekk filer i before som ikke er i after (deleted)
  for (const [filePath, beforeSnap] of before) {
    if (!after.has(filePath)) {
      deleted.push(filePath);
      totalDiffBytes += beforeSnap.size;
    }
  }

  return { created, modified, deleted, unchanged, totalDiffBytes };
}
