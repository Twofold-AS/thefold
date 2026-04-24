import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { db } from "./db";
import { encryptApiKey, decryptApiKey } from "./lib/crypto";
import { invalidateModelCache, refreshModelCache } from "./router";
import { invalidateRoleCache, type AgentRole } from "./roles";

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
      invalidateModelCache();
      await refreshModelCache(); // ensure next estimateCost() sees the new price
      return { id: req.id };
    } else {
      const row = await db.queryRow<{ id: string }>`
        INSERT INTO ai_models (provider_id, model_id, display_name, input_price, output_price, context_window, max_output_tokens, tags, tier, enabled, supports_tools, supports_vision)
        VALUES (${req.providerId}::uuid, ${req.modelId}, ${req.displayName}, ${req.inputPrice}, ${req.outputPrice}, ${req.contextWindow}, ${req.maxOutputTokens || 8192}, ${req.tags}::text[], ${req.tier}, ${req.enabled}, ${req.supportsTools || false}, ${req.supportsVision || false})
        RETURNING id
      `;
      invalidateModelCache();
      await refreshModelCache();
      return { id: row!.id };
    }
  }
);

export const toggleModel = api(
  { method: "POST", path: "/ai/models/toggle", expose: true, auth: true },
  async (req: { id: string; enabled: boolean }): Promise<void> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    await db.exec`UPDATE ai_models SET enabled = ${req.enabled} WHERE id = ${req.id}::uuid`;
    invalidateModelCache();
  }
);

export const deleteModel = api(
  { method: "POST", path: "/ai/models/delete", expose: true, auth: true },
  async (req: { id: string }): Promise<void> => {
    if (!req.id) throw APIError.invalidArgument("id is required");
    await db.exec`DELETE FROM ai_models WHERE id = ${req.id}::uuid`;
    invalidateModelCache();
  }
);

// --- API Key Management ---

/**
 * Store an encrypted API key for a provider.
 * Sets api_key_set = true. Called from the UI at /settings/models.
 */
export const setProviderApiKey = api(
  { method: "POST", path: "/ai/providers/set-key", expose: true, auth: true },
  async (req: { providerId: string; apiKey: string }): Promise<{ ok: boolean }> => {
    if (!req.providerId) throw APIError.invalidArgument("providerId is required");
    if (!req.apiKey?.trim()) throw APIError.invalidArgument("apiKey is required");

    let encrypted: string;
    try {
      encrypted = encryptApiKey(req.apiKey.trim());
    } catch (e) {
      throw APIError.internal(
        "Encryption failed — is ProviderKeyEncryptionSecret configured? " +
        (e instanceof Error ? e.message : String(e))
      );
    }

    const row = await db.queryRow<{ id: string }>`
      UPDATE ai_providers
      SET encrypted_api_key = ${encrypted}, api_key_set = true
      WHERE id = ${req.providerId}::uuid
      RETURNING id
    `;
    if (!row) {
      throw APIError.notFound(`Provider ${req.providerId} not found`);
    }

    // Invalidate provider cache so the badge updates immediately
    cachedProviders = null;
    log.info("Provider API key updated", { providerId: req.providerId });
    return { ok: true };
  }
);

/**
 * Remove the stored API key for a provider.
 * Sets api_key_set = false and clears encrypted_api_key.
 */
export const clearProviderApiKey = api(
  { method: "POST", path: "/ai/providers/clear-key", expose: true, auth: true },
  async (req: { providerId: string }): Promise<{ ok: boolean }> => {
    if (!req.providerId) throw APIError.invalidArgument("providerId is required");

    await db.exec`
      UPDATE ai_providers
      SET encrypted_api_key = NULL, api_key_set = false
      WHERE id = ${req.providerId}::uuid
    `;

    cachedProviders = null;
    log.info("Provider API key cleared", { providerId: req.providerId });
    return { ok: true };
  }
);

/**
 * Internal endpoint — returns the decrypted API key for a given provider slug.
 * Used by other services (agent, memory) that need the key at runtime.
 * NOT exposed publicly.
 */
