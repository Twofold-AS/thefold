"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";
import Btn from "@/components/Btn";
import { updateTask, type TheFoldTask } from "@/lib/api";
import { Check, X } from "lucide-react";

const STATUSES = ["backlog", "planned", "in_progress", "in_review", "done", "blocked"] as const;
const PRIORITIES = [
  { value: 1, label: "Urgent" },
  { value: 2, label: "Høy" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Lav" },
];

const fieldStyle: React.CSSProperties = {
  background: T.subtle,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: T.text,
  fontFamily: T.sans,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.textMuted,
  fontFamily: T.mono,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
  display: "block",
};

interface TaskEditorProps {
  task: TheFoldTask;
  onSaved: (updated: TheFoldTask) => void;
  onCancel: () => void;
}

export default function TaskEditor({ task, onSaved, onCancel }: TaskEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) { setError("Tittel kan ikke være tom."); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await updateTask(task.id, { title, description, status, priority });
      onSaved(result.task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lagring feilet");
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.r,
      padding: "20px 20px",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Title */}
        <div>
          <label style={labelStyle}>Tittel</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={fieldStyle}
            placeholder="Oppgavetittel"
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Beskrivelse</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ ...fieldStyle, minHeight: 88, resize: "vertical" }}
            placeholder="Beskriv oppgaven..."
          />
        </div>

        {/* Status + Priority row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Prioritet</label>
            <select
              value={priority}
              onChange={e => setPriority(Number(e.target.value))}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div style={{
            fontSize: 12, color: T.error, padding: "8px 12px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn sm onClick={onCancel}>
            <X size={13} /> Avbryt
          </Btn>
          <Btn sm primary onClick={handleSave}>
            {saving ? "Lagrer..." : <><Check size={13} /> Lagre</>}
          </Btn>
        </div>
      </div>
    </div>
  );
}
