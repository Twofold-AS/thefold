import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./db";

// Fase I.6 — Dispatcher for code-components. Rutes basert på project_type:
// code → GitHub repo (via github-service), framer → Framer Code File API,
// framer_figma → begge hvor Framer er source-of-truth.

const framerApiKey = secret("FramerApiKey");

export interface CodeComponentPayload {
  name: string;
  content: string;
  language: "typescript" | "javascript" | "tsx" | "jsx";
  path?: string;
}

export interface DispatchResult {
  target: "github" | "framer" | "figma" | "skipped";
  success: boolean;
  remoteId?: string;
  url?: string;
  message?: string;
}

// Framer Code File API — docs: https://www.framer.com/developers/code-files
// Stub: i prod ville vi kalle Framer REST/GraphQL API med oauth-token.
async function pushToFramer(
  siteId: string,
  component: CodeComponentPayload,
): Promise<DispatchResult> {
  try {
    const apiKey = framerApiKey();
    if (!apiKey) {
      return { target: "framer", success: false, message: "FramerApiKey not configured" };
    }
    // Endpoint-struktur er forventet basert på Framer API-mønster.
    const res = await fetch(`https://api.framer.com/v1/sites/${siteId}/code-files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: component.name,
        content: component.content,
        language: component.language,
        path: component.path ?? `/code/${component.name}.tsx`,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { target: "framer", success: false, message: `Framer API ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => ({})) as { id?: string; url?: string };
    return { target: "framer", success: true, remoteId: data.id, url: data.url };
  } catch (err) {
    return {
      target: "framer",
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export const dispatchCodeComponent = api(
  { method: "POST", path: "/projects/dispatch/code-component", expose: true, auth: true },
  async (req: {
    projectId: string;
    component: CodeComponentPayload;
  }): Promise<{ results: DispatchResult[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const projectRow = await db.queryRow<{
      id: string;
      name: string;
      project_type: string;
      source_of_truth: string;
      framer_site_url: string | null;
      owner_email: string;
    }>`
      SELECT id, name, project_type, source_of_truth, framer_site_url, owner_email
      FROM projects
      WHERE id = ${req.projectId} AND archived_at IS NULL
    `;
    if (!projectRow) throw APIError.notFound("project not found");
    if (projectRow.owner_email !== auth.email) throw APIError.permissionDenied("not owner");

    const results: DispatchResult[] = [];
    const type = projectRow.project_type;

    // Framer-targets: framer, framer_figma
    if (type === "framer" || type === "framer_figma") {
      // Extract site ID from framer_site_url (format: https://framer.com/projects/<siteId>)
      const siteMatch = projectRow.framer_site_url?.match(/\/projects\/([a-zA-Z0-9_-]+)/);
      const siteId = siteMatch?.[1];
      if (!siteId) {
        results.push({
          target: "framer",
          success: false,
          message: "framer_site_url not configured or invalid",
        });
      } else {
        const r = await pushToFramer(siteId, req.component);
        results.push(r);
      }
    }

    // Code-targets: code, framer_figma (hvis sourceOfTruth === "repo")
    if (type === "code" || (type === "framer_figma" && projectRow.source_of_truth === "repo")) {
      // TODO: wire til github.writeFile — kan gjøres via separat dispatch-step
      results.push({
        target: "github",
        success: false,
        message: "github dispatch not yet wired (pending I.6 integration)",
      });
    }

    if (results.length === 0) {
      results.push({ target: "skipped", success: true, message: "no target platforms for this project type" });
    }

    log.info("code component dispatched", {
      projectId: req.projectId,
      componentName: req.component.name,
      targets: results.map((r) => r.target),
    });
    return { results };
  }
);
