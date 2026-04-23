import log from "encore.dev/log";
import { db } from "./chat";

// Dynamic client-import — encore.gen/clients/index.d.ts regenereres ved
// `encore run`, og `projects`-eksporten eksisterer først da. Dynamic import
// lar TS-precheck passere selv mot stale encore.gen mens runtime fungerer.
async function getProjectsClient() {
  const mod = await import("~encore/clients");
  return (mod as unknown as { projects: {
    getProjectContextInternal: (req: { projectId: string }) => Promise<{
      project: {
        id: string;
        name: string;
        projectType: string;
        description: string | null;
        sourceOfTruth: string;
      } | null;
      integrations: Array<{ platform: string; remoteId: string | null; metadata: Record<string, unknown> }>;
    }>;
  } }).projects;
}

// Fase I.1 — Resolver per-samtale prosjekt-kontekst til en tekst-blokk
// som injiseres i system-prompten.

export interface ProjectContextBlock {
  projectId: string;
  projectName: string;
  projectType: string;
  systemPromptSnippet: string;
}

// Hent project_id fra conversation_tool_state eller conversations-tabellen.
async function resolveProjectId(conversationId: string): Promise<string | null> {
  const toolState = await db.queryRow<{ project_id: string | null }>`
    SELECT project_id FROM conversation_tool_state WHERE conversation_id = ${conversationId}
  `;
  if (toolState?.project_id) return toolState.project_id;

  const conv = await db.queryRow<{ project_id: string | null }>`
    SELECT project_id FROM conversations WHERE id = ${conversationId}
  `;
  return conv?.project_id ?? null;
}

export async function buildProjectContextBlock(
  conversationId: string
): Promise<ProjectContextBlock | null> {
  try {
    const projectId = await resolveProjectId(conversationId);
    if (!projectId) return null;

    const projectsClient = await getProjectsClient();
    const ctx = await projectsClient.getProjectContextInternal({ projectId });
    if (!ctx.project) return null;

    // Silent internal reference block — rendered in its own system-prompt
    // section by ai-endpoints.ts (NOT via memoryContext numbered list).
    // Strictly English per TheFold convention: all system instructions are
    // English, but the user-facing reply should be Norwegian.
    const lines: string[] = [];
    lines.push(`## Project Context (internal reference only)`);
    lines.push(`Current project: ${ctx.project.name} (${ctx.project.projectType})`);
    lines.push(`Source of truth: ${ctx.project.sourceOfTruth}`);
    if (ctx.project.description) {
      lines.push(`Description: ${ctx.project.description}`);
    }
    if (ctx.integrations.length > 0) {
      const parts = ctx.integrations.map((i) =>
        i.remoteId ? `${i.platform}:${i.remoteId}` : i.platform,
      );
      lines.push(`Integrations: ${parts.join(", ")}`);
    }
    lines.push("");
    lines.push("IMPORTANT:");
    lines.push(
      "- Use this context to inform your responses but DO NOT narrate, repeat, or announce it to the user.",
    );
    lines.push(
      "- Respond naturally to the user's actual message in Norwegian.",
    );
    lines.push(
      "- If the user just says \"Hei\" or any simple greeting, respond with a greeting — NOT with project info.",
    );
    lines.push(
      "- Only reference project details when the user explicitly asks about the project, repo, or integrations.",
    );

    return {
      projectId: ctx.project.id,
      projectName: ctx.project.name,
      projectType: ctx.project.projectType,
      systemPromptSnippet: lines.join("\n"),
    };
  } catch (err) {
    log.warn("project context resolve failed", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
