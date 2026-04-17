"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import {
  listProviders,
  saveModel,
  toggleModel,
  deleteModel,
  saveProvider,
  setProviderApiKey,
  clearProviderApiKey,
  getRolePreferences,
  setRolePreference,
  type AIProvider,
  type AIModelRow,
  type AgentRole,
  type RolePreference,
} from "@/lib/api";
import { ChevronDown, ChevronRight, Trash2, Plus, Pencil, Check, X } from "lucide-react";

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const TIER_LABELS: Record<number, string> = { 1: "Small", 2: "Medium", 3: "Large", 4: "XL", 5: "Max" };
const TIER_COLORS: Record<number, string> = {
  1: T.textFaint,
  2: T.textMuted,
  3: T.textSec,
  4: T.accent,
  5: "#a78bfa",
};

const AGENT_ROLES: { key: AgentRole; label: string; desc: string }[] = [
  { key: "orchestrator", label: "Prosjektplanlegger", desc: "Dekomponerer prosjekter i faser og oppgaver" },
  { key: "planner", label: "Oppgaveplanlegger", desc: "Planlegger enkeltoppgaver og filvalg" },
  { key: "coder", label: "Kodebygger", desc: "Genererer kode fil for fil" },
  { key: "reviewer", label: "Kodereviewer", desc: "Gjennomgår og vurderer kodekvalitet" },
  { key: "debugger", label: "Feilsøker", desc: "Analyserer feil og finner rotårsaker" },
  { key: "tester", label: "Testskriver", desc: "Skriver og validerer tester" },
  { key: "documenter", label: "Dokumentasjon", desc: "Skriver dokumentasjon og kommentarer" },
];

type ModelForm = {
  id?: string;
  providerId: string;
  modelId: string;
  displayName: string;
  inputPrice: string;
  outputPrice: string;
  contextWindow: string;
  maxOutputTokens: string;
  tags: string;
  tier: string;
  enabled: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
};

type ProviderForm = {
  id?: string;
  name: string;
  slug: string;
  baseUrl: string;
  enabled: boolean;
  apiKey: string; // blank = keep existing, value = set new key
};

const emptyModelForm = (providerId: string): ModelForm => ({
  providerId,
  modelId: "",
  displayName: "",
  inputPrice: "",
  outputPrice: "",
  contextWindow: "200000",
  maxOutputTokens: "8192",
  tags: "",
  tier: "3",
  enabled: true,
  supportsTools: true,
  supportsVision: false,
});

const emptyProviderForm = (): ProviderForm => ({
  name: "",
  slug: "",
  baseUrl: "",
  enabled: true,
  apiKey: "",
});

