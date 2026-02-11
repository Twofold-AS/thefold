"use client";

import { useState } from "react";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";

const AI_MODELS = [
  { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
];

export default function SettingsPage() {
  const router = useRouter();
  const [planningModel, setPlanningModel] = useState("claude-sonnet-4-20250514");
  const [codingModel, setCodingModel] = useState("claude-sonnet-4-20250514");
  const [reviewModel, setReviewModel] = useState("claude-sonnet-4-20250514");

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <div>
      <h1 className="font-heading text-[32px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
        Settings
      </h1>
      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
        Configure TheFold
      </p>

      <div className="mt-8 space-y-10">
        {/* AI Models */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            AI Models
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Choose which models TheFold uses for each stage
          </p>
          <div className="space-y-4">
            <ModelSelect
              label="Planning model"
              description="Used to analyze tasks and create implementation plans"
              value={planningModel}
              onChange={setPlanningModel}
            />
            <ModelSelect
              label="Coding model"
              description="Used to write and modify code"
              value={codingModel}
              onChange={setCodingModel}
            />
            <ModelSelect
              label="Review model"
              description="Used to review code changes before creating PRs"
              value={reviewModel}
              onChange={setReviewModel}
            />
          </div>
        </section>

        {/* Integrations */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Integrations
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            Connected services
          </p>
          <div className="space-y-2">
            <IntegrationRow name="GitHub" status="connected" detail="Twofold-AS" />
            <IntegrationRow name="Linear" status="connected" detail="TheFold workspace" />
            <IntegrationRow name="Voyage AI" status="connected" detail="Embeddings" />
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="font-heading text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Account
          </h2>
          <button onClick={handleLogout} className="btn-secondary">
            Log out
          </button>
        </section>
      </div>
    </div>
  );
}

function ModelSelect({ label, description, value, onChange }: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 px-4 rounded-xl"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{description}</div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-auto min-w-[200px] text-sm"
      >
        {AI_MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
    </div>
  );
}

function IntegrationRow({ name, status, detail }: {
  name: string;
  status: "connected" | "disconnected";
  detail: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 px-4"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{name}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{detail}</span>
      </div>
      <span className={status === "connected" ? "badge-active" : "badge-error"}>
        {status === "connected" ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
