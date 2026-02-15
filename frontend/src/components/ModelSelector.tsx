"use client";

import { useState, useEffect, useRef } from "react";
import { Cpu, ChevronDown } from "lucide-react";
import { listModels, type ModelInfo } from "@/lib/api";

interface ModelSelectorProps {
  value: string | null; // null = auto
  onChange: (modelId: string | null) => void;
  mode: "auto" | "manual";
}

export function ModelSelector({ value, onChange, mode }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listModels()
      .then((res) => setModels(res.models.sort((a, b) => a.tier - b.tier)))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedModel = models.find((m) => m.id === value);
  const label = mode === "auto"
    ? "AI velger automatisk"
    : selectedModel
      ? (selectedModel.displayName || selectedModel.id)
      : "Velg modell...";

  return (
    <div ref={ref} className="w-full h-full" style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full h-full flex items-center gap-2 px-4 text-sm transition-colors cursor-pointer hover:bg-white/5"
        style={{
          color: mode === "manual" && value ? "var(--text-primary)" : "var(--text-muted)",
          background: "transparent",
          border: "none",
        }}
      >
        <Cpu size={14} />
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: "280px",
            background: "var(--bg-page)",
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
              {mode === "auto" ? "Auto-modus — AI velger basert pa oppgave" : "Manuell modus — velg modell"}
            </span>
          </div>

          {/* Auto option */}
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
            style={{
              background: !value ? "var(--bg-hover)" : "transparent",
              border: "none",
              borderBottom: "1px solid var(--border)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { if (value) e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { if (value) e.currentTarget.style.background = "transparent"; }}
          >
            <Cpu size={14} style={{ color: "#3b82f6" }} />
            <div>
              <div className="text-sm">Auto (AI velger)</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Anbefalt — velger basert pa kompleksitet</div>
            </div>
          </button>

          {/* Model list */}
          <div style={{ maxHeight: "240px", overflowY: "auto" }}>
            {models.length === 0 ? (
              <div className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                Laster modeller...
              </div>
            ) : (
              models.map((m) => {
                const isSelected = value === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { onChange(m.id); setOpen(false); }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between transition-colors"
                    style={{
                      background: isSelected ? "var(--bg-hover)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div>
                      <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {m.displayName || m.id}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {m.strengths.slice(0, 2).join(", ")}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        ${m.inputCostPer1M.toFixed(2)}/1M
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
