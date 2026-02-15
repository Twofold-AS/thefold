import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";

// Declare all project secrets for status checking
// These are globally unique — same values as used by other services
const anthropicAPIKey = secret("AnthropicAPIKey");
const gitHubToken = secret("GitHubToken");
const linearAPIKey = secret("LinearAPIKey");
const voyageAPIKey = secret("VoyageAPIKey");
const resendAPIKey = secret("ResendAPIKey");
const authSecret = secret("AuthSecret");
const monitorEnabled = secret("MonitorEnabled");

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
        { name: "AnthropicAPIKey", configured: isConfigured(anthropicAPIKey) },
        { name: "GitHubToken", configured: isConfigured(gitHubToken) },
        { name: "LinearAPIKey", configured: isConfigured(linearAPIKey) },
        { name: "VoyageAPIKey", configured: isConfigured(voyageAPIKey) },
        { name: "ResendAPIKey", configured: isConfigured(resendAPIKey) },
        { name: "AuthSecret", configured: isConfigured(authSecret) },
        { name: "MonitorEnabled", configured: isConfigured(monitorEnabled) },
      ],
    };
  }
);
