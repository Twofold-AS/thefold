"use client";

import { useState } from "react";
import { T } from "@/lib/tokens";

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
}

interface ChangedFilesPanelProps {
  files: FileChange[];
}

function getIconAndColor(status: FileChange["status"]): { icon: string; color: string } {
  switch (status) {
    case "added":
      return { icon: "add_circle", color: "#22c55e" }; // Green
    case "modified":
      return { icon: "edit", color: "#f59e0b" }; // Amber
    case "deleted":
      return { icon: "delete", color: "#f87171" }; // Red
  }
}

function getStatusLabel(status: FileChange["status"]): string {
  switch (status) {
    case "added":
      return "Lagt til";
    case "modified":
      return "Endret";
    case "deleted":
      return "Slettet";
  }
}

export default function ChangedFilesPanel({ files }: ChangedFilesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (files.length === 0) {
    return null;
  }

  const grouped = files.reduce(
    (acc, file) => {
      if (!acc[file.status]) acc[file.status] = [];
      acc[file.status].push(file);
      return acc;
    },
    {} as Record<FileChange["status"], FileChange[]>
  );

  const statusOrder: FileChange["status"][] = ["added", "modified", "deleted"];
  const ordered = statusOrder.filter(status => grouped[status]);

  return (
    <div
      style={{
        background: T.raised,
        border: `1px solid ${T.border}`,
        borderRadius: T.r,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          cursor: "pointer",
          background: collapsed ? T.subtle : "transparent",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.textMuted }}>
            {collapsed ? "expand_more" : "expand_less"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            Endrede filer ({files.length})
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.textMuted }}>
          {ordered.map(status => (
            <span key={status}>
              <span style={{ fontWeight: 500 }}>{grouped[status]!.length}</span>
              {" "}
              {getStatusLabel(status).toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ maxHeight: 240, overflowY: "auto", borderTop: `1px solid ${T.border}` }}>
          {ordered.map((status) => (
            <div key={status}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: T.textFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  padding: "6px 14px",
                  background: T.subtle,
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                {getStatusLabel(status)}
              </div>
              {grouped[status]!.map((file) => {
                const { icon, color } = getIconAndColor(file.status);
                return (
                  <div
                    key={file.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderBottom: `1px solid ${T.border}`,
                      fontSize: 12,
                      color: T.text,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color, flexShrink: 0 }}>
                      {icon}
                    </span>
                    <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: T.mono, fontSize: 11, color: T.textMuted }}>
                      {file.path}
                    </code>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
