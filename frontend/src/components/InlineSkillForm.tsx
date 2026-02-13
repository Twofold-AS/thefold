"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createSkill } from "@/lib/api";

interface InlineSkillFormProps {
  onClose: () => void;
  onCreated: () => void;
}

const CONTEXT_OPTIONS = ["chat", "coding", "review", "planning"];

export function InlineSkillForm({ onClose, onCreated }: InlineSkillFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promptFragment, setPromptFragment] = useState("");
  const [appliesTo, setAppliesTo] = useState<string[]>(["chat"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleContext(ctx: string) {
    setAppliesTo((prev) =>
      prev.includes(ctx) ? prev.filter((c) => c !== ctx) : [...prev, ctx]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !promptFragment.trim()) {
      setError("Navn og prompt-fragment er påkrevd");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createSkill({
        name: name.trim(),
        description: description.trim(),
        promptFragment: promptFragment.trim(),
        appliesTo,
      });
      onCreated();
      onClose();
    } catch {
      setError("Kunne ikke opprette skill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "8px",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Ny skill
        </span>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="Navn"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field w-full"
          style={{ fontSize: "13px" }}
        />
        <input
          type="text"
          placeholder="Beskrivelse (valgfritt)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field w-full"
          style={{ fontSize: "13px" }}
        />
        <textarea
          placeholder="Prompt-fragment..."
          value={promptFragment}
          onChange={(e) => setPromptFragment(e.target.value)}
          className="input-field w-full resize-none"
          style={{ fontSize: "13px", minHeight: "60px" }}
          rows={3}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Gjelder for:</span>
          {CONTEXT_OPTIONS.map((ctx) => (
            <button
              key={ctx}
              type="button"
              onClick={() => toggleContext(ctx)}
              className="text-[10px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                border: "1px solid var(--border)",
                background: appliesTo.includes(ctx) ? "rgba(99,102,241,0.15)" : "transparent",
                color: appliesTo.includes(ctx) ? "#818cf8" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {ctx}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-[10px]" style={{ color: "#ef4444" }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="text-xs px-3 py-1"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
            Avbryt
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-xs px-3 py-1 rounded"
            style={{
              background: "#6366f1",
              color: "#fff",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Oppretter..." : "Opprett"}
          </button>
        </div>
      </form>
    </div>
  );
}
