"use client";

import { useState, useMemo } from "react";
import { T } from "@/lib/tokens";
import { GR } from "@/components/GridRow";
import PixelCorners from "@/components/PixelCorners";
import Btn from "@/components/Btn";
import Tag from "@/components/Tag";
import { useApiData } from "@/lib/hooks";
import { listComponents, useComponentApi, Component } from "@/lib/api";

export default function KomponenterPage() {
  const { data, loading, refresh } = useApiData(() => listComponents(), []);
  const [fi, setFi] = useState("all");
  const [se, setSe] = useState("");

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
      // Match by category or by tags containing the filter
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
      <div style={{ paddingTop: 40 }}>
        <div
          style={{
            fontSize: 13,
            color: T.textMuted,
            fontFamily: T.mono,
            padding: "40px 0",
            textAlign: "center",
          }}
        >
          Laster komponenter...
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ paddingTop: 40, paddingBottom: 24 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: T.text,
            letterSpacing: "-0.03em",
            fontFamily: T.brandFont,
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
          <PixelCorners />
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
            placeholder="S\u00f8k..."
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
            border: `1px solid ${T.border}`,
            borderTop: "none",
            borderRadius: `0 0 ${T.r}px ${T.r}px`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <PixelCorners />
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
                      fontFamily: T.brandFont,
                    }}
                  >
                    {c.name}
                  </span>
                  <Tag variant={statusVariant(c.validationStatus)}>
                    {c.validationStatus}
                  </Tag>
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
                    <Btn
                      sm
                      primary
                      onClick={async () => {
                        try {
                          await useComponentApi(c.id, "thefold-api");
                          refresh();
                        } catch {
                          alert("Kunne ikke bruke komponent");
                        }
                      }}
                    >
                      Bruk
                    </Btn>
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
