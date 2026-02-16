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
          <div className="skeleton" style={{ width: "90px", height: "24px" }} />
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-6">
        {/* 4 stat boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", padding: "16px" }}>
              <div className="skeleton" style={{ width: "100px", height: "12px", marginBottom: "8px" }} />
              <div className="skeleton" style={{ width: "60px", height: "24px" }} />
            </div>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-3 mt-8 mb-4">
          <div className="skeleton" style={{ width: "180px", height: "40px" }} />
          <div className="skeleton" style={{ width: "80px", height: "20px", alignSelf: "center" }} />
          <div className="skeleton" style={{ width: "80px", height: "36px" }} />
        </div>

        {/* Audit table */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ border: "1px solid var(--border)" }}
            >
              <div className="skeleton" style={{ width: "8px", height: "8px", flexShrink: 0 }} />
              <div className="skeleton" style={{ width: `${150 + i * 12}px`, height: "14px", flex: 1 }} />
              <div className="skeleton" style={{ width: "60px", height: "18px", flexShrink: 0 }} />
              <div className="skeleton" style={{ width: "40px", height: "12px", flexShrink: 0 }} />
              <div className="skeleton" style={{ width: "80px", height: "12px", flexShrink: 0 }} />
              <div className="skeleton" style={{ width: "12px", height: "12px", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
