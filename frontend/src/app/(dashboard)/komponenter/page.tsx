"use client";

import { useState, useMemo } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import Skeleton from "@/components/Skeleton";
import { useApiData } from "@/lib/hooks";
import { listComponents, healComponent, Component } from "@/lib/api";

export default function KomponenterPage() {
  const { data, loading, refresh } = useApiData(() => listComponents(), []);
  const [fi, setFi] = useState("all");
  const [se, setSe] = useState("");
  const [healStatus, setHealStatus] = useState<Record<string, string>>({});

  const components: Component[] = data?.components ?? [];

  const fl = useMemo(() => {
    return components.filter((c) => {
      if (
        se &&
        !c.name.toLowerCase().includes(se.toLowerCase()) &&
        !(c.description ?? "").toLowerCase().includes(se.toLowerCase())
      )
        return false;
      if (fi === "all") return true;
      if (c.category?.toLowerCase() === fi) return true;
      return (c.tags ?? []).some((tag) => tag.toLowerCase() === fi);
    });
  }, [components, se, fi]);

  const statusVariant = (s: string) => {
    if (s === "stable" || s === "valid" || s === "validated") return "success" as const;
    if (s === "beta" || s === "pending") return "accent" as const;
    return "default" as const;
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
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: T.text,
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}
        >
          Komponenter
        </h2>
        <p style={{ fontSize: 13, color: T.textMuted }}>
          Gjenbrukbare komponenter fra registry.
        </p>
      </div>

      {/* Search bar */}
      <GR>
        <div
          style={{
            border: `1px solid ${T.border}`,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke={T.textMuted}
            strokeWidth="1.3"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3.5 3.5" />
          </svg>
          <input
            value={se}
            onChange={(e) => setSe(e.target.value)}
            placeholder="Søk..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: T.text,
              fontSize: 13,
              fontFamily: T.sans,
            }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {["all", "frontend", "backend"].map((f) => (
              <div
                key={f}
                onClick={() => setFi(f)}
                style={{
                  fontSize: 11,
                  fontFamily: T.mono,
                  padding: "4px 10px",
                  background: fi === f ? T.subtle : "transparent",
                  color: fi === f ? T.text : T.textMuted,
                  cursor: "pointer",
                  border: `1px solid ${fi === f ? T.border : "transparent"}`,
                  borderRadius: 6,
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
      </GR>

      {/* Component grid */}
      <GR mb={40}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            marginTop: 20,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {fl.length === 0 && (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "40px 20px",
                fontSize: 12,
                color: T.textMuted,
                textAlign: "center",
              }}
            >
              Ingen komponenter funnet
            </div>
          )}
          {fl.map((c, i) => {
            const ir = i % 2 === 1;
            const nl =
              i < fl.length - 2 || (fl.length % 2 === 1 && i < fl.length - 1);

            const qs = c.qualityScore;
            const qsVariant = qs == null ? "default" as const : qs >= 80 ? "success" as const : qs >= 50 ? "accent" as const : "error" as const;
            const qsLabel = qs == null ? "—" : `${qs}%`;

            return (
              <div
                key={c.id}
                style={{
                  padding: 24,
                  borderRight: ir ? "none" : `1px solid ${T.border}`,
                  borderBottom: nl ? `1px solid ${T.border}` : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: T.text,
                    }}
                  >
                    {c.name}
                  </span>
                  <Tag variant={statusVariant(c.validationStatus)}>
                    {c.validationStatus}
                  </Tag>
                  <Tag variant={qsVariant}>{qsLabel}</Tag>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: T.textMuted,
                    lineHeight: 1.5,
                    marginBottom: 12,
                  }}
                >
                  {c.description ?? ""}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", gap: 4 }}>
                    {(c.tags ?? []).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.textFaint }}>
                      {c.timesUsed}
                    </span>
                    {healStatus[c.id] ? (
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: healStatus[c.id] === "healed" ? T.success : healStatus[c.id] === "skipped" ? T.textMuted : T.error }}>
                        {healStatus[c.id] === "healed" ? "Oppdatert \u2713" : healStatus[c.id] === "skipped" ? "Allerede oppdatert" : "Feil ved oppdatering"}
                      </span>
                    ) : (
                      <Btn
                        sm
                        primary
                        onClick={async () => {
                          try {
                            const result = await healComponent(c.id);
                            setHealStatus(prev => ({ ...prev, [c.id]: result.action || "healed" }));
                            refresh();
                          } catch {
                            setHealStatus(prev => ({ ...prev, [c.id]: "failed" }));
                          }
                        }}
                      >
                        Oppdater
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GR>
    </>
  );
}
