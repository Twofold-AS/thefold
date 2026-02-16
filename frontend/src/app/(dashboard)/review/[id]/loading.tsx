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
          <div className="skeleton" style={{ width: "80px", height: "24px" }} />
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Back link + title */}
        <div className="flex items-center justify-between">
          <div>
            <div className="skeleton" style={{ width: "130px", height: "12px", marginBottom: "8px" }} />
            <div className="skeleton" style={{ width: "260px", height: "24px", marginBottom: "6px" }} />
            <div className="skeleton" style={{ width: "160px", height: "14px" }} />
          </div>
          <div className="skeleton" style={{ width: "70px", height: "22px" }} />
        </div>

        {/* AI Review card */}
        <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
          <div className="skeleton" style={{ width: "80px", height: "14px", marginBottom: "12px" }} />
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="skeleton" style={{ width: "50px", height: "12px", marginBottom: "6px" }} />
              <div className="skeleton" style={{ width: "50px", height: "28px" }} />
            </div>
            <div>
              <div className="skeleton" style={{ width: "80px", height: "12px", marginBottom: "6px" }} />
              <div className="skeleton" style={{ width: "30px", height: "28px" }} />
            </div>
          </div>
          <div className="skeleton" style={{ width: "80px", height: "12px", marginBottom: "8px" }} />
          <div className="skeleton" style={{ width: "100%", height: "12px", marginBottom: "4px" }} />
          <div className="skeleton" style={{ width: "80%", height: "12px" }} />
        </div>

        {/* File viewer */}
        <div style={{ border: "1px solid var(--border)" }}>
          {/* File tabs */}
          <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-3 py-2"
                style={{ borderRight: "1px solid var(--border)" }}
              >
                <div className="skeleton" style={{ width: "12px", height: "12px" }} />
                <div className="skeleton" style={{ width: `${80 + i * 30}px`, height: "12px" }} />
              </div>
            ))}
          </div>
          {/* File content area */}
          <div style={{ padding: "16px" }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ width: `${60 + Math.random() * 40}%`, height: "14px", marginBottom: "6px" }} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ border: "1px solid var(--border)", padding: "20px" }}>
          <div className="skeleton" style={{ width: "90px", height: "14px", marginBottom: "16px" }} />
          <div className="skeleton" style={{ width: "100%", height: "72px", marginBottom: "16px" }} />
          <div className="flex gap-3">
            <div className="skeleton" style={{ width: "90px", height: "36px" }} />
            <div className="skeleton" style={{ width: "120px", height: "36px" }} />
            <div className="skeleton" style={{ width: "70px", height: "36px" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
