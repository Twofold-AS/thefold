"use client";

import { useState, useEffect } from "react";
import { Cpu } from "lucide-react";
import { listModels, type ModelInfo } from "@/lib/api";

interface ModelSelectorProps {
  value: string | null; // null = auto
  onChange: (modelId: string | null) => void;
  mode: "auto" | "manual";
}

export function ModelSelector({ value, onChange, mode }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    listModels()
      .then((res) => setModels(res.models.sort((a, b) => a.tier - b.tier)))
      .catch(() => {});
  }, []);

  if (mode === "auto") {
    return (
      <div
        className="flex items-center gap-1.5 text-xs px-2 py-1"
        style={{ color: "var(--text-muted)" }}
      >
        <Cpu size={14} />
        <span>AI velger automatisk</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Cpu size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-xs py-1 px-2"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "4px",
          color: "var(--text-primary)",
          fontFamily: "inherit",
          cursor: "pointer",
          maxWidth: "220px",
        }}
      >
        <option value="">Auto (AI velger)</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName || (m as any).name || m.id} — ${m.inputCostPer1M.toFixed(2)}/1M
          </option>
        ))}
      </select>
    </div>
  );
}
