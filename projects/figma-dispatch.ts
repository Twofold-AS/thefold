import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./db";

// Fase I.7 — Figma-integrasjon. Figma har ikke samme "Code File API" som Framer —
// in stedet bruker vi Figma Plugin API + REST til å lese nodestruktur og
// generere kode fra valgte noder.

const figmaApiToken = secret("FigmaApiToken");

export interface FigmaNodeRef {
  fileKey: string;
  nodeId: string;
}

export interface FigmaExportResult {
  nodeId: string;
  imageUrl?: string;
  nodeData?: Record<string, unknown>;
  error?: string;
}

async function fetchFigmaNodes(fileKey: string, nodeIds: string[]): Promise<FigmaExportResult[]> {
  const results: FigmaExportResult[] = [];
  try {
    const token = figmaApiToken();
    if (!token) {
      return nodeIds.map((id) => ({ nodeId: id, error: "FigmaApiToken not configured" }));
    }
    // Figma REST: /v1/files/<fileKey>/nodes?ids=<csv>
    const idsParam = encodeURIComponent(nodeIds.join(","));
    const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${idsParam}`, {
      headers: { "X-Figma-Token": token },
    });
    if (!res.ok) {
      const text = await res.text();
      return nodeIds.map((id) => ({ nodeId: id, error: `Figma API ${res.status}: ${text.slice(0, 120)}` }));
    }
    const json = await res.json() as { nodes: Record<string, { document?: Record<string, unknown> }> };
    for (const id of nodeIds) {
      const node = json.nodes?.[id];
      results.push({
        nodeId: id,
        nodeData: node?.document ?? {},
      });
    }
    return results;
  } catch (err) {
    return nodeIds.map((id) => ({ nodeId: id, error: err instanceof Error ? err.message : String(err) }));
  }
}

function extractFileKey(figmaUrl: string): string | null {
  const m = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  return m?.[1] ?? null;
}

export const exportFigmaNodes = api(
  { method: "POST", path: "/projects/dispatch/figma-export", expose: true, auth: true },
  async (req: { projectId: string; nodeIds: string[] }): Promise<{ results: FigmaExportResult[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const projectRow = await db.queryRow<{
      figma_file_url: string | null;
      owner_email: string;
      project_type: string;
    }>`
      SELECT figma_file_url, owner_email, project_type
      FROM projects
      WHERE id = ${req.projectId} AND archived_at IS NULL
    `;
    if (!projectRow) throw APIError.notFound("project not found");
    if (projectRow.owner_email !== auth.email) throw APIError.permissionDenied("not owner");

    const type = projectRow.project_type;
    if (type !== "figma" && type !== "framer_figma") {
      throw APIError.failedPrecondition("project is not figma-linked");
    }
    if (!projectRow.figma_file_url) {
      throw APIError.failedPrecondition("figma_file_url not configured");
    }

    const fileKey = extractFileKey(projectRow.figma_file_url);
    if (!fileKey) {
      throw APIError.failedPrecondition("could not extract file key from figma_file_url");
    }

    if (req.nodeIds.length === 0 || req.nodeIds.length > 100) {
      throw APIError.invalidArgument("nodeIds required (1-100 per call)");
    }

    const results = await fetchFigmaNodes(fileKey, req.nodeIds);
    log.info("figma nodes exported", {
      projectId: req.projectId,
      count: req.nodeIds.length,
      errors: results.filter((r) => r.error).length,
    });
    return { results };
  }
);
