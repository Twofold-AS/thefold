import { api, APIError } from "encore.dev/api";
import { db } from "./db";
import type {
  Template,
  TemplateFile,
  TemplateVariable,
  ListTemplatesRequest,
  GetTemplateRequest,
  UseTemplateRequest,
  UseTemplateResponse,
  CategoryCount,
} from "./types";

// --- Helpers ---

function parseTemplate(row: Record<string, unknown>): Template {
  const files = typeof row.files === "string" ? JSON.parse(row.files) : row.files;
  const dependencies = typeof row.dependencies === "string" ? JSON.parse(row.dependencies) : row.dependencies;
  const variables = typeof row.variables === "string" ? JSON.parse(row.variables) : row.variables;

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    category: row.category as Template["category"],
    framework: (row.framework as string) ?? "next.js",
    files: (files as TemplateFile[]) ?? [],
    dependencies: (dependencies as string[]) ?? [],
    variables: (variables as TemplateVariable[]) ?? [],
    useCount: (row.use_count as number) ?? 0,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function applyVariables(content: string, variables: TemplateVariable[], userVars: Record<string, string>): string {
  let result = content;
  for (const v of variables) {
    const value = userVars[v.name] ?? v.defaultValue;
    result = result.replaceAll(`{{${v.name}}}`, value);
  }
  return result;
}

// ============================================
// Endpoints
// ============================================

// GET /templates/list — List all templates, optional category filter
export const list = api(
  { method: "GET", path: "/templates/list", expose: true, auth: true },
  async (req: ListTemplatesRequest): Promise<{ templates: Template[]; total: number }> => {
    const categoryFilter = req.category ?? null;

    const countRow = await db.queryRow`
      SELECT COUNT(*)::int as count FROM templates
      WHERE (${categoryFilter}::text IS NULL OR category = ${categoryFilter})
    `;

    const rows = await db.query`
      SELECT * FROM templates
      WHERE (${categoryFilter}::text IS NULL OR category = ${categoryFilter})
      ORDER BY use_count DESC, created_at DESC
    `;

    const templates: Template[] = [];
    for await (const row of rows) {
      templates.push(parseTemplate(row));
    }

    return { templates, total: (countRow?.count as number) ?? 0 };
  }
);

// GET /templates/get — Get template by ID
export const get = api(
  { method: "GET", path: "/templates/get", expose: true, auth: true },
  async (req: GetTemplateRequest): Promise<{ template: Template }> => {
    const row = await db.queryRow`
      SELECT * FROM templates WHERE id = ${req.id}::uuid
    `;
    if (!row) throw APIError.notFound("template not found");
    return { template: parseTemplate(row) };
  }
);

// POST /templates/use — Use a template: increment use_count, apply variable substitution
export const useTemplate = api(
  { method: "POST", path: "/templates/use", expose: true, auth: true },
  async (req: UseTemplateRequest): Promise<UseTemplateResponse> => {
    if (!req.id || req.id.trim().length === 0) {
      throw APIError.invalidArgument("id is required");
    }

    const row = await db.queryRow`
      SELECT * FROM templates WHERE id = ${req.id}::uuid
    `;
    if (!row) throw APIError.notFound("template not found");

    const template = parseTemplate(row);
    const userVars = req.variables ?? {};

    // Apply variable substitution to file contents and paths
    const processedFiles: TemplateFile[] = template.files.map((f) => ({
      path: applyVariables(f.path, template.variables, userVars),
      content: applyVariables(f.content, template.variables, userVars),
      language: f.language,
    }));

    // Increment use count
    await db.exec`
      UPDATE templates SET use_count = use_count + 1 WHERE id = ${req.id}::uuid
    `;

    return {
      files: processedFiles,
      dependencies: template.dependencies,
    };
  }
);

// GET /templates/categories — Category names with counts
export const categories = api(
  { method: "GET", path: "/templates/categories", expose: true, auth: true },
  async (): Promise<{ categories: CategoryCount[] }> => {
    const rows = await db.query`
      SELECT category, COUNT(*)::int as count
      FROM templates
      GROUP BY category
      ORDER BY count DESC
    `;

    const result: CategoryCount[] = [];
    for await (const row of rows) {
      result.push({
        category: row.category as string,
        count: row.count as number,
      });
    }

    return { categories: result };
  }
);
