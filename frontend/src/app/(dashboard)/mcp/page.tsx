"use client";

import { useState, useEffect } from "react";
import { T } from "@/lib/tokens";
import Tag from "@/components/Tag";
import Btn from "@/components/Btn";
import Toggle from "@/components/Toggle";
import { GR } from "@/components/GridRow";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listMCPServers, installMCPServer, uninstallMCPServer } from "@/lib/api";

export default function MCPPage() {
  const { data, loading, refresh } = useApiData(() => listMCPServers(), []);
  const [rte, setRte] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("mcp-routing");
    if (saved !== null) setRte(saved === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("mcp-routing", String(rte));
  }, [rte]);

  const svs = (data?.servers ?? []).filter(s => s.name !== "linear-mcp");

  const handleInstall = async (id: string) => {
    try {
      await installMCPServer(id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Installasjon feilet");
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await uninstallMCPServer(id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Avinstallering feilet");
    }
  };

  const handleConfigure = (name: string) => {
    alert(`Konfigurasjon for ${name} er ikke tilgjengelig ennå.`);
  };

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: T.text, letterSpacing: "-0.03em", marginBottom: 8 }}>MCP Servere</h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>Model Context Protocol — verktøy agenten kan bruke.</p>
      </div>

      <GR>
        <div style={{ border: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: T.textSec }}>MCP Routing</span>
            <Toggle checked={rte} onChange={setRte} label={rte ? "Aktivert" : "Deaktivert"} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Tag variant={rte ? "success" : "default"}>{rte ? "routing aktiv" : "routing av"}</Tag>
            <Tag>{loading ? "–" : svs.filter(s => s.status === "installed").length} installert</Tag>
            <Tag>{loading ? "–" : svs.length} totalt</Tag>
          </div>
        </div>
      </GR>

      <GR mb={40}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 20, borderRadius: 12, border: `1px solid ${T.border}`, position: "relative", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, gridColumn: "1 / -1" }}>
              <Skeleton rows={4} />
            </div>
          ) : svs.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", gridColumn: "1 / -1" }}>
              <span style={{ fontSize: 13, color: T.textMuted }}>Ingen MCP-servere funnet.</span>
            </div>
          ) : (
            svs.map((s, i) => {
              const ir = i % 2 === 1;
              const nl = i < svs.length - 2 || (svs.length % 2 === 1 && i < svs.length - 1);
              const isInstalled = s.status === "installed";
              const isHealthy = isInstalled;
              return (
                <div key={s.id} style={{ padding: 20, borderRight: ir ? "none" : `1px solid ${T.border}`, borderBottom: nl ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{s.name}</span>
                    <Tag variant={isInstalled ? "success" : "default"}>{s.status}</Tag>
                    {isHealthy && <Tag variant="success">healthy</Tag>}
                    {s.status === "error" && <Tag variant="error">error</Tag>}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint, marginBottom: 6 }}>{s.category}</div>
                  <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, marginBottom: 10 }}>{s.description || "Ingen beskrivelse"}</p>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 4 }}>VERKTØY</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {s.config && typeof s.config === "object" && Array.isArray((s.config as Record<string, unknown>).tools)
                        ? ((s.config as Record<string, unknown>).tools as string[]).map(t => (<Tag key={t}>{t}</Tag>))
                        : <span style={{ fontSize: 11, color: T.textFaint, fontFamily: T.mono }}>Se serverens verktøy</span>
                      }
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isInstalled ? (
                      <>
                        <Btn sm onClick={() => handleConfigure(s.name)}>Konfigurer</Btn>
                        <Btn sm style={{ color: T.error, borderColor: "rgba(99,102,241,0.3)" }} onClick={() => handleUninstall(s.id)}>Avinstaller</Btn>
                      </>
                    ) : (
                      <Btn sm primary onClick={() => handleInstall(s.id)}>Installer</Btn>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </GR>
    </>
  );
}
