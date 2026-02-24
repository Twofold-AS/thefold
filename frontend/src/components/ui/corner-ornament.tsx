"use client";

/**
 * Firecrawl-style corner ornament SVG — a decorative crosshair shape
 * placed at intersections of grid/section borders.
 *
 * Usage: Place inside a `relative` container with `h-px bg-border` lines,
 * and position with absolute classes like `-top-[10px] -left-[11px]`.
 */
export function CornerOrnament({ className = "" }: { className?: string }) {
  return (
    <svg
      fill="none"
      height="21"
      viewBox="0 0 22 21"
      width="22"
      xmlns="http://www.w3.org/2000/svg"
      className={`pointer-events-none absolute ${className}`}
    >
      <path
        d="M10.5 4C10.5 7.31371 7.81371 10 4.5 10H0.5V11H4.5C7.81371 11 10.5 13.6863 10.5 17V21H11.5V17C11.5 13.6863 14.1863 11 17.5 11H21.5V10H17.5C14.1863 10 11.5 7.31371 11.5 4V0H10.5V4Z"
        fill="var(--tf-border-faint)"
      />
    </svg>
  );
}

/**
 * A section wrapper that adds Firecrawl-style horizontal border lines
 * with corner ornaments at all four corners.
 */
export function GridSection({
  children,
  className = "",
  showTop = true,
  showBottom = true,
}: {
  children: React.ReactNode;
  className?: string;
  showTop?: boolean;
  showBottom?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      {showTop && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "var(--tf-border-faint)" }}
          />
          <CornerOrnament className="-top-[10px] -left-[11px]" />
          <CornerOrnament className="-top-[10px] -right-[11px]" />
        </>
      )}
      {children}
      {showBottom && (
        <>
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: "var(--tf-border-faint)" }}
          />
          <CornerOrnament className="-bottom-[10px] -left-[11px]" />
          <CornerOrnament className="-bottom-[10px] -right-[11px]" />
        </>
      )}
    </div>
  );
}
