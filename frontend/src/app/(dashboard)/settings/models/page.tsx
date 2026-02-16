"use client";

import { useState, useEffect } from "react";
import {
  listProviders,
  saveProvider,
  saveModel,
  toggleModel,
  deleteModel,
  type AIProvider,
  type AIModelRow,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, X } from "lucide-react";

export default function SettingsModelsPage() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [editingProvider, setEditingProvider] = useState<Partial<AIProvider> | null>(null);
  const [editingModel, setEditingModel] = useState<{
    providerId: string;
    model: Partial<AIModelRow> & { providerId?: string };
  } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await listProviders();
      setProviders(res.providers);
      if (!expandedProvider && res.providers.length > 0) {
        setExpandedProvider(res.providers[0].id);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveProvider() {
    if (!editingProvider?.name || !editingProvider?.slug) return;
    setSaving(true);
    try {
      await saveProvider({
        id: editingProvider.id || undefined,
        name: editingProvider.name,
        slug: editingProvider.slug,
        baseUrl: editingProvider.baseUrl || undefined,
        enabled: editingProvider.enabled ?? true,
      });
      setEditingProvider(null);
      await load();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveModel() {
    if (!editingModel?.model.modelId || !editingModel?.model.displayName) return;
    const m = editingModel.model;
    setSaving(true);
    try {
      await saveModel({
        id: m.id || undefined,
        providerId: editingModel.providerId,
        modelId: m.modelId!,
        displayName: m.displayName!,
        inputPrice: m.inputPrice ?? 0,
        outputPrice: m.outputPrice ?? 0,
        contextWindow: m.contextWindow ?? 128000,
        maxOutputTokens: m.maxOutputTokens ?? 8192,
        tags: m.tags ?? [],
        tier: m.tier ?? 3,
        enabled: m.enabled ?? true,
        supportsTools: m.supportsTools ?? false,
        supportsVision: m.supportsVision ?? false,
      });
      setEditingModel(null);
      await load();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleModel(id: string, enabled: boolean) {
    try {
      await toggleModel(id, enabled);
      await load();
    } catch {
      // silent
    }
  }

  async function handleDeleteModel(id: string) {
    try {
      await deleteModel(id);
      await load();
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeaderBar title="AI-modeller" />
        <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Laster leverandorer...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeaderBar title="AI-modeller" />
      <div className="p-6 space-y-4">
        {/* Provider list */}
        {providers.map((p) => {
          const isExpanded = expandedProvider === p.id;
          return (
            <div key={p.id} style={{ border: "1px solid var(--border)" }}>
              {/* Provider header */}
              <button
                onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
                style={{ background: "var(--bg-secondary)", border: "none", cursor: "pointer" }}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {p.name}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {p.slug}
                  </span>
                  {!p.enabled && (
                    <span className="text-[10px] px-1.5 py-0.5" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                      deaktivert
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.models.length} modell{p.models.length !== 1 ? "er" : ""}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProvider({ ...p });
                    }}
                    className="p-1 transition-colors"
                    style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              </button>

              {/* Models list */}
              {isExpanded && (
                <div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                        <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Modell</th>
                        <th className="text-center px-2 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tier</th>
                        <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Input $/1M</th>
                        <th className="text-right px-2 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Output $/1M</th>
                        <th className="text-center px-2 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Kontekst</th>
                        <th className="text-center px-2 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tools</th>
                        <th className="text-center px-2 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Aktiv</th>
                        <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.models.map((m) => (
                        <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="px-4 py-2">
                            <div className="text-sm" style={{ color: m.enabled ? "var(--text-primary)" : "var(--text-muted)" }}>
                              {m.displayName}
                            </div>
                            <div className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                              {m.modelId}
                            </div>
                          </td>
                          <td className="text-center px-2 py-2">
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-medium"
                              style={{
                                background: m.tier >= 4 ? "var(--accent)" : "var(--bg-tertiary)",
                                color: m.tier >= 4 ? "#fff" : "var(--text-secondary)",
                              }}
                            >
                              {m.tier}
                            </span>
                          </td>
                          <td className="text-right px-2 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                            ${Number(m.inputPrice).toFixed(2)}
                          </td>
                          <td className="text-right px-2 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                            ${Number(m.outputPrice).toFixed(2)}
                          </td>
                          <td className="text-center px-2 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                            {(m.contextWindow / 1000).toFixed(0)}K
                          </td>
                          <td className="text-center px-2 py-2">
                            <span className="text-[10px]" style={{ color: m.supportsTools ? "#22c55e" : "var(--text-muted)" }}>
                              {m.supportsTools ? "ja" : "nei"}
                            </span>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button
                              onClick={() => handleToggleModel(m.id, !m.enabled)}
                              className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors"
                              style={{
                                background: m.enabled ? "var(--accent)" : "var(--bg-tertiary)",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              <span
                                className="inline-block h-3 w-3 rounded-full bg-white transition-transform"
                                style={{ transform: m.enabled ? "translateX(1rem)" : "translateX(0.125rem)" }}
                              />
                            </button>
                          </td>
                          <td className="text-right px-4 py-2">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => setEditingModel({ providerId: p.id, model: { ...m, providerId: p.id } })}
                                className="p-1 transition-colors"
                                style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteModel(m.id)}
                                className="p-1 transition-colors"
                                style={{ color: "#ef4444", background: "transparent", border: "none", cursor: "pointer" }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Add model button */}
                  <div className="px-4 py-2" style={{ borderTop: p.models.length > 0 ? "none" : "1px solid var(--border)" }}>
                    <button
                      onClick={() => setEditingModel({
                        providerId: p.id,
                        model: { enabled: true, tier: 3, contextWindow: 128000, maxOutputTokens: 8192, tags: [], supportsTools: false, supportsVision: false },
                      })}
                      className="flex items-center gap-1.5 text-xs transition-colors"
                      style={{ color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Plus size={12} />
                      Legg til modell
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add provider button */}
        <button
          onClick={() => setEditingProvider({ enabled: true })}
          className="flex items-center gap-2 px-4 py-3 text-sm transition-colors w-full"
          style={{ border: "1px dashed var(--border)", color: "var(--text-muted)", background: "transparent", cursor: "pointer" }}
        >
          <Plus size={14} />
          Legg til leverandor
        </button>
      </div>

      {/* Provider edit modal */}
      {editingProvider && (
        <ModalOverlay onClose={() => setEditingProvider(null)}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            {editingProvider.id ? "Rediger leverandor" : "Ny leverandor"}
          </h3>
          <div className="space-y-3">
            <Field label="Navn" value={editingProvider.name || ""} onChange={(v) => setEditingProvider({ ...editingProvider, name: v })} />
            <Field label="Slug" value={editingProvider.slug || ""} onChange={(v) => setEditingProvider({ ...editingProvider, slug: v })} />
            <Field label="Base URL (valgfritt)" value={editingProvider.baseUrl || ""} onChange={(v) => setEditingProvider({ ...editingProvider, baseUrl: v })} />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingProvider.enabled ?? true}
                onChange={(e) => setEditingProvider({ ...editingProvider, enabled: e.target.checked })}
              />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Aktivert</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setEditingProvider(null)} className="btn-secondary text-xs px-3 py-1.5">Avbryt</button>
            <button onClick={handleSaveProvider} disabled={saving} className="btn-primary text-xs px-3 py-1.5">
              {saving ? "Lagrer..." : "Lagre"}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Model edit modal */}
      {editingModel && (
        <ModalOverlay onClose={() => setEditingModel(null)}>
          <h3 className="text-sm font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            {editingModel.model.id ? "Rediger modell" : "Ny modell"}
          </h3>
          <div className="space-y-3">
            <Field label="Model ID" value={editingModel.model.modelId || ""} onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, modelId: v } })} />
            <Field label="Visningsnavn" value={editingModel.model.displayName || ""} onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, displayName: v } })} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Input $/1M" value={editingModel.model.inputPrice ?? 0} onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, inputPrice: v } })} />
              <NumberField label="Output $/1M" value={editingModel.model.outputPrice ?? 0} onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, outputPrice: v } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Kontekst (tokens)" value={editingModel.model.contextWindow ?? 128000} onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, contextWindow: v } })} />
              <NumberField label="Tier (1-5)" value={editingModel.model.tier ?? 3} onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, tier: v } })} />
            </div>
            <Field
              label="Tags (kommaseparert)"
              value={(editingModel.model.tags || []).join(", ")}
              onChange={(v) => setEditingModel({ ...editingModel, model: { ...editingModel.model, tags: v.split(",").map((t) => t.trim()).filter(Boolean) } })}
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={editingModel.model.supportsTools ?? false}
                  onChange={(e) => setEditingModel({ ...editingModel, model: { ...editingModel.model, supportsTools: e.target.checked } })}
                />
                Supports Tools
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={editingModel.model.supportsVision ?? false}
                  onChange={(e) => setEditingModel({ ...editingModel, model: { ...editingModel.model, supportsVision: e.target.checked } })}
                />
                Supports Vision
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={editingModel.model.enabled ?? true}
                  onChange={(e) => setEditingModel({ ...editingModel, model: { ...editingModel.model, enabled: e.target.checked } })}
                />
                Aktivert
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setEditingModel(null)} className="btn-secondary text-xs px-3 py-1.5">Avbryt</button>
            <button onClick={handleSaveModel} disabled={saving} className="btn-primary text-xs px-3 py-1.5">
              {saving ? "Lagrer..." : "Lagre"}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// --- Helper components ---

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-page)",
          border: "1px solid var(--border)",
          padding: "20px",
          width: "100%",
          maxWidth: "480px",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3"
          style={{ color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <X size={14} />
        </button>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm"
        style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)" }}
      />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-1.5 text-sm"
        style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)" }}
      />
    </div>
  );
}
