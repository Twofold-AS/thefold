import { secret } from "encore.dev/config";
import log from "encore.dev/log";

const GitHubAppId = secret("GitHubAppId");
const GitHubAppPrivateKey = secret("GitHubAppPrivateKey");
const GitHubAppEnabled = secret("GitHubAppEnabled");

/**
 * Returns true if the GitHub App integration is enabled via feature flag.
 */
export function isGitHubAppEnabled(): boolean {
  try {
    return GitHubAppEnabled() === "true";
  } catch {
    return false;
  }
}

// Token cache: { [owner]: { token, expiresAt } }
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

/**
 * Generate JWT for GitHub App authentication.
 * JWT is valid for 10 minutes.
 */
async function generateAppJWT(): Promise<string> {
  const privateKeyPem = GitHubAppPrivateKey();
  const appId = GitHubAppId();

  // Import the private key
  const crypto = await import("node:crypto");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // 60 seconds in the past for clock drift
    exp: now + 600, // 10 minutes
    iss: appId,
  };

  // Create JWT manually using Node.js crypto (no external dependency needed)
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${header}.${body}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKeyPem, "base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Get an installation access token for a GitHub org/user.
 * Tokens are cached until 5 minutes before expiry.
 */
export async function getInstallationToken(owner: string): Promise<string> {
  // Check cache
  const cached = tokenCache[owner.toLowerCase()];
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  const jwt = await generateAppJWT();

  // Find installation for this owner
  const installRes = await fetch("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!installRes.ok) {
    throw new Error(`Failed to list GitHub App installations: ${installRes.status}`);
  }

  const installations = await installRes.json();
  const installation = installations.find(
    (i: any) => i.account?.login?.toLowerCase() === owner.toLowerCase()
  );

  if (!installation) {
    throw new Error(`GitHub App not installed on ${owner}. Install it at the app's installation page.`);
  }

  // Generate installation access token
  const tokenRes = await fetch(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!tokenRes.ok) {
    throw new Error(`Failed to create installation token: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();

  // Cache the token
  tokenCache[owner.toLowerCase()] = {
    token: tokenData.token,
    expiresAt: new Date(tokenData.expires_at).getTime(),
  };

  log.info("GitHub App installation token created", { owner });
  return tokenData.token;
}

// Cache for installed org (5 min TTL)
let cachedInstalledOrg: { owner: string; expiresAt: number } | null = null;

/**
 * Get the org/user where the GitHub App is installed.
 * Returns the first installation's account login, cached for 5 minutes.
 */
export async function getInstalledOrg(): Promise<string | null> {
  if (cachedInstalledOrg && cachedInstalledOrg.expiresAt > Date.now()) {
    return cachedInstalledOrg.owner;
  }

  try {
    const jwt = await generateAppJWT();
    const res = await fetch("https://api.github.com/app/installations", {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) return null;

    const installations = await res.json();
    if (!Array.isArray(installations) || installations.length === 0) return null;

    const owner = installations[0].account?.login;
    if (owner) {
      cachedInstalledOrg = { owner, expiresAt: Date.now() + 5 * 60 * 1000 };
      log.info("Resolved installed org from GitHub App", { owner });
    }
    return owner || null;
  } catch (err) {
    log.warn("getInstalledOrg failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Clear cached token for an owner (useful for testing or forced refresh).
 */
export function clearTokenCache(owner?: string): void {
  if (owner) {
    delete tokenCache[owner.toLowerCase()];
  } else {
    Object.keys(tokenCache).forEach(key => delete tokenCache[key]);
  }
}
