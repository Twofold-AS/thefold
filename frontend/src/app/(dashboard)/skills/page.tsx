"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import SectionLabel from "@/components/SectionLabel";
import Toggle from "@/components/Toggle";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listSkills, toggleSkill, createSkill, updateSkill, deleteSkill, Skill } from "@/lib/api";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 100,
  resize: "vertical" as const,
};

export default function SkillsPage() {
  const { data, loading, refresh } = useApiData(() => listSkills(), []);
  const [sel, setSel] = useState<string | null>(null);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newPhase, setNewPhase] = useState<"pre_run" | "inject" | "post_run">("inject");
  const [newScope, setNewScope] = useState<"global" | "repo" | "task">("global");
  const [newAppliesTo, setNewAppliesTo] = useState("");
  const [newCategory, setNewCategory] = useState<"framework" | "language" | "security" | "style" | "quality" | "general">("general");
  const [creating, setCreating] = useState(false);

  // Edit dialog state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editPhase, setEditPhase] = useState<"pre_run" | "inject" | "post_run">("inject");
  const [editScope, setEditScope] = useState<"global" | "repo" | "task">("global");
  const [editAppliesTo, setEditAppliesTo] = useState("");
  const [editCategory, setEditCategory] = useState<"framework" | "language" | "security" | "style" | "quality" | "general">("general");
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Category filter
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const allSkills: Skill[] = data?.skills ?? [];
  const skills = filterCategory === "all" ? allSkills : allSkills.filter((s) => s.category === filterCategory);
  const sk = sel !== null ? allSkills.find((s) => s.id === sel) ?? null : null;

  const handleCreateSkill = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createSkill({
        name: newName,
        description: newDesc,
        promptFragment: newPrompt,
        appliesTo: newAppliesTo.trim() ? newAppliesTo.split(",").map((s) => s.trim()).filter(Boolean) : [],
        scope: newScope,
        category: newCategory,
        taskPhase: newPhase,
      });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setNewPrompt("");
      setNewPhase("inject");
      setNewScope("global");
      setNewAppliesTo("");
      setNewCategory("general");
      refresh();
    } catch (e) {
      alert(`Feil ved opprettelse: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (s: Skill) => {
    setEditName(s.name);
    setEditDesc(s.description);
    setEditPrompt(s.promptFragment);
    setEditPhase((s.executionPhase ?? s.taskPhase ?? "inject") as "pre_run" | "inject" | "post_run");
    setEditScope((s.scope ?? "global") as "global" | "repo" | "task");
    setEditAppliesTo((s.appliesTo ?? []).join(", "));
    setEditCategory((s.category ?? "general") as "framework" | "language" | "security" | "style" | "quality" | "general");
    setShowEdit(true);
  };

  const handleSaveEdit = async () => {
    if (!sk) return;
    setSaving(true);
    try {
      await updateSkill({
        id: sk.id,
        name: editName,
        description: editDesc,
        promptFragment: editPrompt,
        appliesTo: editAppliesTo.trim() ? editAppliesTo.split(",").map((s) => s.trim()).filter(Boolean) : [],
        scope: editScope,
        taskPhase: editPhase,
      });
      setShowEdit(false);
      refresh();
    } catch (e) {
      alert(`Feil ved lagring: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sk) return;
    setDeleting(true);
    try {
      await deleteSkill(sk.id);
      setShowDelete(false);
      setSel(null);
      refresh();
    } catch (e) {
      alert(`Feil ved sletting: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ paddingTop: 0 }}>
        <Skeleton rows={4} />
      </div>
    );
  }

  return (
    <>
      <div style={{ paddingTop: 0, paddingBottom: 24 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <div>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: T.text,
                letterSpacing: "-0.03em",
                marginBottom: 8,
              }}
            >
              Skills
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Skills er prompt-fragmenter som beriker TheFolds kontekst. Legg til skills for å forbedre kodegenereringen.
            </p>
          </div>
          <Btn primary onClick={() => setShowCreate(true)} style={{ padding: "10px 20px", fontSize: 14 }}>
            + Ny skill
          </Btn>
        </div>
      </div>

      {/* Tip box */}
      <div style={{
        padding: "12px 16px",
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        marginBottom: 16,
        fontSize: 12,
        color: T.textSec,
        lineHeight: 1.6,
      }}>
        <strong style={{ color: T.accent }}>Tips:</strong> Skills injiseres automatisk i AI-prompten basert på routing-regler.
        Opprett skills for frameworks, kodestil, eller sikkerhetsregler som TheFold skal følge.
        Aktive skills: <strong style={{ color: T.text }}>{allSkills.filter(s => s.enabled).length}</strong> av {allSkills.length}.
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", "general", "framework", "language", "security", "style", "quality"].map((cat) => (
          <div
            key={cat}
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: T.mono,
              cursor: "pointer",
              background: filterCategory === cat ? T.accentDim : "transparent",
              border: `1px solid ${filterCategory === cat ? T.accent : T.border}`,
              color: filterCategory === cat ? T.accent : T.textMuted,
              transition: "all 0.15s",
            }}
          >
            {cat === "all" ? `Alle (${allSkills.length})` : cat}
          </div>
        ))}
      </div>

      {/* Stats bar */}
      <GR>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {[
            { l: "AKTIVE", v: skills.filter((s) => s.enabled).length },
            { l: "PIPELINE-FASER", v: "pre → inject → post" },
            { l: "TOKEN-BUDSJETT", v: "4 000" },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                padding: "18px 20px",
                borderRight: i < 2 ? `1px solid ${T.border}` : "none",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: T.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                {s.l}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: T.text }}>{s.v}</div>
            </div>
          ))}
        </div>
      </GR>

      {/* Skills list + detail */}
      <GR mb={40}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: sk ? "1fr 1fr" : "1fr",
            marginTop: 20,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            minHeight: 300,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ borderRight: sk ? `1px solid ${T.border}` : "none" }}>
            {skills.map((s) => (
              <div
                key={s.id}
                onClick={() => setSel(s.id === sel ? null : s.id)}
                style={{
                  padding: "14px 20px",
                  cursor: "pointer",
                  background: sel === s.id ? T.subtle : "transparent",
                  borderBottom: `1px solid ${T.border}`,
                  borderLeft: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{s.name}</span>
                  <Tag variant={s.enabled ? "success" : "default"}>
                    {s.enabled ? "aktiv" : "av"}
                  </Tag>
                  <Tag>{s.executionPhase ?? "inject"}</Tag>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    prio: {s.priority ?? 0}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    ~{s.tokenEstimate ?? 0} tokens
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    confidence: {((Number(s.confidenceScore) || 0) * 100).toFixed(0)}%
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    {s.totalUses ?? 0}x brukt
                  </span>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                    {(s.routingRules?.keywords?.length ?? 0) +
                      (s.routingRules?.file_patterns?.length ?? 0) +
                      (s.routingRules?.labels?.length ?? 0)} regler
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {sk && (
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: T.text,
                    marginBottom: 8,
                  }}
                >
                  {sk.name}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <Tag variant={sk.enabled ? "success" : "default"}>
                    {sk.enabled ? "aktiv" : "deaktivert"}
                  </Tag>
                  <Tag>{sk.executionPhase ?? "inject"}</Tag>
                  <Tag>{sk.scope}</Tag>
                </div>
              </div>

              <SectionLabel>DETALJER</SectionLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 1,
                  marginBottom: 16,
                }}
              >
                {[
                  { l: "PRIORITET", v: sk.priority ?? 0 },
                  { l: "TOKEN-ESTIMAT", v: `~${sk.tokenEstimate ?? 0}` },
                  { l: "CONFIDENCE", v: `${((sk.confidenceScore ?? 0) * 100).toFixed(0)}%` },
                  { l: "BRUK", v: `${sk.totalUses ?? 0}x` },
                ].map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: T.subtle,
                      padding: "10px 14px",
                      borderRadius: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: T.textMuted,
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      {m.l}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{m.v}</div>
                  </div>
                ))}
              </div>

              <SectionLabel>PROMPT-FRAGMENT</SectionLabel>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: T.textSec,
                  padding: "10px 12px",
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  marginBottom: 16,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 160,
                  overflow: "auto",
                  lineHeight: 1.6,
                }}
              >
                {sk.promptFragment || (
                  <span style={{ color: T.textFaint }}>Ingen prompt-fragment.</span>
                )}
              </div>

              <SectionLabel>ROUTING REGLER</SectionLabel>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: T.textSec,
                  padding: "8px 12px",
                  background: T.subtle,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  marginBottom: 8,
                }}
              >
                {sk.routingRules?.keywords?.join(", ") ?? "ingen regler"}
              </div>
              {(sk.routingRules?.file_patterns?.length || sk.routingRules?.labels?.length) ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {sk.routingRules?.file_patterns?.length ? (
                    <div style={{ flex: 1, fontSize: 11, fontFamily: T.mono, color: T.textFaint, padding: "6px 10px", background: T.subtle, borderRadius: 6 }}>
                      filer: {sk.routingRules.file_patterns.join(", ")}
                    </div>
                  ) : null}
                  {sk.routingRules?.labels?.length ? (
                    <div style={{ flex: 1, fontSize: 11, fontFamily: T.mono, color: T.textFaint, padding: "6px 10px", background: T.subtle, borderRadius: 6 }}>
                      labels: {sk.routingRules.labels.join(", ")}
                    </div>
                  ) : null}
                </div>
              ) : <div style={{ marginBottom: 16 }} />}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Toggle
                  checked={sk.enabled}
                  onChange={async () => {
                    await toggleSkill(sk.id, !sk.enabled);
                    refresh();
                  }}
                  label={sk.enabled ? "Deaktiver" : "Aktiver"}
                />
                <Btn size="sm" onClick={() => openEditModal(sk)}>Rediger</Btn>
                <Btn size="sm" variant="danger" onClick={() => setShowDelete(true)}>Slett</Btn>
              </div>
            </div>
          )}
        </div>
      </GR>

      {/* Create skill dialog */}
      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.15)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.r,
              padding: 24,
              width: 480,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>
              Ny skill
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Navn</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Skill-navn..."
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Beskrivelse</div>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Hva gjør denne skillen..."
                style={textareaStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Prompt-fragment</div>
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Prompt-tekst som injiseres..."
                style={textareaStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Kategori</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["general", "framework", "language", "security", "style", "quality"] as const).map((cat) => (
                  <div
                    key={cat}
                    onClick={() => setNewCategory(cat)}
                    style={{
                      padding: "6px 12px",
                      background: newCategory === cat ? T.accentDim : "transparent",
                      border: `1px solid ${newCategory === cat ? T.accent : T.border}`,
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: T.mono,
                      color: newCategory === cat ? T.accent : T.textSec,
                      cursor: "pointer",
                    }}
                  >
                    {cat}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Scope</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["global", "repo", "task"] as const).map((sc) => (
                  <div
                    key={sc}
                    onClick={() => setNewScope(sc)}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: newScope === sc ? T.accentDim : "transparent",
                      border: `1px solid ${newScope === sc ? T.accent : T.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: T.mono,
                      color: newScope === sc ? T.accent : T.textSec,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {sc}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Gjelder for (komma-separert)</div>
              <input
                value={newAppliesTo}
                onChange={(e) => setNewAppliesTo(e.target.value)}
                placeholder="f.eks. typescript, react, next.js"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Fase</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["pre_run", "inject", "post_run"] as const).map((ph) => (
                  <div
                    key={ph}
                    onClick={() => setNewPhase(ph)}
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: newPhase === ph ? T.accentDim : "transparent",
                      border: `1px solid ${newPhase === ph ? T.accent : T.border}`,
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: T.mono,
                      color: newPhase === ph ? T.accent : T.textSec,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {ph}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn sm onClick={() => setShowCreate(false)}>
                Avbryt
              </Btn>
              <Btn
                primary
                sm
                onClick={handleCreateSkill}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Oppretter..." : "Opprett"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Edit skill dialog */}
      {showEdit && sk && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.15)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowEdit(false); }}
        >
          <div
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.r,
              padding: 24,
              width: 480,
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>
              Rediger skill
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Navn</div>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Beskrivelse</div>
              <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={textareaStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Prompt-fragment</div>
              <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} style={textareaStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Scope</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["global", "repo", "task"] as const).map((sc) => (
                  <div
                    key={sc}
                    onClick={() => setEditScope(sc)}
                    style={{
                      flex: 1, padding: "10px 14px",
                      background: editScope === sc ? T.accentDim : "transparent",
                      border: `1px solid ${editScope === sc ? T.accent : T.border}`,
                      borderRadius: 6, fontSize: 12, fontFamily: T.mono,
                      color: editScope === sc ? T.accent : T.textSec,
                      cursor: "pointer", textAlign: "center",
                    }}
                  >
                    {sc}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Gjelder for (komma-separert)</div>
              <input value={editAppliesTo} onChange={(e) => setEditAppliesTo(e.target.value)} placeholder="f.eks. typescript, react" style={inputStyle} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Fase</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["pre_run", "inject", "post_run"] as const).map((ph) => (
                  <div
                    key={ph}
                    onClick={() => setEditPhase(ph)}
                    style={{
                      flex: 1, padding: "10px 14px",
                      background: editPhase === ph ? T.accentDim : "transparent",
                      border: `1px solid ${editPhase === ph ? T.accent : T.border}`,
                      borderRadius: 6, fontSize: 12, fontFamily: T.mono,
                      color: editPhase === ph ? T.accent : T.textSec,
                      cursor: "pointer", textAlign: "center",
                    }}
                  >
                    {ph}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn size="sm" onClick={() => setShowEdit(false)}>Avbryt</Btn>
              <Btn variant="primary" size="sm" onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
                {saving ? "Lagrer..." : "Lagre"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDelete}
        title="Slett skill"
        message={`Er du sikker på at du vil slette "${sk?.name ?? ""}"? Denne handlingen kan ikke angres.`}
        confirmLabel="Slett"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </>
  );
}
