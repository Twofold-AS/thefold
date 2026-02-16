"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getCostSummary,
  type CostSummary,
  type DailyTrend,
} from "@/lib/api";
import { PageHeaderBar } from "@/components/PageHeaderBar";

export default function CostsPage() {
  const [data, setData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCostSummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeaderBar
          title="Kostnader"
          actions={
            <Link href="/settings" className="text-sm" style={{ color: "var(--text-muted)" }}>
              Tilbake til Settings
            </Link>
          }
        />
        <div className="flex items-center justify-center py-20">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--text-secondary)" }}
          />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeaderBar title="Kostnader" />
        <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
          Kunne ikke hente kostnadsdata.
        </div>
      </div>
    );
  }

  const maxDaily = Math.max(...data.dailyTrend.map((d) => d.total), 0.01);

  return (
    <div>
      <PageHeaderBar
        title="Kostnader"
        actions={
          <Link href="/settings" className="text-sm" style={{ color: "var(--text-muted)" }}>
            Tilbake til Settings
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CostCard label="I dag" cost={data.today.total} tokens={data.today.tokens} count={data.today.count} />
          <CostCard label="Denne uken" cost={data.thisWeek.total} tokens={data.thisWeek.tokens} count={data.thisWeek.count} />
          <CostCard label="Denne maneden" cost={data.thisMonth.total} tokens={data.thisMonth.tokens} count={data.thisMonth.count} />
        </div>

        {/* Per-model table */}
        {data.perModel.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Per modell (denne maneden)
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Modell</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Kall</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Tokens</th>
                  <th className="text-right px-4 py-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Kostnad</th>
                </tr>
              </thead>
              <tbody>
                {data.perModel.map((m) => (
                  <tr key={m.model} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--text-primary)" }}>{m.model}</td>
                    <td className="px-4 py-2 text-right text-xs" style={{ color: "var(--text-secondary)" }}>{m.count}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{m.tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs font-medium" style={{ color: "var(--text-primary)" }}>${m.total.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 14-day trend */}
        {data.dailyTrend.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Siste 14 dager
              </h2>
            </div>
            <div className="px-4 py-4">
              <div className="flex items-end gap-1" style={{ height: "120px" }}>
                {data.dailyTrend.map((d) => (
                  <DailyBar key={d.date} day={d} maxValue={maxDaily} />
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                  {data.dailyTrend[0]?.date.substring(5)}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                  {data.dailyTrend[data.dailyTrend.length - 1]?.date.substring(5)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CostCard({ label, cost, tokens, count }: { label: string; cost: number; tokens: number; count: number }) {
  return (
    <div className="p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-2xl font-semibold font-mono" style={{ color: "var(--text-primary)" }}>
        ${cost.toFixed(2)}
      </p>
      <div className="flex gap-3 mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>{tokens.toLocaleString()} tokens</span>
        <span>{count} kall</span>
      </div>
    </div>
  );
}

function DailyBar({ day, maxValue }: { day: DailyTrend; maxValue: number }) {
  const height = maxValue > 0 ? (day.total / maxValue) * 100 : 0;
  return (
    <div className="flex-1 flex flex-col items-center justify-end" style={{ height: "100%" }}>
      <div
        className="w-full transition-all"
        style={{
          height: `${Math.max(height, 2)}%`,
          background: day.total > 5 ? "#ef4444" : day.total > 1 ? "#eab308" : "var(--accent)",
          minHeight: "2px",
        }}
        title={`${day.date}: $${day.total.toFixed(4)} (${day.tokens} tokens)`}
      />
    </div>
  );
}
