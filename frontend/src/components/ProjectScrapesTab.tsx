"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { Globe, Trash2, ExternalLink, RefreshCw, Eye, X } from "lucide-react";
import { T } from "@/lib/tokens";
import {
  listProjectScrapes,
  deleteScrape,
  invalidateScrape,
  type ProjectScrapeItem,
} from "@/lib/api";

interface ProjectScrapesTabProps {
  projectId: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "akkurat nå";
  if (diffMin < 60) return `${diffMin} min siden`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} t siden`;
  const diffD = Math.floor(diffHr / 24);
  return `${diffD} dager siden`;
}

function timeUntil(iso: string, expired: boolean): string {
  if (expired) return "utløpt";
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "utløper snart";
  if (diffMin < 60) return `utløper om ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  return `utløper om ${diffHr} t`;
}

export default function ProjectScrapesTab({ projectId }: ProjectScrapesTabProps) {
  const [records, setRecords] = useState<ProjectScrapeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectScrapeItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listProjectScrapes(projectId, true, 100);
      setRecords(r.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke laste scrapes");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (scrapeId: string) => {
    if (!confirm("Slette denne scrape-cachen?")) return;
    try {
      await deleteScrape(scrapeId);
      setRecords((prev) => prev.filter((r) => r.id !== scrapeId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sletting feilet");
    }
  }, []);

  const handleRefetch = useCallback(async (scrapeId: string) => {
    try {
      await invalidateScrape(scrapeId);
      // Invalidate marks expires_at as passed. Next AI call to web_scrape refetches.
      setRecords((prev) => prev.map((r) => (r.id === scrapeId ? { ...r, expired: true } : r)));
      alert("Cache invalidert. Neste web_scrape-kall henter på nytt.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Re-fetch feilet");
    }
  }, []);

  const handleUseInChat = useCallback((scrapeId: string, url: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tf:use-scrape-in-chat", {
        detail: { scrapeId, url },
      }));
    }
  }, []);

  if (loading) return <div style={{ padding: 20, fontSize: 12, color: T.textMuted }}>Laster scrapes...</div>;
  if (error) return <div style={errorBoxStyle}>{error}</div>;
  if (records.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.textMuted, fontSize: 13 }}>
        Ingen web-scrapes lagret for dette prosjektet ennå.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {records.map((r) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            background: r.expired ? "transparent" : T.subtle,
            border: r.expired ? `1px dashed ${T.border}` : "none",
            borderRadius: 8,
          }}>
            <Globe size={14} color={T.textMuted} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.title ?? r.url}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.url}
              </div>
              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2, fontFamily: T.mono }}>
                {r.wordCount} ord · fetched {timeAgo(r.fetchedAt)} · {timeUntil(r.expiresAt, r.expired)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setPreview(r)} style={actionBtnStyle} title="Vis innhold">
                <Eye size={13} />
              </button>
              {!r.expired && (
                <button onClick={() => handleRefetch(r.id)} style={actionBtnStyle} title="Invalider cache (re-fetch neste gang)">
                  <RefreshCw size={13} />
                </button>
              )}
              <button onClick={() => handleUseInChat(r.id, r.url)} style={actionBtnStyle} title="Bruk i chat">
                <ExternalLink size={13} />
              </button>
              <button onClick={() => handleDelete(r.id)} style={{ ...actionBtnStyle, color: T.error ?? "#f87171" }} title="Slett">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div onClick={() => setPreview(null)} style={backdropStyle}>
          <div onClick={(e) => e.stopPropagation()} style={previewStyle}>
            <div style={previewHeaderStyle}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {preview.title ?? preview.url}
              </div>
              <button onClick={() => setPreview(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.textMuted, display: "flex" }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, padding: "0 14px 10px" }}>
              {preview.url}
            </div>
            <div style={previewBodyStyle}>
              {preview.contentMd.slice(0, 50000)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20,
};

const previewStyle: CSSProperties = {
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  width: "100%",
  maxWidth: 900,
  height: "80vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontFamily: T.sans,
};

const previewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "12px 14px",
  borderBottom: `1px solid ${T.border}`,
};

const previewBodyStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 18px",
  fontFamily: T.mono,
  fontSize: 12,
  color: T.text,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
