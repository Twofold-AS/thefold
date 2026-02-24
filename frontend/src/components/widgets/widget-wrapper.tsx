"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetWrapperProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  error?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function WidgetWrapper({
  title,
  subtitle,
  icon,
  action,
  loading,
  error,
  collapsible,
  defaultExpanded = true,
  className,
  headerClassName,
  bodyClassName,
  children,
}: WidgetWrapperProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={cn("widget", className)}>
      <div className={cn("widget-header", headerClassName)}>
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <div style={{ color: "var(--tf-text-muted)" }}>{icon}</div>}
          <div className="min-w-0">
            <h3
              className="text-sm font-medium truncate"
              style={{ color: "var(--tf-text-primary)" }}
            >
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--tf-text-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          {collapsible && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded transition-colors hover:bg-[var(--tf-surface-raised)]"
              style={{ color: "var(--tf-text-muted)" }}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {(!collapsible || expanded) && (
        <div className={cn("widget-body", bodyClassName)}>
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--tf-error)" }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
