"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label?: string };
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ label, value, subtitle, trend, icon, className }: MetricCardProps) {
  const trendDirection = trend ? (trend.value > 0 ? "up" : trend.value < 0 ? "down" : "flat") : null;

  return (
    <div className={cn("widget-compact", className)}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--tf-text-muted)" }}>
          {label}
        </span>
        {icon && <div style={{ color: "var(--tf-text-faint)" }}>{icon}</div>}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-display-md tabular-nums">{value}</p>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: "var(--tf-text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 text-xs font-medium"
            style={{
              color: trendDirection === "up"
                ? "var(--tf-success)"
                : trendDirection === "down"
                  ? "var(--tf-error)"
                  : "var(--tf-text-muted)",
            }}
          >
            {trendDirection === "up" && <TrendingUp className="w-3.5 h-3.5" />}
            {trendDirection === "down" && <TrendingDown className="w-3.5 h-3.5" />}
            {trendDirection === "flat" && <Minus className="w-3.5 h-3.5" />}
            <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
            {trend.label && (
              <span style={{ color: "var(--tf-text-faint)" }}>{trend.label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
