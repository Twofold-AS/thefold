"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import Btn from "@/components/Btn";
import { RefreshCw, ChevronDown } from "lucide-react";

const inputStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 13,
  color: T.text,
  fontFamily: "var(--font-sans, sans-serif)",
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 100,
  resize: "vertical" as const,
};

interface Skill {
  id: string;
  name: string;
  enabled: boolean;
}

interface TaskFiltersProps {
  syncing: boolean;
  onSync: () => void;
  onCreateTask: (title: string, description: string, repo: string, skillIds: string[]) => Promise<void>;
  repos: string[];
  skills: Skill[];
}

export default function TaskFilters({ syncing, onSync, onCreateTask, repos, skills }: TaskFiltersProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [creating, setCreating] = useState(false);
  const [repoDropOpen, setRepoDropOpen] = useState(false);
  const [newSkillIds, setNewSkillIds] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await onCreateTask(newTitle, newDesc, newRepo || repos[0] || "", newSkillIds);
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setNewRepo(repos[0] || "");
      setNewSkillIds([]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>
              Tasks
            </h2>
            <p style={{ fontSize: 13, color: T.textMuted }}>
              Oppgaver utfort av agenten med kvalitetsrapport.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm onClick={() => setShowCreate(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 4 }}>
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Ny task
            </Btn>
            <Btn primary sm onClick={onSync}>
              <RefreshCw size={14} style={{ marginRight: 4 }} />
              {syncing ? "Synkroniserer..." : "Importer fra Linear"}
            </Btn>
          </div>
        </div>
      </div>

      {showCreate && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 24, width: 480, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 20 }}>Ny oppgave</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Tittel</div>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Beskriv oppgaven..." style={inputStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Beskrivelse</div>
              <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Valgfri beskrivelse..." style={textareaStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Repo</div>
              <div style={{ position: "relative" }}>
                <div
                  onClick={() => setRepoDropOpen(p => !p)}
                  style={{ ...inputStyle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12 }}
                >
                  <span>{newRepo || repos[0] || "Velg repo"}</span>
                  <ChevronDown size={14} strokeWidth={1.5} style={{ color: T.textMuted }} />
                </div>
                {repoDropOpen && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={() => setRepoDropOpen(false)} />
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, zIndex: 99, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                      {repos.map((r) => (
                        <div
                          key={r}
                          onClick={() => { setNewRepo(r); setRepoDropOpen(false); }}
                          style={{ padding: "10px 16px", fontSize: 12, fontFamily: T.mono, color: (newRepo || repos[0]) === r ? T.text : T.textMuted, background: (newRepo || repos[0]) === r ? T.subtle : "transparent", cursor: "pointer" }}
                        >
                          {r}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>Skills</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {skills.map((sk) => {
                  const selected = newSkillIds.includes(sk.id);
                  return (
                    <div
                      key={sk.id}
                      onClick={() => setNewSkillIds(prev => selected ? prev.filter(id => id !== sk.id) : [...prev, sk.id])}
                      style={{ padding: "6px 12px", fontSize: 11, fontFamily: T.mono, border: `1px solid ${selected ? T.accent : T.border}`, borderRadius: 6, color: selected ? T.accent : T.textSec, background: selected ? T.accentDim : "transparent", cursor: "pointer" }}
                    >
                      {sk.name}
                    </div>
                  );
                })}
                {skills.length === 0 && <span style={{ fontSize: 11, color: T.textFaint }}>Ingen skills tilgjengelig</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn sm onClick={() => setShowCreate(false)}>Avbryt</Btn>
              <Btn primary sm onClick={handleCreate} style={{ opacity: creating || !newTitle.trim() ? 0.5 : 1, pointerEvents: creating ? "none" : "auto" }}>
                {creating ? "Oppretter..." : "Opprett"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
