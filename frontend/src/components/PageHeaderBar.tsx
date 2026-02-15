"use client";

interface HeaderCell {
  label: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

interface PageHeaderBarProps {
  title: string;
  cells?: HeaderCell[];
  actions?: React.ReactNode;
}

export function PageHeaderBar({ title, cells, actions }: PageHeaderBarProps) {
  return (
    <div className="flex items-stretch" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}>
      {/* Title cell */}
      <div className="flex items-center px-5" style={{ borderRight: cells?.length ? "1px solid var(--border)" : "none" }}>
        <h1 className="font-display text-xl whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
      </div>

      {/* Tab cells */}
      {cells?.map((cell, i) => (
        <div
          key={i}
          onClick={cell.onClick || undefined}
          className="flex items-center px-4 cursor-pointer transition-colors"
          style={{
            borderRight: "1px solid var(--border)",
            background: cell.active ? "rgba(255, 255, 255, 0.06)" : "transparent",
            color: cell.active ? "var(--text-primary)" : "var(--text-muted)",
            borderBottom: cell.active ? "2px solid var(--text-primary)" : "2px solid transparent",
          }}
        >
          {cell.href ? (
            <a href={cell.href} className="text-sm font-medium whitespace-nowrap" style={{ color: "inherit" }}>
              {cell.label}
            </a>
          ) : (
            <span className="text-sm font-medium whitespace-nowrap">{cell.label}</span>
          )}
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions on the right */}
      {actions && (
        <div className="flex items-center px-4" style={{ borderLeft: "1px solid var(--border)" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
