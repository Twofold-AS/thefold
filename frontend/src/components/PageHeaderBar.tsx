"use client";

interface HeaderCell {
  content: React.ReactNode;
  width?: string;
  minWidth?: string;
  onClick?: () => void;
  className?: string;
}

interface PageHeaderBarProps {
  title: string;
  subtitle?: string;
  cells?: HeaderCell[];
  rightCells?: HeaderCell[];
}

export function PageHeaderBar({ title, subtitle, cells, rightCells }: PageHeaderBarProps) {
  return (
    <div className="flex items-stretch flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}>
      {/* Title cell */}
      <div
        className="flex items-center px-5 shrink-0"
        style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
      >
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
      </div>

      {/* Additional cells */}
      {cells?.map((cell, i) => (
        <div
          key={i}
          className={`flex items-center px-4 shrink-0 ${cell.onClick ? "cursor-pointer hover:bg-white/5 transition-colors" : ""} ${cell.className || ""}`}
          style={{
            borderRight: "1px solid var(--border)",
            width: cell.width,
            minWidth: cell.minWidth,
          }}
          onClick={cell.onClick}
        >
          {cell.content}
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-aligned cells */}
      {rightCells?.map((cell, i) => (
        <div
          key={i}
          className={`flex items-center px-4 shrink-0 ${cell.onClick ? "cursor-pointer hover:bg-white/5 transition-colors" : ""} ${cell.className || ""}`}
          style={{
            borderLeft: "1px solid var(--border)",
            width: cell.width,
            minWidth: cell.minWidth,
          }}
          onClick={cell.onClick}
        >
          {cell.content}
        </div>
      ))}
    </div>
  );
}
