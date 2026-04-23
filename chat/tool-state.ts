import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { db } from "./chat";

// Fase I.0.e — Per-samtale tool-state persistence for "+"-popup.
// JSONB tool_toggles gir fleksibilitet uten migrasjoner.

export type ChatMode = "chat" | "auto" | "plan";

export interface ToolState {
  conversationId: string;
  userEmail: string;
  toolToggles: Record<string, boolean>;
  selectedSkillIds: string[];
  selectedModel: string | null;
  projectId: string | null;
  mode: ChatMode;
  createdAt: string;
  updatedAt: string;
}

interface ToolStateRow {
  conversation_id: string;
  user_email: string;
  tool_toggles: unknown;
  selected_skill_ids: string[];
  selected_model: string | null;
  project_id: string | null;
  mode: string;
  created_at: Date;
  updated_at: Date;
}

function parseRow(r: ToolStateRow): ToolState {
  const toggles = typeof r.tool_toggles === "string" ? JSON.parse(r.tool_toggles) : (r.tool_toggles ?? {});
  const mode: ChatMode = r.mode === "auto" || r.mode === "plan" ? r.mode : "chat";
  return {
    conversationId: r.conversation_id,
    userEmail: r.user_email,
    toolToggles: toggles as Record<string, boolean>,
    selectedSkillIds: r.selected_skill_ids ?? [],
    selectedModel: r.selected_model,
    projectId: r.project_id,
    mode,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// Default-toggles for nye samtaler. Trygge defaults — ingen eksterne kall på.
const DEFAULT_TOGGLES: Record<string, boolean> = {
  firecrawl: false,
  websearch: false,
  planMode: false,
  subAgents: false,
  incognito: false,
  autoMode: false,
};

export const getToolState = api(
  { method: "POST", path: "/chat/tool-state/get", expose: true, auth: true },
  async (req: { conversationId: string }): Promise<{ state: ToolState }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    const row = await db.queryRow<ToolStateRow>`
      SELECT conversation_id, user_email, tool_toggles, selected_skill_ids,
             selected_model, project_id, mode, created_at, updated_at
      FROM conversation_tool_state
      WHERE conversation_id = ${req.conversationId} AND user_email = ${auth.email}
    `;
    if (row) return { state: parseRow(row) };

    // Auto-seed defaults hvis samtalen ikke har state ennå.
    const now = new Date();
    return {
      state: {
        conversationId: req.conversationId,
        userEmail: auth.email,
        toolToggles: { ...DEFAULT_TOGGLES },
        selectedSkillIds: [],
        selectedModel: null,
        projectId: null,
        mode: "chat",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    };
  }
);

export const saveToolState = api(
  { method: "POST", path: "/chat/tool-state/save", expose: true, auth: true },
  async (req: {
    conversationId: string;
    toolToggles?: Record<string, boolean>;
    selectedSkillIds?: string[];
    selectedModel?: string | null;
    projectId?: string | null;
    mode?: ChatMode;
  }): Promise<{ state: ToolState }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");

    const toggles = req.toolToggles ?? {};
    const skillIds = req.selectedSkillIds ?? [];
    const mode: ChatMode = req.mode ?? "chat";

    const row = await db.queryRow<ToolStateRow>`
      INSERT INTO conversation_tool_state (
        conversation_id, user_email, tool_toggles,
        selected_skill_ids, selected_model, project_id, mode
      )
      VALUES (
        ${req.conversationId}, ${auth.email}, ${JSON.stringify(toggles)}::jsonb,
        ${skillIds}, ${req.selectedModel ?? null}, ${req.projectId ?? null}, ${mode}
      )
      ON CONFLICT (conversation_id) DO UPDATE SET
        tool_toggles = EXCLUDED.tool_toggles,
        selected_skill_ids = EXCLUDED.selected_skill_ids,
        selected_model = EXCLUDED.selected_model,
        project_id = EXCLUDED.project_id,
        mode = EXCLUDED.mode,
        updated_at = NOW()
      WHERE conversation_tool_state.user_email = ${auth.email}
      RETURNING conversation_id, user_email, tool_toggles, selected_skill_ids,
                selected_model, project_id, mode, created_at, updated_at
    `;
    if (!row) throw APIError.permissionDenied("conversation belongs to another user");
    return { state: parseRow(row) };
  }
);

export const resetToolState = api(
  { method: "POST", path: "/chat/tool-state/reset", expose: true, auth: true },
  async (req: { conversationId: string }): Promise<{ success: boolean }> => {
    const auth = getAuthData();
    if (!auth) throw APIError.unauthenticated("not authed");
    await db.exec`
      DELETE FROM conversation_tool_state
      WHERE conversation_id = ${req.conversationId} AND user_email = ${auth.email}
    `;
    return { success: true };
  }
);
