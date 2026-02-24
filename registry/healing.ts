import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { CronJob } from "encore.dev/cron";
import log from "encore.dev/log";
import { db } from "./db";

// --- Feature flag ---

const HealingPipelineEnabled = secret("HealingPipelineEnabled");

function isHealingEnabled(): boolean {
  try {
    return HealingPipelineEnabled() === "true";
  } catch {
    return false;
  }
}

// --- Types ---

interface HealingReport {
  action: "healed" | "skipped" | "failed";
  reason?: string;
  oldScore?: number;
  newScore?: number;
  filesChanged?: string[];
  version?: number;
}

interface MaintenanceReport {
  timestamp: string;
  componentsScanned: number;
  componentsHealed: number;
  issues: Array<{ type: string; component: string; score: number; action: string }>;
  recommendations: string[];
}

// --- Core healing logic ---

export async function healComponent(componentId: string): Promise<HealingReport> {
  if (!isHealingEnabled()) {
    return { action: "skipped", reason: "Healing disabled by feature flag" };
  }

  const component = await db.queryRow<{
    id: string;
    name: string;
    quality_score: number;
    files: string;
    version: string;
  }>`
    SELECT id, name, quality_score, files::text, version FROM components WHERE id = ${componentId}::uuid
  `;

  if (!component) {
    return { action: "failed", reason: "Component not found" };
  }

  if (component.quality_score >= 60) {
    return { action: "skipped", reason: "Quality score above threshold" };
  }

  try {
    const { ai } = await import("~encore/clients");
    const files =
      typeof component.files === "string"
        ? JSON.parse(component.files)
        : component.files;

    // Ask AI to improve the component
    const improved = await ai.chat({
      messages: [
        {
          role: "user",
          content: `Component "${component.name}" has quality score ${component.quality_score}/100. Improve its code quality.\n\nFiles:\n${JSON.stringify(files, null, 2)}\n\nReturn ONLY a JSON object with: { "files": [{"path": "...", "content": "...", "language": "..."}], "score": <number 0-100>, "changes": ["description of change 1", ...] }`,
        },
      ],
      memoryContext: [],
      systemContext: "agent_coding",
      model: "auto",
    });

    const jsonMatch = improved.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { action: "failed", reason: "AI did not return valid JSON" };
    }

    const result = JSON.parse(jsonMatch[0]);

    // Parse version as number for incrementing, fallback to 1
    const currentVersion = parseInt(component.version, 10) || 1;
    const newVersion = currentVersion + 1;
    const newScore = Math.min(result.score || component.quality_score + 10, 100);

    await db.exec`
      UPDATE components
      SET files = ${JSON.stringify(result.files)}::jsonb,
          quality_score = ${newScore},
          version = ${String(newVersion)},
          updated_at = NOW()
      WHERE id = ${componentId}::uuid
    `;

    log.info("Component healed", {
      componentId,
      name: component.name,
      oldScore: component.quality_score,
      newScore,
      version: newVersion,
    });

    return {
      action: "healed",
      oldScore: component.quality_score,
      newScore,
      filesChanged: result.changes || [],
      version: newVersion,
    };
  } catch (err) {
    log.warn("Healing failed", {
      componentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      action: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- Maintenance endpoint + cron ---

export const runMaintenance = api(
  { method: "POST", path: "/registry/maintenance/run", expose: true, auth: true },
  async (): Promise<MaintenanceReport> => {
    const report: MaintenanceReport = {
      timestamp: new Date().toISOString(),
      componentsScanned: 0,
      componentsHealed: 0,
      issues: [],
      recommendations: [],
    };

    if (!isHealingEnabled()) {
      report.recommendations.push(
        "Healing is disabled. Set HealingPipelineEnabled=true to enable."
      );
      return report;
    }

    const rows = db.query<{ id: string; name: string; quality_score: number }>`
      SELECT id, name, quality_score FROM components ORDER BY quality_score ASC
    `;

    for await (const comp of rows) {
      report.componentsScanned++;

      if (comp.quality_score < 60) {
        const healResult = await healComponent(comp.id);

        if (healResult.action === "healed") {
          report.componentsHealed++;
        }

        report.issues.push({
          type: "low_quality",
          component: comp.name,
          score: comp.quality_score,
          action: healResult.action,
        });
      }
    }

    if (report.componentsHealed > 0) {
      report.recommendations.push(
        `${report.componentsHealed} components improved. Review changes.`
      );
    }
    if (report.issues.length === 0) {
      report.recommendations.push("All components above quality threshold.");
    }

    log.info("Maintenance completed", {
      scanned: report.componentsScanned,
      healed: report.componentsHealed,
    });

    return report;
  }
);

// Weekly maintenance cron — Friday 03:00 UTC
const _maintenanceCron = new CronJob("weekly-maintenance", {
  title: "Weekly code maintenance",
  schedule: "0 3 * * 5",
  endpoint: runMaintenance,
});

// --- Exposed endpoint for manual healing ---

export const healComponentEndpoint = api(
  { method: "POST", path: "/registry/heal", expose: true, auth: true },
  async (req: { componentId: string }): Promise<HealingReport> => {
    return healComponent(req.componentId);
  }
);
