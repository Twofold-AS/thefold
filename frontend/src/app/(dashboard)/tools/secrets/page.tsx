"use client";

import { useEffect, useState } from "react";
import { getSecretsStatus, type SecretStatus } from "@/lib/api";

const SECRET_LABELS: Record<string, { label: string; description: string }> = {
  AnthropicAPIKey: { label: "Anthropic API", description: "Claude AI-modeller for kode-generering og analyse" },
  GitHubToken: { label: "GitHub", description: "Tilgang til repos, branches og pull requests" },
  LinearAPIKey: { label: "Linear", description: "Oppgavesynkronisering og statusoppdateringer" },
  VoyageAPIKey: { label: "Voyage AI", description: "Embedding-generering for semantisk minne" },
  ResendAPIKey: { label: "Resend", description: "OTP-levering for innlogging via e-post" },
  AuthSecret: { label: "Auth HMAC", description: "Token-signering for autentisering" },
  MonitorEnabled: { label: "Monitor", description: "Feature-flag for daglige helsesjekkinger" },
};

export default function SecretsPage() {
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await getSecretsStatus();
        setSecrets(result.secrets);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const configuredCount = secrets.filter((s) => s.configured).length;

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="card p-5">
        <h2 className="text-lg font-sans font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          API-n&oslash;kler &amp; Secrets
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Oversikt over secrets som TheFold trenger for &aring; fungere. Verdier settes via Encore CLI og er aldri synlige i frontend.
        </p>
        {!loading && !error && (
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            {configuredCount}/{secrets.length} konfigurert
          </p>
        )}
      </div>

      {/* Secrets list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-sans font-medium" style={{ color: "var(--text-primary)" }}>
            Konfigurerte secrets
          </h3>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Laster...
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Kunne ikke hente secrets-status. Sjekk at backend kj&oslash;rer.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {secrets.map((s) => {
              const info = SECRET_LABELS[s.name] || { label: s.name, description: "" };
              return (
                <div key={s.name} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>
                        {info.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                        {s.name}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {info.description}
                    </p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-1 rounded font-medium flex-shrink-0"
                    style={{
                      background: s.configured ? "#22c55e20" : "#ef444420",
                      color: s.configured ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {s.configured ? "Konfigurert" : "Mangler"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="card p-5">
        <h3 className="text-sm font-sans font-medium mb-3" style={{ color: "var(--text-primary)" }}>
          Slik setter du secrets
        </h3>
        <div className="p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <code className="text-xs font-mono block" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--text-muted)" }}># Sett en secret for lokal utvikling</span>
            {"\n"}encore secret set --type dev SecretName
            {"\n"}
            {"\n"}<span style={{ color: "var(--text-muted)" }}># Sett en secret for produksjon</span>
            {"\n"}encore secret set --type prod SecretName
            {"\n"}
            {"\n"}<span style={{ color: "var(--text-muted)" }}># List alle secrets</span>
            {"\n"}encore secret list
          </code>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          Secrets lagres sikkert i Encore sin infrastruktur og injiseres automatisk ved oppstart.
          De er aldri tilgjengelige via API eller frontend.
        </p>
      </div>
    </div>
  );
}
