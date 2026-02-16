export default function Loading() {
  return (
    <div>
      {/* Header */}
      <div
        className="flex items-stretch"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "80px" }}
      >
        <div
          className="flex items-center px-5 shrink-0"
          style={{ borderRight: "1px solid var(--border)", minWidth: "180px" }}
        >
          <div className="skeleton" style={{ width: "130px", height: "24px" }} />
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Back link */}
        <div className="skeleton" style={{ width: "140px", height: "12px" }} />

        {/* Detail card */}
        <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: "200px", height: "24px", marginBottom: "8px" }} />
              <div className="skeleton" style={{ width: "100%", height: "14px", marginBottom: "4px" }} />
              <div className="skeleton" style={{ width: "60%", height: "14px" }} />
            </div>
            <div className="skeleton" style={{ width: "80px", height: "36px", flexShrink: 0 }} />
          </div>

          {/* Badges */}
          <div className="flex gap-2 mb-4">
            <div className="skeleton" style={{ width: "50px", height: "20px" }} />
            <div className="skeleton" style={{ width: "60px", height: "20px" }} />
            <div className="skeleton" style={{ width: "45px", height: "20px" }} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-6" style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton" style={{ width: "60px", height: "10px", marginBottom: "6px" }} />
                <div className="skeleton" style={{ width: "40px", height: "20px" }} />
              </div>
            ))}
          </div>

          {/* Files section */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
            <div className="skeleton" style={{ width: "60px", height: "14px", marginBottom: "12px" }} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="skeleton" style={{ width: "14px", height: "14px", flexShrink: 0 }} />
                <div className="skeleton" style={{ width: `${180 + i * 30}px`, height: "12px" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Healing events */}
        <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
          <div className="skeleton" style={{ width: "140px", height: "16px", marginBottom: "16px" }} />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="skeleton" style={{ width: "8px", height: "8px", flexShrink: 0 }} />
              <div className="skeleton" style={{ width: `${200 + i * 30}px`, height: "12px" }} />
              <div className="skeleton" style={{ width: "80px", height: "12px", marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
