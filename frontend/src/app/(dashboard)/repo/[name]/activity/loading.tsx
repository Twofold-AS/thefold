export default function Loading() {
  return (
    <div>
      {/* Header: title cell */}
      <div
        className="flex items-stretch flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div>
            <div className="skeleton" style={{ width: "90px", height: "24px", marginBottom: "4px" }} />
            <div className="skeleton" style={{ width: "100px", height: "12px" }} />
          </div>
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-6">
        {/* Timeline with date header + 5 event rows, repeated for 2 dates */}
        <div className="mt-6 space-y-8">
          {Array.from({ length: 2 }).map((_, dateIdx) => (
            <div key={dateIdx}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="skeleton" style={{ width: "140px", height: "14px" }} />
                <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                <div className="skeleton" style={{ width: "70px", height: "10px" }} />
              </div>

              {/* Event rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "8px" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 py-2 px-3"
                  >
                    {/* Icon */}
                    <div className="skeleton" style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "2px" }} />
                    {/* Time */}
                    <div className="skeleton" style={{ width: "40px", height: "11px", flexShrink: 0, marginTop: "2px" }} />
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="skeleton" style={{ width: `${140 + i * 20}px`, height: "12px", marginBottom: "4px" }} />
                      <div className="skeleton" style={{ width: `${100 + i * 15}px`, height: "11px" }} />
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
