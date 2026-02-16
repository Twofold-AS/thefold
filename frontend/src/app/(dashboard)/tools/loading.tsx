export default function Loading() {
  return (
    <div>
      {/* Header with 9 tab cells */}
      <div
        className="flex items-stretch flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        {/* Title cell */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div className="skeleton" style={{ width: "60px", height: "24px" }} />
        </div>

        {/* 9 tab cells */}
        {[80, 60, 70, 55, 40, 90, 85, 60, 75].map((w, i) => (
          <div
            key={i}
            className="flex items-center px-4 shrink-0"
            style={{ borderRight: "1px solid var(--border)" }}
          >
            <div className="skeleton" style={{ width: `${w}px`, height: "14px" }} />
          </div>
        ))}

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* Content area */}
      <div className="p-6">
        {/* Sub-header */}
        <div className="flex items-center justify-between mb-6">
          <div className="skeleton" style={{ width: "180px", height: "16px" }} />
          <div className="skeleton" style={{ width: "100px", height: "36px" }} />
        </div>

        {/* Content cards */}
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ border: "1px solid var(--border)", padding: "20px" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="skeleton" style={{ width: `${120 + i * 20}px`, height: "14px" }} />
                <div className="skeleton" style={{ width: "60px", height: "20px" }} />
              </div>
              <div className="skeleton" style={{ width: "100%", height: "12px", marginBottom: "4px" }} />
              <div className="skeleton" style={{ width: "60%", height: "12px" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
