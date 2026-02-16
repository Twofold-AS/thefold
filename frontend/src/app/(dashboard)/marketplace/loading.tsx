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

      <div className="p-6">
        {/* Search + filter bar */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <div className="skeleton" style={{ flex: 1, minWidth: "200px", height: "40px" }} />
          <div className="flex gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ width: "60px", height: "36px" }} />
            ))}
          </div>
        </div>

        {/* 3x3 grid of cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{ border: "1px solid var(--border)", padding: "16px" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="skeleton" style={{ width: `${100 + i * 10}px`, height: "14px", marginBottom: "8px" }} />
                  <div className="skeleton" style={{ width: "100%", height: "12px", marginBottom: "4px" }} />
                  <div className="skeleton" style={{ width: "70%", height: "12px" }} />
                </div>
                <div className="skeleton" style={{ width: "30px", height: "12px", flexShrink: 0 }} />
              </div>
              <div className="flex gap-1.5 mt-3">
                <div className="skeleton" style={{ width: "40px", height: "18px" }} />
                <div className="skeleton" style={{ width: "50px", height: "18px" }} />
                <div className="skeleton" style={{ width: "45px", height: "18px" }} />
              </div>
              <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex gap-3">
                  <div className="skeleton" style={{ width: "40px", height: "10px" }} />
                  <div className="skeleton" style={{ width: "35px", height: "10px" }} />
                  <div className="skeleton" style={{ width: "45px", height: "10px" }} />
                </div>
                <div className="skeleton" style={{ width: "55px", height: "16px" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
