import { api, APIError } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// --- Database ---

export const db = new SQLDatabase("skills", { migrations: "./migrations" });

// --- Types ---

export interface Skill {
  id: string;
  name: string;
  description: string;
  promptFragment: string;
  appliesTo: string[];
  scope: string;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- List Skills ---

interface ListSkillsRequest {
  context?: string; // filter by applies_to context (e.g. "coding", "review", "planning", "chat")
  enabledOnly?: boolean;
}

interface ListSkillsResponse {
  skills: Skill[];
}

export const listSkills = api(
  { method: "POST", path: "/skills/list", expose: true, auth: true },
  async (req: ListSkillsRequest): Promise<ListSkillsResponse> => {
    const skills: Skill[] = [];

    if (req.context && req.enabledOnly) {
      const rows = db.query<{
        id: string;
        name: string;
        description: string;
        prompt_fragment: string;
        applies_to: string[];
        scope: string;
        enabled: boolean;
        created_by: string | null;
        created_at: Date;
        updated_at: Date;
      }>`
        SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
        FROM skills
        WHERE ${req.context} = ANY(applies_to) AND enabled = TRUE
        ORDER BY name
      `;
      for await (const row of rows) {
        skills.push(rowToSkill(row));
      }
    } else if (req.context) {
      const rows = db.query<{
        id: string;
        name: string;
        description: string;
        prompt_fragment: string;
        applies_to: string[];
        scope: string;
        enabled: boolean;
        created_by: string | null;
        created_at: Date;
        updated_at: Date;
      }>`
        SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
        FROM skills
        WHERE ${req.context} = ANY(applies_to)
        ORDER BY name
      `;
      for await (const row of rows) {
        skills.push(rowToSkill(row));
      }
    } else if (req.enabledOnly) {
      const rows = db.query<{
        id: string;
        name: string;
        description: string;
        prompt_fragment: string;
        applies_to: string[];
        scope: string;
        enabled: boolean;
        created_by: string | null;
        created_at: Date;
        updated_at: Date;
      }>`
        SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
        FROM skills
        WHERE enabled = TRUE
        ORDER BY name
      `;
      for await (const row of rows) {
        skills.push(rowToSkill(row));
      }
    } else {
      const rows = db.query<{
        id: string;
        name: string;
        description: string;
        prompt_fragment: string;
        applies_to: string[];
        scope: string;
        enabled: boolean;
        created_by: string | null;
        created_at: Date;
        updated_at: Date;
      }>`
        SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
        FROM skills
        ORDER BY name
      `;
      for await (const row of rows) {
        skills.push(rowToSkill(row));
      }
    }

    return { skills };
  }
);

// --- Get Skill ---

interface GetSkillRequest {
  id: string;
}

interface GetSkillResponse {
  skill: Skill;
}

export const getSkill = api(
  { method: "POST", path: "/skills/get", expose: true, auth: true },
  async (req: GetSkillRequest): Promise<GetSkillResponse> => {
    const row = await db.queryRow<{
      id: string;
      name: string;
      description: string;
      prompt_fragment: string;
      applies_to: string[];
      scope: string;
      enabled: boolean;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>`
      SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
      FROM skills
      WHERE id = ${req.id}
    `;

    if (!row) {
      throw APIError.notFound("skill not found");
    }

    return { skill: rowToSkill(row) };
  }
);

// --- Create Skill ---

interface CreateSkillRequest {
  name: string;
  description: string;
  promptFragment: string;
  appliesTo: string[];
  scope?: string;
}

interface CreateSkillResponse {
  skill: Skill;
}

export const createSkill = api(
  { method: "POST", path: "/skills/create", expose: true, auth: true },
  async (req: CreateSkillRequest): Promise<CreateSkillResponse> => {
    if (!req.name || !req.description || !req.promptFragment) {
      throw APIError.invalidArgument("name, description, and promptFragment are required");
    }

    if (!req.appliesTo || req.appliesTo.length === 0) {
      throw APIError.invalidArgument("appliesTo must contain at least one context");
    }

    const validContexts = ["planning", "coding", "review", "chat"];
    for (const ctx of req.appliesTo) {
      if (!validContexts.includes(ctx)) {
        throw APIError.invalidArgument(`invalid context: ${ctx}. Must be one of: ${validContexts.join(", ")}`);
      }
    }

    const scope = req.scope || "global";

    const row = await db.queryRow<{
      id: string;
      name: string;
      description: string;
      prompt_fragment: string;
      applies_to: string[];
      scope: string;
      enabled: boolean;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>`
      INSERT INTO skills (name, description, prompt_fragment, applies_to, scope)
      VALUES (${req.name}, ${req.description}, ${req.promptFragment}, ${req.appliesTo}, ${scope})
      RETURNING id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
    `;

    if (!row) {
      throw APIError.internal("failed to create skill");
    }

    return { skill: rowToSkill(row) };
  }
);

// --- Update Skill ---

interface UpdateSkillRequest {
  id: string;
  name?: string;
  description?: string;
  promptFragment?: string;
  appliesTo?: string[];
  scope?: string;
}

interface UpdateSkillResponse {
  skill: Skill;
}

export const updateSkill = api(
  { method: "POST", path: "/skills/update", expose: true, auth: true },
  async (req: UpdateSkillRequest): Promise<UpdateSkillResponse> => {
    // Check skill exists
    const existing = await db.queryRow<{ id: string }>`
      SELECT id FROM skills WHERE id = ${req.id}
    `;
    if (!existing) {
      throw APIError.notFound("skill not found");
    }

    if (req.appliesTo) {
      const validContexts = ["planning", "coding", "review", "chat"];
      for (const ctx of req.appliesTo) {
        if (!validContexts.includes(ctx)) {
          throw APIError.invalidArgument(`invalid context: ${ctx}. Must be one of: ${validContexts.join(", ")}`);
        }
      }
    }

    // Build update dynamically
    if (req.name !== undefined) {
      await db.exec`UPDATE skills SET name = ${req.name}, updated_at = NOW() WHERE id = ${req.id}`;
    }
    if (req.description !== undefined) {
      await db.exec`UPDATE skills SET description = ${req.description}, updated_at = NOW() WHERE id = ${req.id}`;
    }
    if (req.promptFragment !== undefined) {
      await db.exec`UPDATE skills SET prompt_fragment = ${req.promptFragment}, updated_at = NOW() WHERE id = ${req.id}`;
    }
    if (req.appliesTo !== undefined) {
      await db.exec`UPDATE skills SET applies_to = ${req.appliesTo}, updated_at = NOW() WHERE id = ${req.id}`;
    }
    if (req.scope !== undefined) {
      await db.exec`UPDATE skills SET scope = ${req.scope}, updated_at = NOW() WHERE id = ${req.id}`;
    }

    const row = await db.queryRow<{
      id: string;
      name: string;
      description: string;
      prompt_fragment: string;
      applies_to: string[];
      scope: string;
      enabled: boolean;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>`
      SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
      FROM skills
      WHERE id = ${req.id}
    `;

    if (!row) {
      throw APIError.internal("failed to fetch updated skill");
    }

    return { skill: rowToSkill(row) };
  }
);

// --- Toggle Skill ---

interface ToggleSkillRequest {
  id: string;
  enabled: boolean;
}

interface ToggleSkillResponse {
  skill: Skill;
}

export const toggleSkill = api(
  { method: "POST", path: "/skills/toggle", expose: true, auth: true },
  async (req: ToggleSkillRequest): Promise<ToggleSkillResponse> => {
    const row = await db.queryRow<{
      id: string;
      name: string;
      description: string;
      prompt_fragment: string;
      applies_to: string[];
      scope: string;
      enabled: boolean;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>`
      UPDATE skills SET enabled = ${req.enabled}, updated_at = NOW()
      WHERE id = ${req.id}
      RETURNING id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
    `;

    if (!row) {
      throw APIError.notFound("skill not found");
    }

    return { skill: rowToSkill(row) };
  }
);

// --- Delete Skill ---

interface DeleteSkillRequest {
  id: string;
}

interface DeleteSkillResponse {
  success: boolean;
}

export const deleteSkill = api(
  { method: "POST", path: "/skills/delete", expose: true, auth: true },
  async (req: DeleteSkillRequest): Promise<DeleteSkillResponse> => {
    const row = await db.queryRow<{ id: string }>`
      DELETE FROM skills WHERE id = ${req.id} RETURNING id
    `;

    if (!row) {
      throw APIError.notFound("skill not found");
    }

    return { success: true };
  }
);

// --- Get Active Skills for Context (internal, used by AI service) ---

interface GetActiveSkillsRequest {
  context: string; // "planning" | "coding" | "review" | "chat"
}

interface GetActiveSkillsResponse {
  skills: Skill[];
  promptFragments: string[];
}

export const getActiveSkills = api(
  { method: "POST", path: "/skills/active", expose: false },
  async (req: GetActiveSkillsRequest): Promise<GetActiveSkillsResponse> => {
    const skills: Skill[] = [];

    const rows = db.query<{
      id: string;
      name: string;
      description: string;
      prompt_fragment: string;
      applies_to: string[];
      scope: string;
      enabled: boolean;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>`
      SELECT id, name, description, prompt_fragment, applies_to, scope, enabled, created_by, created_at, updated_at
      FROM skills
      WHERE enabled = TRUE AND ${req.context} = ANY(applies_to)
      ORDER BY name
    `;

    for await (const row of rows) {
      skills.push(rowToSkill(row));
    }

    return {
      skills,
      promptFragments: skills.map((s) => s.promptFragment),
    };
  }
);

// --- Preview System Prompt ---

interface PreviewPromptRequest {
  context: string; // "planning" | "coding" | "review" | "chat"
}

interface PreviewPromptResponse {
  systemPrompt: string;
  activeSkillCount: number;
  activeSkillNames: string[];
}

export const previewPrompt = api(
  { method: "POST", path: "/skills/preview-prompt", expose: true, auth: true },
  async (req: PreviewPromptRequest): Promise<PreviewPromptResponse> => {
    const validContexts = ["planning", "coding", "review", "chat"];
    if (!validContexts.includes(req.context)) {
      throw APIError.invalidArgument(`invalid context: ${req.context}`);
    }

    const result = await getActiveSkills({ context: req.context });

    let systemPrompt = "BASE SYSTEM PROMPT\n\n";
    systemPrompt += "--- Active Skills ---\n\n";

    for (const skill of result.skills) {
      systemPrompt += `${skill.promptFragment}\n\n`;
    }

    return {
      systemPrompt,
      activeSkillCount: result.skills.length,
      activeSkillNames: result.skills.map((s) => s.name),
    };
  }
);

// --- Helper ---

interface SkillRow {
  id: string;
  name: string;
  description: string;
  prompt_fragment: string;
  applies_to: string[];
  scope: string;
  enabled: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    promptFragment: row.prompt_fragment,
    appliesTo: row.applies_to,
    scope: row.scope,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
