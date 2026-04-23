"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { FileText, Trash2, ExternalLink, GitCompareArrows, History } from "lucide-react";
import { T } from "@/lib/tokens";
import {
  listProjectUploads,
  deleteUpload,
  type ProjectUploadItem,
} from "@/lib/api";

interface ProjectFilesTabProps {
  projectId: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Group uploads by filename. Each group is a version-chain with the latest first.
 * Requires that callers pass `includeSuperseded=true` when fetching.
 */
function groupByFilename(list: ProjectUploadItem[]): Map<string, ProjectUploadItem[]> {
  const map = new Map<string, ProjectUploadItem[]>();
  for (const u of list) {
    const arr = map.get(u.filename) ?? [];
    arr.push(u);
    map.set(u.filename, arr);
  }
  // Newest version first per group
  for (const [k, v] of map) {
    v.sort((a, b) => b.version - a.version);
    map.set(k, v);
  }
  return map;
}

export default function ProjectFilesTab({ projectId }: ProjectFilesTabProps) {
  const [uploads, setUploads] = useState<ProjectUploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOld, setShowOld] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listProjectUploads(projectId, true, 200);
      setUploads(r.uploads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke laste filer");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (uploadId: string) => {
    if (!confirm("Slette denne filen?")) return;
    try {
      await deleteUpload(uploadId);
      setUploads((prev) => prev.filter((u) => u.uploadId !== uploadId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sletting feilet");
    }
  }, []);

  const handleOpenDiff = useCallback((oldId: string, newId: string) => {
    // Dispatch event so chat can pick up diff request and run diff_uploads tool.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tf:run-diff-uploads", {
        detail: { oldUploadId: oldId, newUploadId: newId },
      }));
    }
  }, []);

  const handleUseInChat = useCallback((uploadId: string, filename: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tf:use-upload-in-chat", {
        detail: { uploadId, filename },
      }));
    }
  }, []);

  if (loading) {
    return <div style={{ padding: 20, fontSize: 12, color: T.textMuted }}>Laster filer...</div>;
  }
  if (error) {
    return <div style={errorBoxStyle}>{error}</div>;
  }
  if (uploads.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
        Ingen opplastede filer i dette prosjektet ennå.
      </div>
    );
  }

  const groups = groupByFilename(uploads);
  const groupEntries = Array.from(groups.entries()).sort(([, a], [, b]) => {
    const aDate = new Date(a[0].createdAt).getTime();
    const bDate = new Date(b[0].createdAt).getTime();
    return bDate - aDate;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groupEntries.map(([filename, versions]) => {
        const latest = versions[0];
        const older = versions.slice(1);
        const showingOld = !!showOld[filename];
        return (
          <div key={filename} style={groupStyle}>
            <UploadRow
              upload={latest}
              isLatest
              hasOlder={older.length > 0}
              showingOld={showingOld}
              onToggleOld={() => setShowOld((p) => ({ ...p, [filename]: !p[filename] }))}
              onDelete={() => handleDelete(latest.uploadId)}
              onDiffNewer={null}
              onUseInChat={() => handleUseInChat(latest.uploadId, latest.filename)}
            />
            {showingOld && older.map((v, i) => (
              <UploadRow
                key={v.uploadId}
                upload={v}
                isLatest={false}
                nested
                onDelete={() => handleDelete(v.uploadId)}
                onDiffNewer={() => handleOpenDiff(v.uploadId, versions[i].uploadId)}
                onUseInChat={() => handleUseInChat(v.uploadId, v.filename)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface UploadRowProps {
  upload: ProjectUploadItem;
  isLatest: boolean;
  nested?: boolean;
  hasOlder?: boolean;
  showingOld?: boolean;
  onToggleOld?: () => void;
  onDelete: () => void;
  onDiffNewer: (() => void) | null;
  onUseInChat: () => void;
}

function UploadRow({
  upload, isLatest, nested, hasOlder, showingOld, onToggleOld,
  onDelete, onDiffNewer, onUseInChat,
}: UploadRowProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px",
      background: nested ? "transparent" : T.subtle,
      border: nested ? `1px solid ${T.border}` : "none",
      borderRadius: 8,
      marginLeft: nested ? 20 : 0,
    }}>
      <FileText size={14} color={T.textMuted} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {upload.filename}
          </span>
          {!isLatest && (
            <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.mono }}>
              v{upload.version}
            </span>
          )}
          {isLatest && upload.version > 1 && (
            <span style={{ fontSize: 10, color: T.accent, fontFamily: T.mono }}>
              v{upload.version} (latest)
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
          {formatBytes(upload.totalBytes)} · {upload.fileCount} filer · {formatDate(upload.createdAt)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {isLatest && hasOlder && (
          <button onClick={onToggleOld} style={actionBtnStyle} title="Vis eldre versjoner">
            <History size={13} />
            <span style={{ fontSize: 11 }}>{showingOld ? "Skjul" : "Versjoner"}</span>
          </button>
        )}
        {onDiffNewer && (
          <button onClick={onDiffNewer} style={actionBtnStyle} title="Diff mot forrige">
            <GitCompareArrows size={13} />
            <span style={{ fontSize: 11 }}>Diff</span>
          </button>
        )}
        <button onClick={onUseInChat} style={actionBtnStyle} title="Bruk i chat">
          <ExternalLink size={13} />
          <span style={{ fontSize: 11 }}>Chat</span>
        </button>
        <button onClick={onDelete} style={{ ...actionBtnStyle, color: T.error ?? "#f87171" }} title="Slett">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

const groupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const actionBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 8px",
  background: "transparent",
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  color: T.textMuted,
  cursor: "pointer",
  fontFamily: T.sans,
};

const errorBoxStyle: CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  color: T.error ?? "#f87171",
  background: "rgba(248,113,113,0.08)",
  borderRadius: 6,
};
