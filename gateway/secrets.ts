import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";

// Infrastructure secrets — these remain as Encore secrets.
// AI provider keys are now stored encrypted in the DB (ai_providers.encrypted_api_key)
// and managed from the UI at /settings/models.
const gitHubToken = secret("GitHubToken");
const linearAPIKey = secret("LinearAPIKey");
const resendAPIKey = secret("ResendAPIKey");
const authSecret = secret("AuthSecret");

interface SecretStatus {
  name: string;
  configured: boolean;
}

interface SecretsStatusResponse {
  secrets: SecretStatus[];
}

function isConfigured(fn: () => string): boolean {
  try {
    const val = fn();
    return val !== undefined && val !== "";
  } catch {
    return false;
  }
}

export const secretsStatus = api(
  { method: "GET", path: "/gateway/secrets-status", expose: true, auth: true },
  async (): Promise<SecretsStatusResponse> => {
    return {
      secrets: [
        { name: "GitHubToken", configured: isConfigured(gitHubToken) },
        { name: "LinearAPIKey", configured: isConfigured(linearAPIKey) },
        { name: "ResendAPIKey", configured: isConfigured(resendAPIKey) },
        { name: "AuthSecret", configured: isConfigured(authSecret) },
        // Note: ProviderKeyEncryptionSecret is intentionally not checked here —
        // if it is missing, api calls will fail with a clear error message.
        // AI provider keys are shown in Settings → AI-modeller (api_key_set field).
      ],
    };
  }
);
