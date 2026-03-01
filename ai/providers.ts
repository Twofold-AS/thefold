import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "./db";

// --- In-memory provider cache ---
let cachedProviders: AIProvider[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    // Return cached data if fresh
    if (cachedProviders && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return { providers: cachedProviders };
    }

    try {
      // Single JOIN query — no N+1
      const rows = db.query<{
        p_id: string; p_name: string; slug: string; base_url: string | null;
        api_key_set: boolean; p_enabled: boolean;
        m_id: string | null; provider_id: string; model_id: string; display_name: string;
        input_price: string | number; output_price: string | number;
        context_window: number; max_output_tokens: number;
        tags: string | string[]; tier: number; m_enabled: boolean;
        supports_tools: boolean; supports_vision: boolean;
      }>`
        SELECT
          p.id AS p_id, p.name AS p_name, p.slug, p.base_url, p.api_key_set, p.enabled AS p_enabled,
          m.id AS m_id, m.provider_id, m.model_id, m.display_name,
          m.input_price, m.output_price, m.context_window, m.max_output_tokens,
          m.tags, m.tier, m.enabled AS m_enabled, m.supports_tools, m.supports_vision
        FROM ai_providers p
        LEFT JOIN ai_models m ON m.provider_id = p.id
        ORDER BY p.name ASC, m.tier ASC, m.input_price ASC
      `;

      const providerMap = new Map<string, AIProvider>();

      for await (const row of rows) {
        if (!providerMap.has(row.p_id)) {
          providerMap.set(row.p_id, {
            id: row.p_id,
            name: row.p_name,
            slug: row.slug,
            baseUrl: row.base_url,
            apiKeySet: row.api_key_set,
            enabled: row.p_enabled,
            models: [],
          });
        }

        if (row.m_id) {
          providerMap.get(row.p_id)!.models.push(parseModel({
            id: row.m_id,
            provider_id: row.provider_id,
            model_id: row.model_id,
            display_name: row.display_name,
            input_price: row.input_price,
            output_price: row.output_price,
            context_window: row.context_window,
            max_output_tokens: row.max_output_tokens,
            tags: row.tags,
            tier: row.tier,
            enabled: row.m_enabled,
            supports_tools: row.supports_tools,
            supports_vision: row.supports_vision,
          }));
        }
      }

      const providers = Array.from(providerMap.values());

      // Update cache
      cachedProviders = providers;
      cacheTimestamp = Date.now();

      return { providers };
    } catch (e) {
      log.warn("listProviders failed", { error: e instanceof Error ? e.message : String(e) });
      // Return stale cache if available
      if (cachedProviders) {
        log.warn("listProviders: returning stale cache");
        return { providers: cachedProviders };
      }
      throw e;
    }
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
