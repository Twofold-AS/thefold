import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import log from "encore.dev/log";
import { integrationsDB as db } from "./db";
import { encryptApiKey, decryptApiKey, previewApiKey } from "./crypto";

// Per-user third-party API-key management (Firecrawl and similar).
// Keys are stored encrypted on integration_configs (api_key_encrypted column).
// Frontend only ever sees api_key_preview — never the raw value.

export type ApiKeyPlatform = "firecrawl" | "brave-search" | "serper";

const SUPPORTED_PLATFORMS: ApiKeyPlatform[] = ["firecrawl", "brave-search", "serper"];

function assertSupportedPlatform(p: string): ApiKeyPlatform {
  if (!SUPPORTED_PLATFORMS.includes(p as ApiKeyPlatform)) {
    throw APIError.invalidArgument(`platform not supported for API-key flow: ${p}`);
  }
  return p as ApiKeyPlatform;
}

export interface ApiKeyStatus {
  platform: ApiKeyPlatform;
  configured: boolean;
  preview: string | null;
  lastTestAt: string | null;
  lastTestStatus: "success" | "error" | null;
}

async function userId(): Promise<string> {
  const auth = getAuthData();
  if (!auth) throw APIError.unauthenticated("not authed");
  return auth.userID;
}

export const getApiKeyStatus = api(
  { method: "POST", path: "/integrations/api-key/status", expose: true, auth: true },
  async (req: { platform: string }): Promise<{ status: ApiKeyStatus }> => {
    const uid = await userId();
    const platform = assertSupportedPlatform(req.platform);

    const row = await db.queryRow<{
      api_key_preview: string | null;
      last_test_at: Date | null;
      last_test_status: string | null;
    }>`
      SELECT api_key_preview, last_test_at, last_test_status
      FROM integration_configs
      WHERE user_id = ${uid}::uuid AND platform = ${platform}
    `;

    return {
      status: {
        platform,
        configured: !!row?.api_key_preview,
        preview: row?.api_key_preview ?? null,
        lastTestAt: row?.last_test_at?.toISOString() ?? null,
        lastTestStatus: (row?.last_test_status as "success" | "error" | null) ?? null,
      },
    };
  }
);

export const setApiKey = api(
  { method: "POST", path: "/integrations/api-key/set", expose: true, auth: true },
  async (req: { platform: string; value: string }): Promise<{ status: ApiKeyStatus }> => {
    const uid = await userId();
    const platform = assertSupportedPlatform(req.platform);
    if (!req.value?.trim()) throw APIError.invalidArgument("value required");

    const encrypted = encryptApiKey(req.value.trim());
    const preview = previewApiKey(req.value.trim());

    // Upsert into integration_configs. Slack/Discord reuse the row via webhook_url;
    // API-key-integrations use the new columns.
    const row = await db.queryRow<{ platform: string; api_key_preview: string }>`
      INSERT INTO integration_configs (user_id, platform, api_key_encrypted, api_key_preview, enabled)
      VALUES (${uid}::uuid, ${platform}, ${encrypted}, ${preview}, true)
      ON CONFLICT (user_id, platform) DO UPDATE SET
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        api_key_preview = EXCLUDED.api_key_preview,
        enabled = true,
        updated_at = NOW()
      RETURNING platform, api_key_preview
    `;
    if (!row) throw APIError.internal("failed to save api key");

    log.info("integration api-key saved", { userId: uid, platform });
    return {
      status: {
        platform,
        configured: true,
        preview: row.api_key_preview,
        lastTestAt: null,
        lastTestStatus: null,
      },
    };
  }
);

export const deleteApiKey = api(
  { method: "POST", path: "/integrations/api-key/delete", expose: true, auth: true },
  async (req: { platform: string }): Promise<{ success: boolean }> => {
    const uid = await userId();
    const platform = assertSupportedPlatform(req.platform);
    await db.exec`
      UPDATE integration_configs
      SET api_key_encrypted = NULL, api_key_preview = NULL,
          last_test_at = NULL, last_test_status = NULL,
          updated_at = NOW()
      WHERE user_id = ${uid}::uuid AND platform = ${platform}
    `;
    return { success: true };
  }
);

export const testApiKey = api(
  { method: "POST", path: "/integrations/api-key/test", expose: true, auth: true },
  async (req: { platform: string }): Promise<{ success: boolean; message: string }> => {
    const uid = await userId();
    const platform = assertSupportedPlatform(req.platform);

    const row = await db.queryRow<{ api_key_encrypted: string | null }>`
      SELECT api_key_encrypted FROM integration_configs
      WHERE user_id = ${uid}::uuid AND platform = ${platform}
    `;
    if (!row?.api_key_encrypted) {
      return { success: false, message: "Ingen API-nøkkel lagret — lagre før du tester." };
    }

    let plaintext: string;
    try {
      plaintext = decryptApiKey(row.api_key_encrypted);
    } catch {
      return { success: false, message: "Kunne ikke dekryptere nøkkelen. Lagre på nytt." };
    }

    let ok = false;
    let message = "";
    try {
      if (platform === "firecrawl") {
        // Firecrawl has no dedicated ping endpoint; use a cheap scrape against a small page.
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${plaintext}`,
          },
          body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
          signal: AbortSignal.timeout(10_000),
        });
        ok = res.ok;
        message = ok ? "Tilkobling OK" : `Firecrawl svarte ${res.status}`;
      } else {
        ok = false;
        message = `Test ikke implementert for ${platform}`;
      }
    } catch (err) {
      ok = false;
      message = err instanceof Error ? err.message : String(err);
    }

    await db.exec`
      UPDATE integration_configs
      SET last_test_at = NOW(), last_test_status = ${ok ? "success" : "error"}, updated_at = NOW()
      WHERE user_id = ${uid}::uuid AND platform = ${platform}
    `;

    return { success: ok, message };
  }
);

// Internal: resolve decrypted key for AI tool handlers. Scoped to user (authed ctx).
export const resolveApiKey = api(
  { method: "POST", path: "/integrations/api-key/resolve", expose: false },
  async (req: { userId: string; platform: string }): Promise<{ value: string | null }> => {
    const platform = assertSupportedPlatform(req.platform);
    const row = await db.queryRow<{ api_key_encrypted: string | null }>`
      SELECT api_key_encrypted FROM integration_configs
      WHERE user_id = ${req.userId}::uuid AND platform = ${platform}
    `;
    if (!row?.api_key_encrypted) return { value: null };
    try {
      return { value: decryptApiKey(row.api_key_encrypted) };
    } catch (err) {
      log.warn("integration api-key decrypt failed", {
        userId: req.userId, platform,
        error: err instanceof Error ? err.message : String(err),
      });
      return { value: null };
    }
  }
);
