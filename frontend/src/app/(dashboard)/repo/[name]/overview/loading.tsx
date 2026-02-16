export default function Loading() {
  return (
    <div>
      {/* Header: title cell + right health cell */}
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
            <div className="skeleton" style={{ width: "80px", height: "24px", marginBottom: "4px" }} />
            <div className="skeleton" style={{ width: "100px", height: "12px" }} />
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cell: health status */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <div className="skeleton" style={{ width: "8px", height: "8px" }} />
            <div className="skeleton" style={{ width: "90px", height: "14px" }} />
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* 4 stat boxes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", padding: "16px" }}>
              <div className="skeleton" style={{ width: "80px", height: "11px", marginBottom: "8px" }} />
              <div className="skeleton" style={{ width: "50px", height: "22px" }} />
            </div>
          ))}
        </div>

        {/* Shortcuts 2x2 grid */}
        <div className="mt-6" style={{ border: "1px solid var(--border)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="skeleton" style={{ width: "80px", height: "14px" }} />
          </div>
          <div className="grid grid-cols-2 gap-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3"
                style={{
                  borderRight: i % 2 === 0 ? "1px solid var(--border)" : "none",
                  borderBottom: i < 2 ? "1px solid var(--border)" : "none",
                }}
              >
                <div className="skeleton" style={{ width: `${80 + i * 15}px`, height: "14px" }} />
              </div>
            ))}
          </div>
        </div>

        {/* 2-column cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Active tasks card */}
          <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="skeleton" style={{ width: "120px", height: "14px" }} />
              <div className="skeleton" style={{ width: "50px", height: "11px" }} />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-1.5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="skeleton" style={{ width: "8px", height: "8px", flexShrink: 0 }} />
                <div className="skeleton" style={{ width: `${140 + i * 20}px`, height: "12px", flex: 1 }} />
                <div className="skeleton" style={{ width: "60px", height: "10px", flexShrink: 0 }} />
              </div>
            ))}
          </div>

          {/* Recent reviews card */}
          <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="skeleton" style={{ width: "110px", height: "14px" }} />
              <div className="skeleton" style={{ width: "50px", height: "11px" }} />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-1.5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="skeleton" style={{ width: "8px", height: "8px", flexShrink: 0 }} />
                <div className="skeleton" style={{ width: `${120 + i * 15}px`, height: "12px", flex: 1 }} />
                <div className="skeleton" style={{ width: "40px", height: "10px", flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity card */}
        <div className="mt-6" style={{ border: "1px solid var(--border)", padding: "20px" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="skeleton" style={{ width: "120px", height: "14px" }} />
            <div className="skeleton" style={{ width: "50px", height: "11px" }} />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-1.5"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="skeleton" style={{ width: "40px", height: "10px", flexShrink: 0 }} />
              <div className="skeleton" style={{ width: `${160 + i * 15}px`, height: "12px", flex: 1 }} />
              <div className="skeleton" style={{ width: "6px", height: "6px", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
