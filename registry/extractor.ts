import { secret } from "encore.dev/config";
import log from "encore.dev/log";
import { ai, registry } from "~encore/clients";

// --- Secrets ---

const RegistryExtractionEnabled = secret("RegistryExtractionEnabled");

// --- Types ---

interface ExtractedComponent {
  name: string;
  description: string;
  category: string; // "auth" | "payments" | "pdf" | "email" | "api" | "database" | "ui" | "utility"
  files: Array<{ path: string; content: string; language: string }>;
  entryPoint: string;
  dependencies: string[];
  tags: string[];
  qualityScore: number; // 0-100
}

/**
 * Extract gjenbrukbare komponenter fra built files using AI.
 * Feature-flagged via RegistryExtractionEnabled secret.
 * Gracefully degrades on errors — never blocks build flow.
 */
export async function extractComponents(params: {
  repo: string;
  files: Array<{ path: string; content: string }>;
  taskDescription: string;
}): Promise<ExtractedComponent[]> {
  // Feature flag check
  let enabled = "false";
  try { enabled = RegistryExtractionEnabled(); } catch { /* not set */ }
  if (enabled !== "true") {
    log.info("registry extraction disabled by feature flag");
    return [];
  }

  // Minimum fil-antall for å vurdere extraction
  if (params.files.length < 2) {
    log.info("too few files for extraction", { fileCount: params.files.length });
    return [];
  }

  // Filtrer bort test-filer og config-filer
  const candidateFiles = params.files.filter((f) =>
    !f.path.includes(".test.") &&
    !f.path.includes(".spec.") &&
    !f.path.includes("node_modules") &&
    !f.path.endsWith(".json") &&
    !f.path.endsWith(".md") &&
    !f.path.endsWith(".lock") &&
    f.content.length > 100 // Ignorer tomme/minimale filer
  );

  if (candidateFiles.length < 2) {
    return [];
  }

  try {
    // Bygg en kompakt representasjon (begrens tokens)
    const filesSummary = candidateFiles.map((f) => ({
      path: f.path,
      // Bare de første 2000 tegn per fil for å holde token-bruk nede
      content: f.content.substring(0, 2000),
      lines: f.content.split("\n").length,
    }));

    // Kall AI for komponent-identifikasjon
    const response = await ai.callForExtraction({
      task: params.taskDescription,
      repo: params.repo,
      files: filesSummary,
    });

    // Valider og begrens til maks 3
    const validated = response.components
      .filter((c) => c.name && c.files.length > 0 && c.qualityScore >= 50)
      .slice(0, 3);

    // Berik med full filinnhold
    const enriched: ExtractedComponent[] = validated.map((c) => ({
      ...c,
      files: c.files.map((cf) => {
        const original = params.files.find((f) => f.path === cf.path);
        return {
          path: cf.path,
          content: original?.content || cf.content,
          language: detectLanguage(cf.path),
        };
      }),
    }));

    log.info("extracted components", {
      repo: params.repo,
      count: enriched.length,
      names: enriched.map((c) => c.name),
    });

    return enriched;
  } catch (err) {
    log.warn("extraction failed", { error: String(err), repo: params.repo });
    return []; // Graceful degradation — aldri blokkér build-flyten
  }
}

function detectLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".html")) return "html";
  return "unknown";
}

/**
 * Extract and register components in one fire-and-forget call.
 * Used by agent/completion.ts STEP 9.5.
 */
export async function extractAndRegister(params: {
  repo: string;
  files: Array<{ path: string; content: string }>;
  taskDescription: string;
}): Promise<number> {
  const components = await extractComponents(params);

  let registered = 0;
  for (const comp of components) {
    try {
      await registry.register({
        name: comp.name,
        description: comp.description,
        category: comp.category as any,
        files: comp.files,
        entryPoint: comp.entryPoint,
        dependencies: comp.dependencies,
        sourceRepo: params.repo,
        tags: comp.tags,
        version: "1.0.0",
      });
      registered++;
      log.info("auto-registered component", { name: comp.name, repo: params.repo });
    } catch (regErr) {
      // Duplikat-navn etc. — logg og fortsett
      log.warn("auto-register failed", { name: comp.name, error: String(regErr) });
    }
  }

  return registered;
}
