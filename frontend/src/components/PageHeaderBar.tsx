"use client";

interface PageHeaderBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeaderBar({ title, subtitle, actions }: PageHeaderBarProps) {
  return (
    <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px", padding: "0 20px" }}>
      {/* Title + subtitle */}
      <div>
        <h1 className="font-display text-xl" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Actions on the right */}
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