export const getProviderKeyInternal = api(
  { method: "POST", path: "/ai/providers/key-internal", expose: false },
  async (req: { slug: string }): Promise<{ apiKey: string }> => {
    const row = await db.queryRow<{ encrypted_api_key: string | null }>`
      SELECT encrypted_api_key
      FROM ai_providers
      WHERE slug = ${req.slug} AND enabled = true
    `;

    if (!row) throw APIError.notFound(`Provider '${req.slug}' not found or disabled`);
    if (!row.encrypted_api_key) {
      throw APIError.failedPrecondition(
        `No API key configured for provider '${req.slug}'. Add it in Settings → AI-modeller.`
      );
    }

    try {
      return { apiKey: decryptApiKey(row.encrypted_api_key) };
    } catch (e) {
      throw APIError.internal(
        `Failed to decrypt API key for '${req.slug}': ` +
        (e instanceof Error ? e.message : String(e))
      );
    }
  }
);

// --- Role-Based Model Preferences ---

export interface RolePreferenceResponse {
  preferences: Record<AgentRole, { modelId: string; priority: number }[]>;
}

/**
 * GET /ai/role-preferences
 * Fetch all role-to-model preferences for the frontend settings UI.
 */
export const getRolePreferences = api(
  { method: "GET", path: "/ai/role-preferences", expose: true, auth: true },
  async (): Promise<RolePreferenceResponse> => {
    const rows = db.query<{ role: string; model_id: string; priority: number }>`
      SELECT role, model_id, priority
      FROM ai_model_role_preferences
      WHERE enabled = true
      ORDER BY role ASC, priority ASC
    `;

    const prefs: Record<string, { modelId: string; priority: number }[]> = {};

    for await (const row of rows) {
      if (!prefs[row.role]) {
        prefs[row.role] = [];
      }
      prefs[row.role].push({ modelId: row.model_id, priority: row.priority });
    }

    return { preferences: prefs };
  }
);

interface SetRolePreferenceRequest {
  role: AgentRole;
  modelId: string;
  priority?: number;
}

interface SetRolePreferenceResponse {
  ok: boolean;
}

/**
 * POST /ai/role-preferences/set
 * Set or update a role-to-model preference.
 */
export const setRolePreference = api(
  { method: "POST", path: "/ai/role-preferences/set", expose: true, auth: true },
  async (req: SetRolePreferenceRequest): Promise<SetRolePreferenceResponse> => {
    if (!req.role || !req.modelId) {
      throw APIError.invalidArgument("role and modelId are required");
    }

    const priority = req.priority ?? 1;

    await db.exec`
      INSERT INTO ai_model_role_preferences (role, model_id, priority, enabled)
      VALUES (${req.role}, ${req.modelId}, ${priority}, true)
      ON CONFLICT (role, model_id) DO UPDATE
      SET priority = ${priority}, updated_at = NOW()
    `;

    invalidateRoleCache(req.role);
    log.info("Role preference updated", { role: req.role, modelId: req.modelId, priority });

    return { ok: true };
  }
);

interface DeleteRolePreferenceRequest {
  role: AgentRole;
  modelId: string;
}

interface DeleteRolePreferenceResponse {
  ok: boolean;
}

/**
 * POST /ai/role-preferences/delete
 * Remove a role-to-model preference.
 */
export const deleteRolePreference = api(
  { method: "POST", path: "/ai/role-preferences/delete", expose: true, auth: true },
  async (req: DeleteRolePreferenceRequest): Promise<DeleteRolePreferenceResponse> => {
    if (!req.role || !req.modelId) {
      throw APIError.invalidArgument("role and modelId are required");
    }

    await db.exec`
      DELETE FROM ai_model_role_preferences
      WHERE role = ${req.role} AND model_id = ${req.modelId}
    `;

    invalidateRoleCache(req.role);
    log.info("Role preference deleted", { role: req.role, modelId: req.modelId });

    return { ok: true };
  }
);
