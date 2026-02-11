"use client";

import { useState } from "react";

interface SecretField {
  label: string;
  key: string;
  value: string;
}

const SECRETS: SecretField[] = [
  { label: "Anthropic API Key", key: "AnthropicAPIKey", value: "sk-ant-...****" },
  { label: "OpenAI API Key", key: "OpenAIAPIKey", value: "Not configured" },
  { label: "GitHub Token", key: "GitHubToken", value: "ghp_...****" },
  { label: "Linear API Key", key: "LinearAPIKey", value: "lin_api_...****" },
  { label: "Voyage API Key", key: "VoyageAPIKey", value: "pa-...****" },
  { label: "Auth Secret", key: "AuthSecret", value: "Configured" },
];

export default function SecretsPage() {
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  function toggleVisibility(key: string) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <h1 className="font-heading text-[32px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
        Secrets
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        API keys and tokens. Set with <code className="font-mono text-xs" style={{ color: "var(--text-secondary)" }}>encore secret set</code>
      </p>

      <div className="mt-8 space-y-1">
        {SECRETS.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between py-3 px-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div>
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{s.label}</span>
              <span className="text-xs font-mono ml-3" style={{ color: "var(--text-muted)" }}>{s.key}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono" style={{ color: "var(--text-secondary)" }}>
                {visibleKeys.has(s.key) ? s.value : "••••••••"}
              </span>
              <button onClick={() => toggleVisibility(s.key)} className="text-xs" style={{ color: "var(--text-muted)" }}>
                {visibleKeys.has(s.key) ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
