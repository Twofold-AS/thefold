export default function Loading() {
  return (
    <div>
      {/* Header: title cell + 2 right cells */}
      <div
        className="flex items-stretch flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        {/* Title cell */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div>
            <div className="skeleton" style={{ width: "90px", height: "24px", marginBottom: "4px" }} />
            <div className="skeleton" style={{ width: "100px", height: "12px" }} />
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cell: Sync button */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "110px", height: "14px" }} />
        </div>

        {/* Right cell: New task button */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="skeleton" style={{ width: "90px", height: "14px" }} />
        </div>
      </div>

      <div className="p-6">
        {/* Filter bar */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="skeleton" style={{ width: "100px", height: "14px" }} />
          <div className="flex items-center gap-2">
            <div className="skeleton" style={{ width: "100px", height: "32px" }} />
            <div className="skeleton" style={{ width: "100px", height: "32px" }} />
          </div>
        </div>

        {/* 3-column kanban grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {Array.from({ length: 6 }).map((_, colIdx) => (
            <div
              key={colIdx}
              style={{ border: "1px solid var(--border)", padding: "12px" }}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="skeleton" style={{ width: "8px", height: "8px" }} />
                <div className="skeleton" style={{ width: "60px", height: "12px" }} />
                <div style={{ marginLeft: "auto" }}>
                  <div className="skeleton" style={{ width: "20px", height: "16px" }} />
                </div>
              </div>

              {/* Task cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Array.from({ length: colIdx < 3 ? 2 : 1 }).map((_, cardIdx) => (
                  <div
                    key={cardIdx}
                    style={{ border: "1px solid var(--border)", padding: "10px" }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="skeleton" style={{ width: "8px", height: "8px", marginTop: "4px", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="skeleton" style={{ width: `${100 + cardIdx * 30}px`, height: "12px", marginBottom: "6px" }} />
                        <div className="flex items-center gap-2">
                          <div className="skeleton" style={{ width: "50px", height: "10px" }} />
                          <div className="skeleton" style={{ width: "40px", height: "14px" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
