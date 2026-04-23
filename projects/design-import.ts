import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { db } from "./db";
import { parseHtmlToDesignIR, inferDesignSource } from "./html-parser";
import type { DesignIR } from "./design-ir";

// Fase I.2 — Design-import. Tar inn HTML-innhold (fra Framer/Figma-eksport)
// base64-enkodet, parser til DesignIR, lagrer i design_imports.
// Full .zip-håndtering (med assets) er senere-fase; her tar vi HTML-teksten direkte.

const MAX_HTML_BYTES = 10 * 1024 * 1024; // 10 MB

async function assertOwnsProject(projectId: string, email: string): Promise<void> {
  const row = await db.queryRow<{ id: string }>`
    SELECT id FROM projects WHERE id = ${projectId} AND owner_email = ${email} AND archived_at IS NULL
  `;
  if (!row) throw APIError.notFound("project not found");
}

export interface DesignImportSummary {
  id: string;
  projectId: string;
  filename: string;
  sizeBytes: number;
  source: string;
  nodeCount: number;
  assetCount: number;
  warnings: string[];
  createdAt: string;
}

function countNodes(ir: DesignIR): number {
  let count = 0;
  const stack = [ir.root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    count++;
    for (const c of n.children) stack.push(c);
  }
  return count;
}

export const uploadDesign = api(
  { method: "POST", path: "/projects/design/upload", expose: true, auth: true },
  async (req: {
    projectId: string;
    filename: string;
    contentBase64: string;
  }): Promise<{ import: DesignImportSummary }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);

    if (!req.contentBase64) throw APIError.invalidArgument("contentBase64 required");

    const buf = Buffer.from(req.contentBase64, "base64");
    if (buf.length > MAX_HTML_BYTES) {
      throw APIError.invalidArgument(`file too large (${buf.length} bytes, max ${MAX_HTML_BYTES})`);
    }

    const html = buf.toString("utf8");
    const source = inferDesignSource(html);

    const warnings: string[] = [];
    let ir: DesignIR;
    try {
      ir = parseHtmlToDesignIR(html, source);
    } catch (err) {
      log.warn("design parse failed", {
        projectId: req.projectId,
        filename: req.filename,
        error: err instanceof Error ? err.message : String(err),
      });
      throw APIError.invalidArgument("could not parse HTML");
    }

    if (ir.root.children.length === 0) warnings.push("no nodes parsed");
    if (ir.stylesheets.length === 0) warnings.push("no stylesheets found");

    const row = await db.queryRow<{ id: string; created_at: Date }>`
      INSERT INTO design_imports (project_id, filename, size_bytes, source, raw_html, design_ir, warnings)
      VALUES (
        ${req.projectId}, ${req.filename}, ${buf.length}, ${source},
        ${html.slice(0, MAX_HTML_BYTES)},
        ${JSON.stringify(ir)}::jsonb,
        ${JSON.stringify(warnings)}::jsonb
      )
      RETURNING id, created_at
    `;
    if (!row) throw APIError.internal("failed to store design import");

    return {
      import: {
        id: row.id,
        projectId: req.projectId,
        filename: req.filename,
        sizeBytes: buf.length,
        source,
        nodeCount: countNodes(ir),
        assetCount: ir.assets.length,
        warnings,
        createdAt: row.created_at.toISOString(),
      },
    };
  }
);

export const listDesignImports = api(
  { method: "POST", path: "/projects/design/list", expose: true, auth: true },
  async (req: { projectId: string }): Promise<{ imports: DesignImportSummary[] }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await assertOwnsProject(req.projectId, auth.email);

    const out: DesignImportSummary[] = [];
    const rows = await db.query<{
      id: string;
      project_id: string;
      filename: string;
      size_bytes: string | number;
      source: string;
      design_ir: unknown;
      warnings: unknown;
      created_at: Date;
    }>`
      SELECT id, project_id, filename, size_bytes, source, design_ir, warnings, created_at
      FROM design_imports
      WHERE project_id = ${req.projectId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    for await (const r of rows) {
      const ir = typeof r.design_ir === "string" ? JSON.parse(r.design_ir) : r.design_ir;
      const warnings = typeof r.warnings === "string" ? JSON.parse(r.warnings) : r.warnings;
      out.push({
        id: r.id,
        projectId: r.project_id,
        filename: r.filename,
        sizeBytes: typeof r.size_bytes === "string" ? parseInt(r.size_bytes, 10) : r.size_bytes,
        source: r.source,
        nodeCount: countNodes(ir as DesignIR),
        assetCount: (ir as DesignIR).assets?.length ?? 0,
        warnings: (warnings as string[]) ?? [],
        createdAt: r.created_at.toISOString(),
      });
    }
    return { imports: out };
  }
);

export const getDesignImport = api(
  { method: "POST", path: "/projects/design/get", expose: true, auth: true },
  async (req: { id: string }): Promise<{
    id: string;
    projectId: string;
    filename: string;
    source: string;
    designIR: DesignIR;
    warnings: string[];
    createdAt: string;
  }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const row = await db.queryRow<{
      id: string;
      project_id: string;
      filename: string;
      source: string;
      design_ir: unknown;
      warnings: unknown;
      created_at: Date;
      owner_email: string;
    }>`
      SELECT di.id, di.project_id, di.filename, di.source, di.design_ir, di.warnings, di.created_at, p.owner_email
      FROM design_imports di
      JOIN projects p ON p.id = di.project_id
      WHERE di.id = ${req.id}
    `;
    if (!row) throw APIError.notFound("design import not found");
    if (row.owner_email !== auth.email) throw APIError.permissionDenied("not owner");

    const ir = typeof row.design_ir === "string" ? JSON.parse(row.design_ir) : row.design_ir;
    const warnings = typeof row.warnings === "string" ? JSON.parse(row.warnings) : row.warnings;
    return {
      id: row.id,
      projectId: row.project_id,
      filename: row.filename,
      source: row.source,
      designIR: ir as DesignIR,
      warnings: (warnings as string[]) ?? [],
      createdAt: row.created_at.toISOString(),
    };
  }
);