export default function ModelsPage() {
  const { data, loading, refresh } = useApiData(() => listProviders(), []);
  const { data: roleData, loading: roleLoading, refresh: roleRefresh } = useApiData(() => getRolePreferences(), []);
  // Optimistic deletions — models removed here disappear immediately without waiting for refresh
  const [deletedModelIds, setDeletedModelIds] = useState<Set<string>>(new Set());
  const providers: AIProvider[] = (data?.providers ?? []).map(p => ({
    ...p,
    models: (p.models ?? []).filter((m: AIModelRow) => !deletedModelIds.has(m.id)),
  }));

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modelModal, setModelModal] = useState<ModelForm | null>(null);
  const [providerModal, setProviderModal] = useState<ProviderForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmModel, setDeleteConfirmModel] = useState<{ id: string; displayName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleSaving, setRoleSaving] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const openAddModel = (providerId: string) => {
    setModelModal(emptyModelForm(providerId));
    setError(null);
  };

  const openEditModel = (provider: AIProvider, model: AIModelRow) => {
    setModelModal({
      id: model.id,
      providerId: provider.id,
      modelId: model.modelId,
      displayName: model.displayName,
      inputPrice: String(model.inputPrice),
      outputPrice: String(model.outputPrice),
      contextWindow: String(model.contextWindow),
      maxOutputTokens: String(model.maxOutputTokens ?? 8192),
      tags: (model.tags ?? []).join(", "),
      tier: String(model.tier),
      enabled: model.enabled,
      supportsTools: model.supportsTools,
      supportsVision: model.supportsVision,
    });
    setError(null);
  };

  const openEditProvider = (p: AIProvider) => {
    setProviderModal({
      id: p.id,
      name: p.name,
      slug: p.slug,
      baseUrl: p.baseUrl ?? "",
      enabled: p.enabled,
      apiKey: "", // never pre-fill — blank means "keep existing"
    });
    setError(null);
  };

  const handleSaveModel = async () => {
    if (!modelModal) return;
    const { id, providerId, modelId, displayName, inputPrice, outputPrice,
      contextWindow, maxOutputTokens, tags, tier, enabled, supportsTools, supportsVision } = modelModal;
    if (!modelId.trim() || !displayName.trim()) {
      setError("Model ID og visningsnavn er påkrevd.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveModel({
        id,
        providerId,
        modelId: modelId.trim(),
        displayName: displayName.trim(),
        inputPrice: parseFloat(inputPrice) || 0,
        outputPrice: parseFloat(outputPrice) || 0,
        contextWindow: parseInt(contextWindow) || 200000,
        maxOutputTokens: parseInt(maxOutputTokens) || 8192,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        tier: parseInt(tier) || 3,
        enabled,
        supportsTools,
        supportsVision,
      });
      setModelModal(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProvider = async () => {
    if (!providerModal) return;
    const { id, name, slug, baseUrl, enabled, apiKey } = providerModal;
    if (!name.trim() || !slug.trim()) {
      setError("Navn og slug er påkrevd.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await saveProvider({
        id,
        name: name.trim(),
        slug: slug.trim(),
        baseUrl: baseUrl.trim() || undefined,
        enabled,
      });
      // If a new API key was entered, store it encrypted in the DB
      if (apiKey.trim()) {
        const targetId = id ?? result.id;
        await setProviderApiKey(targetId, apiKey.trim());
      }
      setProviderModal(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lagring feilet");
    } finally {
      setSaving(false);
    }
  };

  const handleClearApiKey = async (providerId: string) => {
    try {
      await clearProviderApiKey(providerId);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fjerning av nøkkel feilet");
    }
  };

  const handleToggle = async (modelId: string, enabled: boolean) => {
    setTogglingId(modelId);
    try {
      await toggleModel(modelId, enabled);
      refresh();
    } catch { /* ignore */ } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (modelId: string) => {
    setDeletingId(modelId);
    // Close dialog immediately for snappier UX
    setDeleteConfirmId(null);
    setDeleteConfirmModel(null);
    // Optimistic: hide model immediately
    setDeletedModelIds(prev => new Set([...prev, modelId]));
    try {
      await deleteModel(modelId);
      refresh(); // sync DB state in background
    } catch {
      // Rollback optimistic removal on error
      setDeletedModelIds(prev => { const next = new Set(prev); next.delete(modelId); return next; });
    } finally {
      setDeletingId(null);
    }
  };

  const openDeleteConfirm = (modelId: string, displayName: string) => {
    setDeleteConfirmId(modelId);
    setDeleteConfirmModel({ id: modelId, displayName });
  };

  const handleSetRolePreference = async (role: AgentRole, modelId: string) => {
    setRoleSaving(role);
    try {
      await setRolePreference(role, modelId);
      roleRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lagring av rollepreferanse feilet");
    } finally {
      setRoleSaving(null);
    }
  };

  return (
    <>
      <div style={{ paddingTop: 0, paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>
              AI-modeller
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Administrer leverandører og modeller for agent, chat og analyser.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm onClick={() => { setProviderModal(emptyProviderForm()); setError(null); }}>
              <Plus size={13} style={{ marginRight: 4 }} />
              Ny leverandør
            </Btn>
          </div>
        </div>
      </div>

      <GR>
        {loading ? (
          <div style={{ padding: "24px 0" }}>
            <Skeleton rows={4} />
          </div>
        ) : providers.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            border: `1px dashed ${T.border}`, borderRadius: T.r, color: T.textFaint, fontSize: 13,
          }}>
            Ingen leverandører konfigurert ennå.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {providers.map((provider) => {
              const isOpen = expanded.has(provider.id);
              const enabledCount = provider.models.filter((m) => m.enabled).length;
              return (
                <div
                  key={provider.id}
                  style={{
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r,
                    overflow: "hidden",
                  }}
                >
                  {/* Provider header */}
                  <div
                    onClick={() => toggle(provider.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 20px", cursor: "pointer",
                      background: isOpen ? T.subtle : "transparent",
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ color: T.textFaint, flexShrink: 0 }}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
                          {provider.name}
                        </span>
                        <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint }}>
                          {provider.slug}
                        </span>
                        {!provider.enabled && (
                          <Tag variant="default">disabled</Tag>
                        )}
                      </div>
                      {provider.baseUrl && (
                        <div style={{ fontSize: 11, fontFamily: T.mono, color: T.textFaint, marginTop: 2 }}>
                          {provider.baseUrl}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: T.textMuted }}>
                        {enabledCount}/{provider.models.length} aktive
                      </span>
                      <Tag variant={provider.apiKeySet ? "success" : "error"}>
                        {provider.apiKeySet ? "API-nøkkel OK" : "Mangler nøkkel"}
                      </Tag>
                      <div
                        onClick={(e) => { e.stopPropagation(); openEditProvider(provider); }}
                        style={{ padding: 4, cursor: "pointer", color: T.textFaint }}
                      >
                        <Pencil size={13} />
                      </div>
                    </div>
                  </div>

                  {/* Models list */}
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${T.border}` }}>
                      {provider.models.length === 0 ? (
                        <div style={{ padding: "16px 20px", fontSize: 12, color: T.textFaint }}>
                          Ingen modeller ennå.
                        </div>
                      ) : (
                        <>
                          {/* Column headers */}
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 120px 100px 80px 80px 80px",
                            padding: "8px 20px",
                            borderBottom: `1px solid ${T.border}`,
                          }}>
                            {["MODELL", "TIER", "PRIS INN", "PRIS UT", "TOOLS", ""].map((h, i) => (
                              <div key={i} style={{ fontSize: 10, fontWeight: 600, color: T.textFaint, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                {h}
                              </div>
                            ))}
                          </div>
                          {provider.models.map((model) => (
                            <ModelRow
                              key={model.id}
                              model={model}
                              toggling={togglingId === model.id}
                              deleting={deletingId === model.id}
                              onToggle={(enabled) => handleToggle(model.id, enabled)}
                              onEdit={() => openEditModel(provider, model)}
                              onDelete={() => openDeleteConfirm(model.id, model.displayName)}
                            />
                          ))}
                        </>
                      )}
                      <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}` }}>
                        <Btn sm onClick={() => { openAddModel(provider.id); setExpanded(prev => new Set([...prev, provider.id])); }}>
                          <Plus size={12} style={{ marginRight: 4 }} />
                          Legg til modell
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GR>

      <GR mb={40}>
        {/* Role-based model preferences */}
        <div style={{ marginTop: 24 }}>
          <SectionLabel>ROLLE-BASERTE MODELLPREFERANSER</SectionLabel>
          <p style={{ fontSize: 13, color: T.textMuted, marginBottom: 16 }}>
            Velg hvilken modell som skal brukes for hver agentrolle. Disse instillingene overstyrer complexity-basert valg.
          </p>
          {roleLoading ? (
            <Skeleton rows={3} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {AGENT_ROLES.map((role) => {
                const currentPref = roleData?.preferences[role.key]?.[0];
                const currentModel = currentPref?.modelId;
                return (
                  <div
                    key={role.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "180px 1fr 200px",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      background: T.subtle,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                        {role.label}
                      </div>
                      <div style={{ fontSize: 11, color: T.textFaint }}>
                        {role.desc}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>
                      {currentModel ? (
                        <span style={{ fontFamily: T.mono }}>
                          {providers
                            .flatMap((p) => p.models)
                            .find((m) => m.modelId === currentModel)?.displayName || currentModel}
                        </span>
                      ) : (
                        <span style={{ color: T.textFaint }}>— Ingen konfigurert —</span>
                      )}
                    </div>
                    <select
                      value={currentModel || ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleSetRolePreference(role.key, e.target.value);
                        }
                      }}
                      disabled={roleSaving === role.key || loading}
                      style={{
                        ...inputStyle,
                        fontSize: 12,
                        cursor: roleSaving === role.key ? "default" : "pointer",
                        opacity: roleSaving === role.key ? 0.6 : 1,
                      }}
                    >
                      <option value="">— Velg modell —</option>
                      {providers.flatMap((p) =>
                        p.models.filter((m) => m.enabled).map((m) => (
                          <option key={m.id} value={m.modelId}>
                            {m.displayName}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GR>

      <GR mb={40}>
        {/* Tier reference */}
        <div style={{ marginTop: 24 }}>
          <SectionLabel>TIER-REFERANSE</SectionLabel>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(TIER_LABELS).map(([tier, label]) => (
              <div key={tier} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLORS[Number(tier)] }} />
                <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>T{tier} — {label}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: T.textFaint, marginTop: 8 }}>
            Agenten velger modell basert på tier og task-kompleksitet. T1–T2 for enkle oppgaver, T3 standard, T4–T5 for komplekse. Rolle-baserte preferanser overstyrer disse innstillingene.
          </p>
        </div>
      </GR>

      {/* Model Modal */}
      {modelModal && (
        <Modal title={modelModal.id ? "Rediger modell" : "Legg til modell"} onClose={() => setModelModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FormRow label="Model ID" hint="f.eks. claude-sonnet-4-5">
              <input
                style={inputStyle}
                value={modelModal.modelId}
                onChange={(e) => setModelModal((m) => m && ({ ...m, modelId: e.target.value }))}
                placeholder="provider-model-version"
              />
            </FormRow>
            <FormRow label="Visningsnavn">
              <input
                style={inputStyle}
                value={modelModal.displayName}
                onChange={(e) => setModelModal((m) => m && ({ ...m, displayName: e.target.value }))}
                placeholder="Claude Sonnet 4.5"
              />
            </FormRow>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormRow label="Innpris ($/1M tokens)">
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={modelModal.inputPrice}
                  onChange={(e) => setModelModal((m) => m && ({ ...m, inputPrice: e.target.value }))}
                  placeholder="3.00"
                />
              </FormRow>
              <FormRow label="Utpris ($/1M tokens)">
                <input
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={modelModal.outputPrice}
                  onChange={(e) => setModelModal((m) => m && ({ ...m, outputPrice: e.target.value }))}
                  placeholder="15.00"
                />
              </FormRow>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FormRow label="Kontekstvindu">
                <input
                  style={inputStyle}
                  type="number"
                  value={modelModal.contextWindow}
                  onChange={(e) => setModelModal((m) => m && ({ ...m, contextWindow: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Max output tokens">
                <input
                  style={inputStyle}
                  type="number"
                  value={modelModal.maxOutputTokens}
                  onChange={(e) => setModelModal((m) => m && ({ ...m, maxOutputTokens: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Tier (1–5)">
                <select
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={modelModal.tier}
                  onChange={(e) => setModelModal((m) => m && ({ ...m, tier: e.target.value }))}
                >
                  {[1, 2, 3, 4, 5].map((t) => (
                    <option key={t} value={t}>T{t} — {TIER_LABELS[t]}</option>
                  ))}
                </select>
              </FormRow>
            </div>
            <FormRow label="Roller" hint="Velg relevante roller for denne modellen">
              <RoleSelector
                selectedRoles={modelModal.tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)}
                onChange={(roles) => setModelModal((m) => m && ({ ...m, tags: roles.join(", ") }))}
              />
            </FormRow>
            <div style={{ display: "flex", gap: 24 }}>
              <CheckField
                label="Aktivert"
                checked={modelModal.enabled}
                onChange={(v) => setModelModal((m) => m && ({ ...m, enabled: v }))}
              />
              <CheckField
                label="Støtter verktøy"
                checked={modelModal.supportsTools}
                onChange={(v) => setModelModal((m) => m && ({ ...m, supportsTools: v }))}
              />
              <CheckField
                label="Støtter visjon"
                checked={modelModal.supportsVision}
                onChange={(v) => setModelModal((m) => m && ({ ...m, supportsVision: v }))}
              />
            </div>
            {error && (
              <div style={{ fontSize: 12, color: T.error, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
              <Btn sm onClick={() => setModelModal(null)}>Avbryt</Btn>
              <Btn
                primary sm
                onClick={handleSaveModel}
                style={{ opacity: saving ? 0.6 : 1, pointerEvents: saving ? "none" : "auto" }}
              >
                {saving ? "Lagrer..." : "Lagre"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Provider Modal */}
      {providerModal && (
        <Modal title={providerModal.id ? "Rediger leverandør" : "Ny leverandør"} onClose={() => setProviderModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FormRow label="Navn" hint="f.eks. Anthropic">
              <input
                style={inputStyle}
                value={providerModal.name}
                onChange={(e) => setProviderModal((p) => p && ({ ...p, name: e.target.value }))}
                placeholder="Anthropic"
              />
            </FormRow>
            <FormRow label="Slug" hint="Brukes som intern identifikator">
              <input
                style={inputStyle}
                value={providerModal.slug}
                onChange={(e) => setProviderModal((p) => p && ({ ...p, slug: e.target.value }))}
                placeholder="anthropic"
              />
            </FormRow>
            <FormRow label="Base URL" hint="Valgfri — blank = standard API-URL">
              <input
                style={inputStyle}
                value={providerModal.baseUrl}
                onChange={(e) => setProviderModal((p) => p && ({ ...p, baseUrl: e.target.value }))}
                placeholder="https://api.anthropic.com"
              />
            </FormRow>

            {/* API key field */}
            <FormRow
              label="API-nøkkel"
              hint={providerModal.id
                ? "La stå tom for å beholde eksisterende nøkkel"
                : "Lim inn nøkkel fra leverandørens dashboard"}
            >
              <input
                style={{ ...inputStyle, fontFamily: T.mono, letterSpacing: "0.04em" }}
                type="password"
                autoComplete="new-password"
                value={providerModal.apiKey}
                onChange={(e) => setProviderModal((p) => p && ({ ...p, apiKey: e.target.value }))}
                placeholder={providerModal.id ? "••••••••••••••••  (uendret)" : "sk-ant-..."}
              />
            </FormRow>

            {/* Show "Fjern nøkkel" only when editing an existing provider that has a key */}
            {providerModal.id && (() => {
              const provider = providers.find(p => p.id === providerModal.id);
              return provider?.apiKeySet ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.success, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: T.textMuted }}>API-nøkkel er konfigurert</span>
                  <div style={{ flex: 1 }} />
                  <Btn
                    sm
                    onClick={() => {
                      handleClearApiKey(providerModal.id!);
                      setProviderModal(p => p && ({ ...p, apiKey: "" }));
                    }}
                    style={{ color: T.error, borderColor: T.error }}
                  >
                    Fjern nøkkel
                  </Btn>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.error, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: T.textMuted }}>Ingen API-nøkkel — leverandøren er inaktiv</span>
                </div>
              );
            })()}

            <CheckField
              label="Aktivert"
              checked={providerModal.enabled}
              onChange={(v) => setProviderModal((p) => p && ({ ...p, enabled: v }))}
            />
            {error && (
              <div style={{ fontSize: 12, color: T.error, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
              <Btn sm onClick={() => setProviderModal(null)}>Avbryt</Btn>
              <Btn
                primary sm
                onClick={handleSaveProvider}
                style={{ opacity: saving ? 0.6 : 1, pointerEvents: saving ? "none" : "auto" }}
              >
                {saving ? "Lagrer..." : "Lagre"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmModel && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 101, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setDeleteConfirmId(null); setDeleteConfirmModel(null); } }}
        >
          <div
            style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: T.r, padding: 28, width: 400,
              boxShadow: "0 24px 64px rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              Slett modell?
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20 }}>
              Du er i ferd med å slette <strong>{deleteConfirmModel.displayName}</strong>. Dette kan ikke gjøres om.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn
                sm
                onClick={() => { setDeleteConfirmId(null); setDeleteConfirmModel(null); }}
              >
                Avbryt
              </Btn>
              <Btn
                sm
                primary
                onClick={() => handleDelete(deleteConfirmModel.id)}
                style={{ background: T.error, borderColor: T.error, opacity: deletingId === deleteConfirmModel.id ? 0.6 : 1, pointerEvents: deletingId === deleteConfirmModel.id ? "none" : "auto" }}
              >
                {deletingId === deleteConfirmModel.id ? "Sletter..." : "Slett"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModelRow({
  model,
  toggling,
  deleting,
  onToggle,
  onEdit,
  onDelete,
}: {
  model: AIModelRow;
  toggling: boolean;
  deleting: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tierColor = TIER_COLORS[model.tier] ?? T.textFaint;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px 100px 80px 80px 80px",
        alignItems: "center",
        padding: "10px 20px",
        borderBottom: `1px solid ${T.border}`,
        opacity: model.enabled ? 1 : 0.5,
        transition: "opacity 0.15s",
      }}
    >
      {/* Model info */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text, fontFamily: T.mono }}>
          {model.modelId}
        </div>
        <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>
          {model.displayName}
          {model.tags?.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {model.tags.map((tag) => {
                const role = PREDEFINED_ROLES.find((r) => r.key === tag);
                return (
                  <span
                    key={tag}
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: role ? "rgba(167, 139, 250, 0.15)" : T.border,
                      color: role ? "#a78bfa" : T.textMuted,
                      fontWeight: 500,
                      fontFamily: T.sans,
                    }}
                  >
                    {role?.label || tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tier */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: tierColor }} />
        <span style={{ fontSize: 12, fontFamily: T.mono, color: tierColor }}>
          T{model.tier} {TIER_LABELS[model.tier] ?? ""}
        </span>
      </div>

      {/* Input price */}
      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
        ${(model.inputPrice ?? 0).toFixed(2)}
      </span>

      {/* Output price */}
      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.textMuted }}>
        ${(model.outputPrice ?? 0).toFixed(2)}
      </span>

      {/* Supports tools */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {model.supportsTools
          ? <Check size={13} style={{ color: T.success }} />
          : <X size={13} style={{ color: T.textFaint }} />
        }
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        {/* Toggle */}
        <div
          onClick={() => !toggling && onToggle(!model.enabled)}
          title={model.enabled ? "Deaktiver" : "Aktiver"}
          style={{
            width: 30, height: 16, borderRadius: 8,
            background: model.enabled ? T.accent : T.border,
            cursor: toggling ? "default" : "pointer",
            position: "relative",
            transition: "background 0.2s",
            opacity: toggling ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          <div style={{
            position: "absolute",
            top: 2, left: model.enabled ? 16 : 2,
            width: 12, height: 12, borderRadius: "50%",
            background: T.text,
            transition: "left 0.2s",
          }} />
        </div>
        <div
          onClick={onEdit}
          style={{ padding: 3, cursor: "pointer", color: T.textFaint }}
          title="Rediger"
        >
          <Pencil size={12} />
        </div>
        <div
          onClick={() => !deleting && onDelete()}
          style={{ padding: 3, cursor: deleting ? "default" : "pointer", color: T.error, opacity: deleting ? 0.4 : 1 }}
          title="Slett"
        >
          <Trash2 size={12} />
        </div>
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)",
        zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: T.r, padding: 24, width: 520,
          maxHeight: "85vh", overflow: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function FormRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: T.textFaint }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        border: `1px solid ${checked ? T.accent : T.border}`,
        background: checked ? T.accentDim : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.1s",
      }}>
        {checked && <Check size={10} style={{ color: T.accent }} />}
      </div>
      <span style={{ fontSize: 12, color: T.textSec }}>{label}</span>
    </div>
  );
}

function RoleSelector({
  selectedRoles,
  onChange,
}: {
  selectedRoles: string[];
  onChange: (roles: string[]) => void;
}) {
  const [customTags, setCustomTags] = useState<string[]>([]);

  // Separer predefinerte roller fra custom
  const selected = new Set(selectedRoles);
  const predefinedSelected = PREDEFINED_ROLES.filter((r) => selected.has(r.key));
  const customSelected = selectedRoles.filter((t) => !PREDEFINED_ROLES.some((r) => r.key === t));

  const toggleRole = (key: string) => {
    const newRoles = [...selectedRoles];
    const idx = newRoles.indexOf(key);
    if (idx >= 0) {
      newRoles.splice(idx, 1);
    } else {
      newRoles.push(key);
    }
    onChange(newRoles);
  };

  const removeCustomTag = (tag: string) => {
    onChange(selectedRoles.filter((t) => t !== tag));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Predefinerte roller i 3 kolonner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {PREDEFINED_ROLES.map((role) => (
          <div
            key={role.key}
            onClick={() => toggleRole(role.key)}
            style={{
              padding: "10px 12px",
              border: `1px solid ${selected.has(role.key) ? T.accent : T.border}`,
              borderRadius: 8,
              cursor: "pointer",
              background: selected.has(role.key) ? "rgba(167, 139, 250, 0.1)" : T.subtle,
              transition: "all 0.15s",
              userSelect: "none",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: selected.has(role.key) ? "#a78bfa" : T.text }}>
              {role.label}
            </div>
            <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3 }}>
              {role.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Custom tags under griden */}
      {customSelected.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          {customSelected.map((tag) => (
            <div
              key={tag}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                background: T.border,
                borderRadius: 4,
                fontSize: 11,
                color: T.textMuted,
              }}
            >
              {tag}
              <X
                size={12}
                style={{ cursor: "pointer" }}
                onClick={() => removeCustomTag(tag)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
