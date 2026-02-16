import { api, APIError } from "encore.dev/api";
import { db } from "./db";

// --- Types ---

export interface AIProvider {
  id: string;
  name: string;
  slug: string;
  baseUrl: string | null;
  apiKeySet: boolean;
  enabled: boolean;
  models: AIModelRow[];
}

export interface AIModelRow {
  id: string;
  modelId: string;
  displayName: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutputTokens: number;
  tags: string[];
  tier: number;
  enabled: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

// --- DB row types ---

interface ProviderRow {
  id: string;
  name: string;
  slug: string;
  base_url: string | null;
  api_key_set: boolean;
  enabled: boolean;
}

interface ModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  input_price: string | number;
  output_price: string | number;
  context_window: number;
  max_output_tokens: number;
  tags: string | string[];
  tier: number;
  enabled: boolean;
  supports_tools: boolean;
  supports_vision: boolean;
}

function parseModel(row: ModelRow): AIModelRow {
  return {
    id: row.id,
    modelId: row.model_id,
    displayName: row.display_name,
    inputPrice: Number(row.input_price),
    outputPrice: Number(row.output_price),
    contextWindow: row.context_window,
    maxOutputTokens: row.max_output_tokens,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags || []),
    tier: row.tier,
    enabled: row.enabled,
    supportsTools: row.supports_tools,
    supportsVision: row.supports_vision,
  };
}

// --- Endpoints ---

export const listProviders = api(
  { method: "GET", path: "/ai/providers", expose: true, auth: true },
  async (): Promise<{ providers: AIProvider[] }> => {
    const providers: AIProvider[] = [];

    const providerRows = db.query<ProviderRow>`
      SELECT id, name, slug, base_url, api_key_set, enabled
      FROM ai_providers ORDER BY name ASC
    `;

    for await (const p of providerRows) {
      const models: AIModelRow[] = [];
      const modelRows = db.query<ModelRow>`
        SELECT id, provider_id, model_id, display_name, input_price, output_price,
          context_window, max_output_tokens, tags, tier, enabled, supports_tools, supports_vision
        FROM ai_models WHERE provider_id = ${p.id}::uuid
        ORDER BY tier ASC, input_price ASC
      `;
      for await (const m of modelRows) {
        models.push(parseModel(m));
      }

      providers.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        baseUrl: p.base_url,
        apiKeySet: p.api_key_set,
        enabled: p.enabled,
        models,
      });
    }

    return { providers };
  }
);

interface SaveProviderRequest {
  id?: string;
  name: string;
  slug: string;
  baseUrl?: string;
  enabled: boolean;
}

export const saveProvider = api(
  { method: "POST", path: "/ai/providers/save", expose: true, auth: true },
  async (req: SaveProviderRequest): Promise<{ id: string }> => {
    if (!req.name || !req.slug) throw APIError.invalidArgument("name and slug are required");

    if (req.id) {
      await db.exec`
        UPDATE ai_providers SET name = ${req.name}, slug = ${req.slug},
        base_url = ${req.baseUrl || null}, enabled = ${req.enabled}
        WHERE id = ${req.id}::uuid
      `;
      return { id: req.id };
    } else {
      const row = await db.queryRow<{ id: string }>`
        INSERT INTO ai_providers (name, slug, base_url, enabled)
        VALUES (${req.name}, ${req.slug}, ${req.baseUrl || null}, ${req.enabled})
        RETURNING id
      `;
      return { id: row!.id };
    }
  }
);

interface SaveModelRequest {
  id?: string;
  providerId: string;
  modelId: string;
  displayName: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutputTokens?: number;
  tags: string[];
  tier: number;
  enabled: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

export const saveModel = api(
  { method: "POST", path: "/ai/models/save", expose: true, auth: true },
  async (req: SaveModelRequest): Promise<{ id: string }> => {
    if (!req.modelId || !req.displayName) throw APIError.invalidArgument("modelId and displayName are required");

    if (req.id) {
      await db.exec`
        UPDATE ai_models SET
          model_id = ${req.modelId}, display_name = ${req.displayName},
          input_price = ${req.inputPrice}, output_price = ${req.outputPrice},
          context_window = ${req.contextWindow}, max_output_tokens = ${req.maxOutputTokens || 8192},
          tags = ${req.tags}::text[], tier = ${req.tier}, enabled = ${req.enabled},
          supports_tools = ${req.supportsTools || false}, supports_vision = ${req.supportsVision || false}
        WHERE id = ${req.id}::uuid
      `;
      return { id: req.id };
    } else {
      const row = await db.queryRow<{ id: string }>`
        INSERT INTO ai_models (provider_id, model_id, display_name, input_price, output_price, context_window, max_output_tokens, tags, tier, enabled, supports_tools, supports_vision)
        VALUES (${req.providerId}::uuid, ${req.modelId}, ${req.displayName}, ${req.inputPrice}, ${req.outputPrice}, ${req.contextWindow}, ${req.maxOutputTokens || 8192}, ${req.tags}::text[], ${req.tier}, ${req.enabled}, ${req.supportsTools || false}, ${req.supportsVision || false})
        RETURNING id
      `;
      return { id: row!.id };
    }
  }
);

export const toggleModel = api(
  { method: "POST", path: "/ai/models/toggle", expose: true, auth: true },
  async (req: { id: string; enabled: boolean }): Promise<void> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    await db.exec`UPDATE ai_models SET enabled = ${req.enabled} WHERE id = ${req.id}::uuid`;
  }
);

export const deleteModel = api(
  { method: "POST", path: "/ai/models/delete", expose: true, auth: true },
  async (req: { id: string }): Promise<void> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    await db.exec`DELETE FROM ai_models WHERE id = ${req.id}::uuid`;
  }
);
